import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_PROMO_PERCENT, commissionRules, feeOf, groupPercent, groupPriceOf, priceFor } from '../common/pricing';
import { NotificationsService } from '../common/notifications.service';
import { emailDate, webUrl } from '../common/email-template';
import { randomBytes } from 'crypto';
import { BookingsService, sessionUrl } from '../bookings/bookings.service';
import { CreatePromoDto, CreateSlotsDto, ListMentorsQuery, UpdateMentorProfileDto } from './mentors.dto';
import { saveMentorPhoto } from './mentor-photo';

export const SLOT_MINUTES = 30;
/** Only approved feedback is public. Reviews from before moderation existed have no status and stay visible. */
export const PUBLIC_REVIEW = { OR: [{ status: 'APPROVED' }, { status: null }, { status: { isSet: false } }] } satisfies Prisma.ReviewWhereInput;
const HORIZON_DAYS = 45;

@Injectable()
export class MentorsService {
  constructor(private prisma: PrismaService, private bookings: BookingsService, private notify: NotificationsService) {}

  private async decorate(m: Prisma.MentorProfileGetPayload<{ include: { user: { select: { name: true } } } }>) {
    const [{ priceMinor, currency }, agg, completed, next] = await Promise.all([
      priceFor(this.prisma, m),
      this.prisma.review.aggregate({ where: { booking: { mentorId: m.id }, ...PUBLIC_REVIEW }, _avg: { rating: true }, _count: true }),
      this.prisma.booking.count({ where: { mentorId: m.id, status: 'COMPLETED' } }),
      this.prisma.availabilitySlot.findFirst({ where: { mentorId: m.id, isBooked: false, startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' }, select: { startAt: true } }),
    ]);
    const { user, userId: _u, priceOverrideMinor, agreementAcceptedAt, ...rest } = m;
    return {
      ...rest,
      name: user.name,
      priceMinor,
      groupPriceMinor: groupPriceOf(priceMinor, await groupPercent(this.prisma)),
      currency,
      rating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      reviewCount: agg._count,
      sessionsCompleted: completed,
      nextAvailable: next?.startAt ?? null,
    };
  }

  async list(q: ListMentorsQuery) {
    await this.bookings.releaseExpiredHolds();
    const where: Prisma.MentorProfileWhereInput = { status: 'ACTIVE' };
    if (q.category) where.category = q.category;
    if (q.level) where.level = q.level;
    if (q.expertise) where.expertise = { has: q.expertise };
    if (q.industry) where.industries = { has: q.industry };
    if (q.language) where.languages = { has: q.language };
    if (q.q) {
      where.OR = [
        { user: { name: { contains: q.q, mode: 'insensitive' } } },
        { title: { contains: q.q, mode: 'insensitive' } },
        { organization: { contains: q.q, mode: 'insensitive' } },
        { expertise: { has: q.q } },
      ];
    }
    const rows = await this.prisma.mentorProfile.findMany({ where, include: { user: { select: { name: true } } } });
    let items = await Promise.all(rows.map((r) => this.decorate(r)));
    const sort = q.sort ?? 'soonest';
    items.sort((a, b) => {
      if (sort === 'price_asc') return a.priceMinor - b.priceMinor;
      if (sort === 'price_desc') return b.priceMinor - a.priceMinor;
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      return (a.nextAvailable?.getTime() ?? Infinity) - (b.nextAvailable?.getTime() ?? Infinity);
    });
    const page = q.page ?? 1, limit = q.limit ?? 24;
    return { total: items.length, page, limit, items: items.slice((page - 1) * limit, page * limit) };
  }

  async facets() {
    const rows = await this.prisma.mentorProfile.findMany({ where: { status: 'ACTIVE' }, select: { expertise: true, industries: true, languages: true } });
    const uniq = (k: 'expertise' | 'industries' | 'languages') => [...new Set(rows.flatMap((r) => r[k]))].sort();
    return { expertise: uniq('expertise'), industries: uniq('industries'), languages: uniq('languages') };
  }

  async getBySlug(slug: string) {
    await this.bookings.releaseExpiredHolds();
    const m = await this.prisma.mentorProfile.findFirst({ where: { slug, status: 'ACTIVE' }, include: { user: { select: { name: true } } } });
    if (!m) throw new NotFoundException('Mentor not found');
    const horizon = new Date(Date.now() + HORIZON_DAYS * 86400_000);
    const [base, slots, reviews] = await Promise.all([
      this.decorate(m),
      this.prisma.availabilitySlot.findMany({ where: { mentorId: m.id, isBooked: false, startAt: { gt: new Date(), lt: horizon } }, orderBy: { startAt: 'asc' }, select: { id: true, startAt: true, endAt: true, kind: true, capacity: true, seatsTaken: true } }),
      this.prisma.review.findMany({ where: { booking: { mentorId: m.id }, ...PUBLIC_REVIEW }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, rating: true, comment: true, createdAt: true, booking: { select: { agenda: true, student: { select: { name: true } } } } } }),
    ]);
    return {
      ...base,
      slots: slots.map(({ seatsTaken, ...s }) => ({ ...s, seatsLeft: s.capacity - seatsTaken })),
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, agenda: r.booking.agenda, author: r.booking.student.name.split(' ')[0] + ' ' + (r.booking.student.name.split(' ')[1]?.[0] ?? '') + '.' })),
    };
  }

  // ---------- mentor self-service ----------
  private async mine(userId: string) {
    const p = await this.prisma.mentorProfile.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!p) throw new NotFoundException('No mentor profile for this account');
    return p;
  }

  async me(userId: string) {
    const p = await this.mine(userId);
    // decorate() is shared with the public profile and drops private fields; the mentor's own view needs this one back.
    return { ...(await this.decorate(p)), agreementAcceptedAt: p.agreementAcceptedAt };
  }

  async updateMe(userId: string, dto: UpdateMentorProfileDto) {
    const p = await this.mine(userId);
    const { photoImage, ...rest } = dto;
    const photo = photoImage === undefined ? {} : { photoUrl: await saveMentorPhoto(this.prisma, p.id, photoImage) };
    await this.prisma.mentorProfile.update({ where: { id: p.id }, data: { ...rest, ...photo } });
    return this.me(userId);
  }

  /** A mentor's uploaded headshot, as shown on their public card and profile. */
  async photo(id: string) {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new NotFoundException('Photo not found');
    const row = await this.prisma.mentorImage.findUnique({ where: { mentorId: id } });
    if (!row) throw new NotFoundException('Photo not found');
    return Buffer.from(row.data);
  }

  async acceptAgreement(userId: string) {
    const p = await this.mine(userId);
    const at = p.agreementAcceptedAt ?? new Date();
    if (!p.agreementAcceptedAt) await this.prisma.mentorProfile.update({ where: { id: p.id }, data: { agreementAcceptedAt: at } });
    return { ok: true, agreementAcceptedAt: at };
  }

  async mySlots(userId: string) {
    const p = await this.mine(userId);
    return this.prisma.availabilitySlot.findMany({ where: { mentorId: p.id, startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' }, include: { bookings: { where: { status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } }, select: { reference: true, status: true } } } });
  }

  async addSlots(userId: string, dto: CreateSlotsDto) {
    const p = await this.mine(userId);
    if (p.status === 'SUSPENDED') throw new ForbiddenException('Your profile is suspended');
    const now = Date.now();
    const kind = dto.kind ?? 'ONE_TO_ONE';
    const data = dto.startTimes.map((s) => {
      const start = new Date(s);
      if (start.getTime() <= now) throw new BadRequestException('Slots must be in the future');
      if (start.getUTCMinutes() % SLOT_MINUTES !== 0 || start.getUTCSeconds() !== 0) throw new BadRequestException('Slots must start on the hour or half hour');
      return { mentorId: p.id, startAt: start, endAt: new Date(start.getTime() + SLOT_MINUTES * 60_000), kind, capacity: kind === 'GROUP' ? (dto.capacity ?? 4) : 1 };
    });
    // MongoDB has no skipDuplicates: drop slots that already exist for this mentor.
    const existing = await this.prisma.availabilitySlot.findMany({ where: { mentorId: p.id, startAt: { in: data.map((d) => d.startAt) } }, select: { startAt: true } });
    const taken = new Set(existing.map((e) => e.startAt.getTime()));
    const seen = new Set<number>();
    const fresh = data.filter((d) => { const t = d.startAt.getTime(); if (taken.has(t) || seen.has(t)) return false; seen.add(t); return true; });
    const res = await this.prisma.availabilitySlot.createMany({ data: fresh });
    return { created: res.count };
  }

  /** Removes the given slots if they are still open and have never had a booking; anything booked is left alone. */
  async removeSlots(userId: string, ids: string[]) {
    const p = await this.mine(userId);
    const res = await this.prisma.availabilitySlot.deleteMany({ where: { id: { in: ids }, mentorId: p.id, isBooked: false, seatsTaken: 0, bookings: { none: {} } } });
    return { removed: res.count };
  }

  async removeSlot(userId: string, slotId: string) {
    const p = await this.mine(userId);
    const slot = await this.prisma.availabilitySlot.findFirst({ where: { id: slotId, mentorId: p.id } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.isBooked || slot.seatsTaken > 0) throw new ConflictException('This slot is already booked; cancel the booking first');
    await this.prisma.availabilitySlot.delete({ where: { id: slotId } });
    return { ok: true };
  }

  async myBookings(userId: string) {
    const p = await this.mine(userId);
    await this.bookings.releaseExpiredHolds();
    const rows = await this.prisma.booking.findMany({
      where: { mentorId: p.id, status: { not: 'PENDING_PAYMENT' } },
      orderBy: { slot: { startAt: 'asc' } },
      include: { slot: true, student: { select: { name: true } }, review: true },
    });
    return rows.map(({ slot, student, ...b }) => ({ ...b, meetingLink: b.status === 'CONFIRMED' || b.status === 'COMPLETED' ? sessionUrl(b.reference) : null, startAt: slot.startAt, endAt: slot.endAt, sessionKind: b.sessionKind, studentName: student.name }));
  }

  /** Every piece of feedback left for this mentor, newest first, with its moderation state. */
  async myReviews(userId: string) {
    const p = await this.mine(userId);
    const rows = await this.prisma.review.findMany({
      where: { booking: { mentorId: p.id } }, orderBy: { createdAt: 'desc' },
      select: { id: true, rating: true, comment: true, status: true, createdAt: true, moderatedAt: true, booking: { select: { reference: true, agenda: true, slot: { select: { startAt: true } }, student: { select: { name: true } } } } },
    });
    return rows.map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, status: r.status ?? 'APPROVED', createdAt: r.createdAt, moderatedAt: r.moderatedAt,
      reference: r.booking.reference, agenda: r.booking.agenda, sessionAt: r.booking.slot.startAt, studentName: r.booking.student.name,
    }));
  }

  /** The mentor decides whether a student's feedback appears on their public profile. */
  async myPayoutDetails(userId: string) {
    return (await this.mine(userId)).payoutDetails ?? null;
  }

  async saveMyPayoutDetails(userId: string, details: Record<string, string | undefined>) {
    const p = await this.mine(userId);
    const clean = Object.fromEntries(Object.entries(details).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v!.trim()]));
    if (!clean.iban && !clean.accountNumber && !clean.wallet) throw new BadRequestException('Add an IBAN, account number or mobile wallet number.');
    const value = { ...clean, updatedAt: new Date().toISOString(), updatedBy: 'mentor' };
    await this.prisma.mentorProfile.update({ where: { id: p.id }, data: { payoutDetails: value } });
    return value;
  }

  /**
   * Gross booked value and the mentor's share, per currency. Each booking uses the fee rate recorded when it was made
   * (tier rate, or the lower repeat-student rate); older bookings use today's tier rate.
   */
  async myEarnings(userId: string) {
    const p = await this.mine(userId);
    const rules = await commissionRules(this.prisma);
    const rows = await this.prisma.booking.findMany({ where: { mentorId: p.id, status: { in: ['CONFIRMED', 'COMPLETED'] } }, select: { currency: true, priceMinor: true, platformFeeMinor: true, repeatStudent: true } });
    const out: Record<string, { currency: string; grossMinor: number; feeMinor: number; payoutMinor: number; sessions: number; repeatSessions: number }> = {};
    let unknown = false;
    for (const b of rows) {
      const o = (out[b.currency] ??= { currency: b.currency, grossMinor: 0, feeMinor: 0, payoutMinor: 0, sessions: 0, repeatSessions: 0 });
      const rate = rules.tier[p.level];
      const fee = b.platformFeeMinor ?? (rate == null ? null : feeOf(b.priceMinor, rate));
      if (fee == null) unknown = true;
      o.grossMinor += b.priceMinor; o.feeMinor += fee ?? 0; o.payoutMinor += b.priceMinor - (fee ?? 0); o.sessions++; if (b.repeatStudent) o.repeatSessions++;
    }
    return { totals: Object.values(out), tierPercent: rules.tier[p.level], repeatPercent: rules.repeat, commissionConfigured: !unknown && rules.tier[p.level] != null, note: 'Payout schedule is set by POINT B administrators.' };
  }

  /**
   * The mentor's own payout statement: earned, paid and still owed per currency, every payout we've sent, and each
   * paid session with whether it has been paid out yet.
   */
  async myPayouts(userId: string) {
    const p = await this.mine(userId);
    const rules = await commissionRules(this.prisma);
    const [rows, payouts] = await Promise.all([
      this.prisma.booking.findMany({
        where: { mentorId: p.id, status: { in: ['CONFIRMED', 'COMPLETED'] } }, orderBy: { slot: { startAt: 'desc' } },
        select: { reference: true, status: true, currency: true, priceMinor: true, platformFeeMinor: true, commissionPercent: true, payoutId: true, slot: { select: { startAt: true } }, student: { select: { name: true } } },
      }),
      this.prisma.mentorPayout.findMany({ where: { mentorId: p.id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, currency: true, amountMinor: true, sessions: true, reference: true, note: true } }),
    ]);
    const sessions = rows.map((b) => {
      const pct = b.commissionPercent ?? rules.tier[p.level];
      const fee = b.platformFeeMinor ?? (pct == null ? null : feeOf(b.priceMinor, pct));
      const paidOut = payouts.find((x) => x.id === b.payoutId);
      return { reference: b.reference, status: b.status, currency: b.currency, startAt: b.slot.startAt, studentName: b.student.name, priceMinor: b.priceMinor, percent: pct, earnMinor: fee == null ? null : b.priceMinor - fee, paidOn: paidOut?.createdAt ?? null };
    });
    // Sessions paid out and later cancelled: the money was sent, so it counts as paid, and the mentor can see why.
    const cancelledPaid = await this.prisma.booking.findMany({ where: { mentorId: p.id, payoutId: { not: null }, status: { notIn: ['CONFIRMED', 'COMPLETED'] } }, select: { currency: true, priceMinor: true, platformFeeMinor: true } });
    const totals = (['PKR', 'GBP'] as const).map((currency) => {
      const mine = sessions.filter((s) => s.currency === currency);
      const sum = (l: typeof mine) => l.reduce((n, s) => n + (s.earnMinor ?? 0), 0);
      const paidMinor = payouts.filter((x) => x.currency === currency).reduce((n, x) => n + x.amountMinor, 0);
      const forCancelledMinor = cancelledPaid.filter((b) => b.currency === currency).reduce((n, b) => n + b.priceMinor - (b.platformFeeMinor ?? 0), 0);
      return { currency, earnedMinor: sum(mine), paidMinor, dueMinor: sum(mine.filter((s) => !s.paidOn)), forCancelledMinor, sessions: mine.length };
    }).filter((t) => t.sessions > 0 || t.paidMinor > 0);
    return { totals, payouts, sessions, hasPayoutDetails: !!p.payoutDetails };
  }

  /** Students who have had a paid session with this mentor, and so can be offered a promo code for the next one. */
  async myStudents(userId: string) {
    const p = await this.mine(userId);
    const rows = await this.prisma.booking.findMany({ where: { mentorId: p.id, status: { in: ['CONFIRMED', 'COMPLETED'] } }, select: { studentId: true, slot: { select: { startAt: true } }, student: { select: { name: true, email: true } } }, orderBy: { slot: { startAt: 'desc' } } });
    const seen = new Map<string, { id: string; name: string; email: string; lastSessionAt: Date; sessions: number }>();
    for (const r of rows) {
      const s = seen.get(r.studentId);
      if (s) s.sessions++;
      else seen.set(r.studentId, { id: r.studentId, name: r.student.name, email: r.student.email, lastSessionAt: r.slot.startAt, sessions: 1 });
    }
    return [...seen.values()];
  }

  async myPromos(userId: string) {
    const p = await this.mine(userId);
    const rows = await this.prisma.promoCode.findMany({ where: { mentorId: p.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    const students = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } }, select: { id: true, name: true } });
    const now = new Date();
    return rows.map((r) => ({
      id: r.id, studentId: r.studentId, code: r.code, percentOff: r.percentOff, note: r.note, createdAt: r.createdAt, expiresAt: r.expiresAt, usedAt: r.usedAt,
      studentName: students.find((s) => s.id === r.studentId)?.name ?? 'Student',
      state: r.revokedAt ? 'REVOKED' : r.usedAt ? 'USED' : r.expiresAt < now ? 'EXPIRED' : 'ACTIVE',
    }));
  }

  /** Issues a single-use code for one returning student's next 1:1 with this mentor, and emails it to them. */
  async createPromo(userId: string, dto: CreatePromoDto) {
    const p = await this.mine(userId);
    if (p.status !== 'ACTIVE') throw new BadRequestException('Promo codes can be sent once your profile is live.');
    if (dto.percentOff > MAX_PROMO_PERCENT) throw new BadRequestException(`A promo code can give at most ${MAX_PROMO_PERCENT}% off.`);
    const had = await this.prisma.booking.findFirst({ where: { mentorId: p.id, studentId: dto.studentId, status: { in: ['CONFIRMED', 'COMPLETED'] } }, include: { student: { select: { id: true, name: true, email: true } } } });
    if (!had) throw new BadRequestException('Promo codes are for students who have already had a session with you.');
    const active = await this.prisma.promoCode.findFirst({ where: { mentorId: p.id, studentId: dto.studentId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active) throw new BadRequestException(`${had.student.name.split(' ')[0]} already has an unused code from you (${active.code}). Revoke it first to send a new one.`);
    let code = '';
    for (let i = 0; i < 5 && !code; i++) {
      const c = 'PB-' + randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
      if (!(await this.prisma.promoCode.findUnique({ where: { code: c } }))) code = c;
    }
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    await this.prisma.promoCode.create({ data: { code, mentorId: p.id, studentId: dto.studentId, percentOff: dto.percentOff, note: dto.note?.trim() ?? '', expiresAt } });
    const st = had.student;
    await this.notify.send(
      st.email,
      `${p.user.name} sent you ${dto.percentOff}% off your next session`,
      `Hi ${st.name.split(' ')[0]},\n\n${p.user.name} would like to meet with you again and has sent you a promo code for ${dto.percentOff}% off your next 1:1 session with them.${dto.note?.trim() ? `\n\nA note from ${p.user.name.split(' ')[0]}: ${dto.note.trim()}` : ''}\n\nChoose a time on their profile and enter the code at checkout. It works once, for a 1:1 session with ${p.user.name.split(' ')[0]}.`,
      st.id,
      { whatsapp: false, cta: { label: `Book with ${p.user.name.split(' ')[0]}`, url: `${webUrl()}/mentors/${p.slug}` }, facts: [['Promo code', code], ['Discount', `${dto.percentOff}% off one 1:1 session`], ['Valid until', emailDate(expiresAt)]] },
    );
    return this.myPromos(userId);
  }

  async revokePromo(userId: string, id: string) {
    const p = await this.mine(userId);
    const r = await this.prisma.promoCode.findFirst({ where: { id, mentorId: p.id } });
    if (!r) throw new NotFoundException('Promo code not found');
    if (r.usedAt) throw new BadRequestException('This code has already been used.');
    const held = await this.prisma.booking.findFirst({ where: { promoCodeId: r.id, status: 'PENDING_PAYMENT' }, select: { id: true } });
    if (held) throw new BadRequestException('The student is paying with this code right now. Try again in 15 minutes.');
    await this.prisma.promoCode.update({ where: { id }, data: { revokedAt: new Date() } });
    return this.myPromos(userId);
  }

}
