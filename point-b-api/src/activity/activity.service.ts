import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth';
import { locate } from '../common/geo';
import { TrackDto } from './activity.dto';

/** Events older than this are deleted: enough to follow up on people, without keeping browsing history forever. */
const RETENTION_DAYS = 90;
const DAY = 86_400_000;
/** A gap this long between a person's events starts a new visit. */
const VISIT_GAP = 30 * 60_000;
const MENTOR_PAGE = /^\/mentors\/[^/]+$/;

export type TriggerKind = 'awaiting_payment' | 'payment_abandoned' | 'payment_failed' | 'bank_pending' | 'booking_abandoned' | 'guest_booking' | 'application_abandoned' | 'high_interest' | 'never_booked' | 'mentor_stuck';
export interface Trigger { id: string; kind: TriggerKind; severity: 'high' | 'medium' | 'low'; userId: string; name: string; email: string; title: string; detail: string; at: Date; reference?: string }

const cleanPage = (p?: string) => (p ? p.split(/[?#]/)[0].slice(0, 200) : undefined);
const guestName = (visitorId: string) => `Guest ${visitorId.slice(0, 4).toUpperCase()}`;
/** One person across their events: their account if they have one, otherwise their browser. */
const who = (e: { userId: string | null; visitorId: string | null }) => e.userId ?? `guest:${e.visitorId}`;

/** Can happen with nobody on the site (a hold lapsing, an admin approving a payment), so they never count as someone visiting. */
const SYSTEM_EVENTS = ['hold_expired', 'payment_succeeded', 'booking_cancelled', 'bank_transfer_rejected'];
const isVisit = (e: { type: string }) => !SYSTEM_EVENTS.includes(e.type);

const FUNNEL = ['Visited the site', 'Viewed a mentor', 'Started booking', 'Signed in', 'Reached payment', 'Tried to pay', 'Paid'];

@Injectable()
export class ActivityService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Activity');
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.prune().catch((e) => this.log.warn(`prune failed: ${e.message}`)), 6 * 3600_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private prune() {
    return this.prisma.activityEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * DAY) } } });
  }

  /** Records a server-side event. Tracking must never break the action being tracked, so failures are only logged. */
  record(userId: string, type: string, opts: { label?: string; reference?: string; page?: string } = {}) {
    this.prisma.activityEvent.create({ data: { userId, visitorId: null, type, label: opts.label?.slice(0, 140), reference: opts.reference, page: cleanPage(opts.page) } })
      .catch((e) => this.log.warn(`could not record ${type}: ${e.message}`));
  }

  /** Events sent by the browser. Admins aren't tracked: their actions are already in the audit log. */
  async track(user: AuthUser | undefined, dto: TrackDto, ip: string | null = null) {
    if (user?.role === 'ADMIN' || (!user && !dto.visitorId)) return { ok: true };
    // Signing in links everything this browser did as a guest to the account.
    if (user && dto.visitorId) await this.prisma.activityEvent.updateMany({ where: { visitorId: dto.visitorId, userId: null }, data: { userId: user.id } });
    if (!dto.events.length) return { ok: true };
    const now = Date.now();
    const place = locate(ip);
    await this.prisma.activityEvent.createMany({
      // Spaced by a millisecond so a batch keeps its order.
      data: dto.events.map((e, i) => ({
        userId: user?.id ?? null, visitorId: dto.visitorId ?? null, type: e.type, page: cleanPage(e.page), label: e.label?.slice(0, 140), reference: e.reference,
        device: e.type === 'page_view' ? dto.device : undefined, referrer: e.type === 'page_view' ? dto.referrer : undefined,
        ...(ip ? { ip, ...place } : {}),
        createdAt: new Date(now - (dto.events.length - i)),
      })),
    });
    return { ok: true };
  }

  async overview(daysRaw = 30) {
    const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
    const now = Date.now();
    const day = new Date(now - DAY);
    // Newest first, so if the cap is ever reached it's the oldest events that are left out.
    const rows = (await this.prisma.activityEvent.findMany({ where: { createdAt: { gte: new Date(now - days * DAY) } }, orderBy: { createdAt: 'desc' }, take: 100_000, select: { userId: true, visitorId: true, type: true, page: true, createdAt: true } })).reverse();

    const byPerson = new Map<string, typeof rows>();
    for (const r of rows) (byPerson.get(who(r)) ?? byPerson.set(who(r), []).get(who(r))!).push(r);

    // A visit that ended without a payment and has gone quiet counts as a drop-off on its last page.
    const drop = new Map<string, number>();
    for (const list of byPerson.values()) {
      let visit: typeof rows = [];
      const close = () => {
        if (!visit.length) return;
        const quiet = now - visit[visit.length - 1].createdAt.getTime() > VISIT_GAP;
        const page = [...visit].reverse().find((e) => e.page)?.page;
        if (quiet && page && !visit.some((e) => e.type === 'payment_succeeded')) drop.set(page, (drop.get(page) ?? 0) + 1);
      };
      for (const r of list) {
        if (visit.length && r.createdAt.getTime() - visit[visit.length - 1].createdAt.getTime() > VISIT_GAP) { close(); visit = []; }
        visit.push(r);
      }
      close();
    }

    // Each person counts once, at every stage up to the furthest they reached.
    const stages = FUNNEL.map((label) => ({ label, count: 0, members: 0, guests: 0 }));
    for (const [key, list] of byPerson) {
      if (!list.some(isVisit)) continue;
      const has = (t: string) => list.some((e) => e.type === t);
      const member = !key.startsWith('guest:');
      const reached = has('payment_succeeded') ? 6 : has('payment_attempted') || has('bank_transfer_submitted') ? 5 : has('booking_held') ? 4
        : has('booking_started') ? (member ? 3 : 2) : list.some((e) => e.type === 'page_view' && MENTOR_PAGE.test(e.page ?? '')) ? 1 : 0;
      for (let i = 0; i <= reached; i++) { stages[i].count++; stages[i][member ? 'members' : 'guests']++; }
    }

    const today = await this.prisma.activityEvent.findMany({ where: { createdAt: { gte: day }, type: { notIn: SYSTEM_EVENTS } }, select: { userId: true, visitorId: true, type: true, createdAt: true } });
    const live = new Set(today.filter((e) => now - e.createdAt.getTime() < 5 * 60_000).map(who));
    const active = new Set(today.map(who));
    return {
      days,
      activeToday: active.size,
      guestsToday: [...active].filter((k) => k.startsWith('guest:')).length,
      liveNow: live.size,
      signInsToday: today.filter((r) => r.type === 'signed_in').length,
      triggers: await this.triggers(),
      dropOffs: [...drop.entries()].map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      funnel: stages,
    };
  }

  /** Who visits and from where: every visitor, and traffic, bookings and revenue by country. */
  async audience(daysRaw = 30) {
    const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
    const now = Date.now();
    const since = new Date(now - days * DAY);
    const rows = (await this.prisma.activityEvent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 100_000, select: { userId: true, visitorId: true, type: true, page: true, device: true, referrer: true, ip: true, country: true, city: true, createdAt: true } })).reverse();
    const byPerson = new Map<string, typeof rows>();
    for (const r of rows) (byPerson.get(who(r)) ?? byPerson.set(who(r), []).get(who(r))!).push(r);

    const [accounts, paid] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...byPerson.keys()].filter((k) => !k.startsWith('guest:')) } }, select: { id: true, name: true, email: true, role: true } }),
      this.prisma.booking.findMany({ where: { createdAt: { gte: since }, status: { in: ['CONFIRMED', 'COMPLETED'] } }, select: { studentId: true, priceMinor: true, currency: true, createdAt: true } }),
    ]);
    const account = new Map(accounts.map((a) => [a.id, a]));

    // A booking belongs to wherever the student was when they made it, or their nearest known location if that visit predates tracking.
    const students = [...new Set(paid.map((b) => b.studentId))];
    const located = students.length ? (await this.prisma.activityEvent.findMany({ where: { userId: { in: students } }, orderBy: { createdAt: 'asc' }, select: { userId: true, country: true, city: true, createdAt: true } })).filter((e) => e.country) : [];
    const placeAt = (studentId: string, at: Date) => {
      const mine = located.filter((e) => e.userId === studentId);
      return [...mine].reverse().find((e) => e.createdAt <= at) ?? mine[0] ?? null;
    };

    const regions = new Intl.DisplayNames(['en'], { type: 'region' });
    const countryName = (code: string) => { if (!code) return 'Not recorded'; try { return regions.of(code) ?? code; } catch { return code; } };
    type Bucket = { code: string; name: string; visitors: number; members: number; guests: number; visits: number; pageViews: number; bookings: number; payers: Set<string>; revenue: Map<string, number>; cities: Map<string, number> };
    const buckets = new Map<string, Bucket>();
    const bucket = (code: string) => {
      let b = buckets.get(code);
      if (!b) buckets.set(code, (b = { code, name: countryName(code), visitors: 0, members: 0, guests: 0, visits: 0, pageViews: 0, bookings: 0, payers: new Set(), revenue: new Map(), cities: new Map() }));
      return b;
    };
    const tally = (map: Map<string, number>, key: string, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

    const paidByStudent = new Map<string, number>();
    const revenue = new Map<string, number>();
    const allPayers = new Set<string>();
    for (const b of paid) {
      tally(paidByStudent, b.studentId);
      tally(revenue, b.currency, b.priceMinor);
      const c = bucket(placeAt(b.studentId, b.createdAt)?.country ?? '');
      c.bookings++;
      // "Visitors who paid" only counts people we saw visit before booking, so older bookings can't inflate the rate.
      if (byPerson.get(b.studentId)?.some((e) => e.createdAt <= b.createdAt)) { c.payers.add(b.studentId); allPayers.add(b.studentId); }
      tally(c.revenue, b.currency, b.priceMinor);
    }

    const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const daily = new Map<string, { visitors: Set<string>; pageViews: number }>();
    // One more than the period: a rolling window touches days + 1 calendar days, and every visit needs a bar.
    for (let i = days; i >= 0; i--) daily.set(dayKey(new Date(now - i * DAY)), { visitors: new Set(), pageViews: 0 });
    const devices = new Map<string, number>(), browsers = new Map<string, number>(), sources = new Map<string, number>(), cities = new Map<string, number>();
    const pages = new Map<string, { views: number; people: Set<string> }>();
    let visits = 0, pageViews = 0, seconds = 0;

    const visitors = [...byPerson].flatMap(([key, list]) => {
      const guest = key.startsWith('guest:');
      const user = guest ? null : account.get(key);
      const seen = list.filter(isVisit);
      if (!seen.length || (!guest && (!user || user.role === 'ADMIN'))) return [];
      let personVisits = 0, start = 0, previous = 0, views = 0;
      for (const e of seen) {
        const t = e.createdAt.getTime();
        if (!previous || t - previous > VISIT_GAP) { if (previous) seconds += (previous - start) / 1000; personVisits++; start = t; }
        previous = t;
        const today = daily.get(dayKey(e.createdAt));
        today?.visitors.add(key);
        if (e.type === 'page_view') {
          views++;
          if (today) today.pageViews++;
          if (e.page) { const p = pages.get(e.page) ?? { views: 0, people: new Set<string>() }; p.views++; p.people.add(key); pages.set(e.page, p); }
        }
      }
      seconds += (previous - start) / 1000;
      visits += personVisits;
      pageViews += views;

      const latest = <T>(pick: (e: (typeof list)[number]) => T | null | undefined) => { for (let i = list.length - 1; i >= 0; i--) { const v = pick(list[i]); if (v) return v; } return null; };
      const country = latest((e) => e.country);
      const city = latest((e) => (e.country === country ? e.city : null));
      const device = latest((e) => e.device);
      const source = list.find((e) => e.referrer)?.referrer ?? null;
      const [kind, browser] = (device ?? '').split(' · ');
      tally(devices, kind || 'Unknown');
      tally(browsers, browser || 'Unknown');
      tally(sources, source ?? 'Direct');

      const c = bucket(country ?? '');
      c.visitors++;
      c[guest ? 'guests' : 'members']++;
      c.visits += personVisits;
      c.pageViews += views;
      if (city) { tally(c.cities, city); tally(cities, `${city}|${c.code}`); }

      return [{
        id: key, name: user?.name ?? guestName(key.slice(6)), email: user?.email ?? '', role: user?.role ?? 'GUEST',
        ip: latest((e) => e.ip), country: country ?? '', countryName: countryName(country ?? ''), city, device, source,
        visits: personVisits, pageViews: views, bookings: paidByStudent.get(key) ?? 0, firstSeen: seen[0].createdAt, lastSeen: seen[seen.length - 1].createdAt, lastPage: latest((e) => e.page),
      }];
    }).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());

    const ranked = (map: Map<string, number>) => [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const money = (map: Map<string, number>) => [...map].map(([currency, amountMinor]) => ({ currency, amountMinor }));
    const countries = [...buckets.values()]
      .map(({ payers, revenue: earned, cities: places, ...b }) => ({ ...b, payers: payers.size, conversion: b.visitors ? Math.min(100, (payers.size / b.visitors) * 100) : 0, revenue: money(earned), cities: ranked(places).slice(0, 8) }))
      .sort((a, b) => Number(!a.code) - Number(!b.code) || b.visitors - a.visitors || b.bookings - a.bookings);
    const members = visitors.filter((v) => v.role !== 'GUEST').length;

    return {
      days,
      totals: {
        visitors: visitors.length, members, guests: visitors.length - members, returning: visitors.filter((v) => v.visits > 1).length,
        visits, pageViews, pagesPerVisit: visits ? pageViews / visits : 0, avgVisitSeconds: visits ? seconds / visits : 0,
        countries: countries.filter((c) => c.code && c.visitors).length, located: visitors.filter((v) => v.country).length,
        bookings: paid.length, conversion: visitors.length ? Math.min(100, (allPayers.size / visitors.length) * 100) : 0, revenue: money(revenue),
      },
      countries,
      cities: ranked(cities).slice(0, 10).map(({ label, count }) => { const [city, code] = label.split('|'); return { city, code, country: countryName(code), count }; }),
      devices: ranked(devices), browsers: ranked(browsers), sources: ranked(sources).slice(0, 8),
      pages: [...pages].map(([page, p]) => ({ page, views: p.views, people: p.people.size })).sort((a, b) => b.views - a.views).slice(0, 8),
      daily: [...daily].map(([date, d]) => ({ date, visitors: d.visitors.size, pageViews: d.pageViews })),
      visitors: visitors.slice(0, 1000),
    };
  }

  /** Things worth following up. Worked out from live data, so most clear themselves once the person acts. */
  async triggers(): Promise<Trigger[]> {
    const now = Date.now();
    const out: Trigger[] = [];
    const student = { select: { id: true, name: true, email: true } };
    const mentor = { select: { user: { select: { name: true } } } };
    const mins = (d: Date) => Math.round((d.getTime() - now) / 60_000);

    const pending = await this.prisma.booking.findMany({ where: { status: 'PENDING_PAYMENT' }, include: { student, mentor }, orderBy: { createdAt: 'desc' }, take: 100 });
    for (const b of pending) {
      const person = { userId: b.student.id, name: b.student.name, email: b.student.email, reference: b.reference };
      if (b.awaitingVerification) out.push({ ...person, id: `bank-${b.id}`, kind: 'bank_pending', severity: 'medium', title: 'Bank transfer waiting for approval', detail: `Session with ${b.mentor.user.name}. Approve or reject it in Bookings.`, at: b.createdAt });
      else out.push({ ...person, id: `await-${b.id}`, kind: 'awaiting_payment', severity: 'high', title: 'Awaiting payment', detail: `Session with ${b.mentor.user.name}. The time is held for up to ${Math.max(0, 15 + mins(b.createdAt))} more minutes.`, at: b.createdAt });
    }

    const recent = new Date(now - 14 * DAY);
    const lapsed = await this.prisma.booking.findMany({ where: { status: 'CANCELLED', cancelReason: 'Payment not completed in time', createdAt: { gte: recent } }, include: { student, mentor }, orderBy: { createdAt: 'desc' }, take: 200 });
    const paidSince = await this.prisma.booking.findMany({ where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: recent } }, select: { studentId: true, createdAt: true } });
    const paidLater = (id: string, after: Date) => paidSince.some((p) => p.studentId === id && p.createdAt > after);
    const attempts = await this.prisma.activityEvent.findMany({ where: { type: { in: ['payment_attempted', 'payment_failed'] }, createdAt: { gte: recent } }, select: { type: true, reference: true, label: true } });
    for (const b of lapsed) {
      if (paidLater(b.studentId, b.createdAt)) continue;
      const failed = attempts.find((a) => a.reference === b.reference && a.type === 'payment_failed');
      const tried = !!failed || attempts.some((a) => a.reference === b.reference);
      out.push({
        id: `lapsed-${b.id}`, kind: failed ? 'payment_failed' : 'payment_abandoned', severity: 'high', userId: b.student.id, name: b.student.name, email: b.student.email, reference: b.reference,
        title: failed ? 'Payment failed' : tried ? 'Tried to pay but didn\'t finish' : 'Reached payment but didn\'t pay',
        detail: `Session with ${b.mentor.user.name}. ${failed?.label ? `Reason: ${failed.label.replace(/\.+$/, '')}. ` : ''}The hold has expired.`, at: b.createdAt,
      });
    }

    // Behaviour-based triggers, from the last two weeks of events.
    const events = await this.prisma.activityEvent.findMany({
      where: { createdAt: { gte: recent }, OR: [{ type: { in: ['booking_started', 'booking_held', 'application_step', 'application_submitted'] } }, { type: 'page_view', page: { startsWith: '/mentors/' } }] },
      orderBy: { createdAt: 'desc' }, select: { userId: true, visitorId: true, type: true, page: true, label: true, createdAt: true },
    });
    const byPerson = new Map<string, typeof events>();
    for (const e of events) (byPerson.get(who(e)) ?? byPerson.set(who(e), []).get(who(e))!).push(e);
    const accounts = await this.prisma.user.findMany({ where: { id: { in: [...byPerson.keys()].filter((k) => !k.startsWith('guest:')) } }, select: student.select });
    const identify = (key: string) => {
      if (key.startsWith('guest:')) return { userId: key, name: guestName(key.slice(6)), email: '' };
      const a = accounts.find((x) => x.id === key);
      return a ? { userId: a.id, name: a.name, email: a.email } : null;
    };
    for (const [key, list] of byPerson) {
      const person = identify(key);
      if (!person) continue;
      const guest = key.startsWith('guest:');
      const quiet = (d: Date) => now - d.getTime() > VISIT_GAP;

      const booking = list.find((e) => e.type === 'booking_started' || e.type === 'booking_held'); // newest first
      if (booking?.type === 'booking_started' && quiet(booking.createdAt)) {
        const stamp = booking.createdAt.getTime();
        if (guest) out.push({ ...person, id: `guest-${key}-${stamp}`, kind: 'guest_booking', severity: 'medium', title: 'Guest started booking but didn\'t sign up', detail: `${booking.label ? `Was booking ${booking.label}. ` : ''}Left at the sign-up step, so we have no contact details.`, at: booking.createdAt });
        else out.push({ ...person, id: `started-${key}-${stamp}`, kind: 'booking_abandoned', severity: 'medium', title: 'Started booking but stopped', detail: booking.label ? `Was booking ${booking.label}.` : 'Left before reaching payment.', at: booking.createdAt });
      }

      const application = list.find((e) => e.type === 'application_step' || e.type === 'application_submitted');
      if (application?.type === 'application_step' && quiet(application.createdAt)) {
        out.push({ ...person, id: `apply-${key}-${application.createdAt.getTime()}`, kind: 'application_abandoned', severity: 'medium', title: 'Started a mentor application but didn\'t submit', detail: application.label ? `Stopped at: ${application.label}.` : 'Left before submitting.', at: application.createdAt });
      }

      // Keen but hasn't tried to book: several different mentors looked at in the past week.
      const week = list.filter((e) => e.type === 'page_view' && MENTOR_PAGE.test(e.page ?? '') && now - e.createdAt.getTime() < 7 * DAY);
      const mentors = new Set(week.map((e) => e.page));
      if (!booking && mentors.size >= 3 && quiet(week[0].createdAt)) {
        out.push({ ...person, id: `keen-${key}-${week[0].createdAt.toISOString().slice(0, 10)}`, kind: 'high_interest', severity: 'low', title: 'Looked at several mentors but didn\'t book', detail: `Viewed ${mentors.size} mentor profiles this week.`, at: week[0].createdAt });
      }
    }

    const fresh = await this.prisma.user.findMany({ where: { role: 'STUDENT', createdAt: { gte: new Date(now - 30 * DAY), lte: new Date(now - DAY) }, bookings: { none: {} } }, select: { ...student.select, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    for (const u of fresh) out.push({ id: `new-${u.id}`, kind: 'never_booked', severity: 'low', userId: u.id, name: u.name, email: u.email, title: 'Signed up but never booked', detail: 'Joined more than a day ago with no bookings yet.', at: u.createdAt });

    const stuck = await this.prisma.mentorProfile.findMany({ where: { status: 'ONBOARDING', createdAt: { lte: new Date(now - 3 * DAY) } }, select: { id: true, createdAt: true, agreementAcceptedAt: true, user: { select: student.select } }, take: 100 });
    for (const m of stuck) out.push({ id: `mentor-${m.id}`, kind: 'mentor_stuck', severity: 'medium', userId: m.user.id, name: m.user.name, email: m.user.email, title: 'Mentor hasn\'t finished onboarding', detail: m.agreementAcceptedAt ? 'Agreement accepted, but the profile isn\'t live yet.' : 'Hasn\'t accepted the mentor agreement yet.', at: m.createdAt });

    const handled = new Set((await this.prisma.handledTrigger.findMany({ where: { triggerId: { in: out.map((t) => t.id) } }, select: { triggerId: true } })).map((h) => h.triggerId));
    const rank = { high: 0, medium: 1, low: 2 };
    return out.filter((t) => !handled.has(t.id)).sort((a, b) => rank[a.severity] - rank[b.severity] || b.at.getTime() - a.at.getTime());
  }

  async markHandled(adminId: string, triggerId: string) {
    if (!triggerId || triggerId.length > 200) throw new BadRequestException('Invalid trigger');
    await this.prisma.handledTrigger.upsert({ where: { triggerId }, create: { triggerId, adminId }, update: {} });
    return { ok: true };
  }

  /** Everyone with recent activity, most recent first, with where they last were. */
  async people() {
    const [members, guests] = await Promise.all([
      this.prisma.activityEvent.groupBy({ by: ['userId'], where: { userId: { not: null }, type: { notIn: SYSTEM_EVENTS } }, _max: { createdAt: true }, _count: true, orderBy: { _max: { createdAt: 'desc' } }, take: 200 }),
      this.prisma.activityEvent.groupBy({ by: ['visitorId'], where: { userId: null, visitorId: { not: null }, type: { notIn: SYSTEM_EVENTS } }, _max: { createdAt: true }, _count: true, orderBy: { _max: { createdAt: 'desc' } }, take: 200 }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: members.map((g) => g.userId!) } }, select: { id: true, name: true, email: true, role: true } });
    const lastPage = async (where: { userId?: string; visitorId?: string }) => (await this.prisma.activityEvent.findFirst({ where: { ...where, page: { not: null } }, orderBy: { createdAt: 'desc' }, select: { page: true } }))?.page ?? null;
    const list = await Promise.all([
      ...members.map(async (g) => {
        const u = users.find((x) => x.id === g.userId);
        return u ? { ...u, lastSeen: g._max.createdAt, events: g._count, lastPage: await lastPage({ userId: u.id }) } : null;
      }),
      ...guests.map(async (g) => ({ id: `guest:${g.visitorId}`, name: guestName(g.visitorId!), email: '', role: 'GUEST', lastSeen: g._max.createdAt, events: g._count, lastPage: await lastPage({ visitorId: g.visitorId!, userId: undefined }) })),
    ]);
    return list.filter(Boolean).sort((a, b) => (b!.lastSeen?.getTime() ?? 0) - (a!.lastSeen?.getTime() ?? 0));
  }

  async journey(id: string) {
    const select = { id: true, type: true, page: true, label: true, reference: true, device: true, referrer: true, ip: true, country: true, city: true, createdAt: true };
    const triggers = async () => (await this.triggers()).filter((t) => t.userId === id);
    const context = (events: { device: string | null; referrer: string | null; ip: string | null; country: string | null; city: string | null }[]) => {
      const placed = events.find((e) => e.country);
      return { device: events.find((e) => e.device)?.device ?? null, referrer: events.find((e) => e.referrer)?.referrer ?? null, ip: events.find((e) => e.ip)?.ip ?? null, country: placed?.country ?? null, city: placed?.city ?? null };
    };

    if (id.startsWith('guest:')) {
      const visitorId = id.slice(6);
      const events = await this.prisma.activityEvent.findMany({ where: { visitorId, userId: null }, orderBy: { createdAt: 'desc' }, take: 500, select });
      if (!events.length) throw new NotFoundException('Visitor not found');
      return { user: { id, name: guestName(visitorId), email: '', role: 'GUEST', phone: null, createdAt: events[events.length - 1].createdAt }, events, bookings: {}, triggers: await triggers(), ...context(events) };
    }

    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true } });
    if (!user) throw new NotFoundException('User not found');
    const events = await this.prisma.activityEvent.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 500, select });
    const bookings = await this.prisma.booking.groupBy({ by: ['status'], where: { studentId: id }, _count: true });
    return { user, events, bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count])), triggers: await triggers(), ...context(events) };
  }
}
