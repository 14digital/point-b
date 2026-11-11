import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { PasswordLinksService } from '../common/password-links.service';
import { emailDate, webUrl } from '../common/email-template';
import { STAFF_ROLES, StaffRole } from '../common/auth';
import { commissionRules, feeForBooking } from '../common/pricing';
import { money } from '../common/currency';
import { WalletService } from '../common/wallet.service';
import { saveMentorPhoto } from '../mentors/mentor-photo';
import { Currency } from '@prisma/client';

const isId = (id: string) => /^[a-f0-9]{24}$/i.test(id);
const ageOn = (dob: Date) => Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
const PAID = ['CONFIRMED', 'COMPLETED'] as const;
export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
const STAFF_LABEL: Record<StaffRole, string> = { OWNER: 'Owner', OPERATIONS: 'Operations', FINANCE: 'Finance' };

/** The admin's people tools: students, reviews, the support inbox, the team, and deeper mentor records. */
@Injectable()
export class AdminOpsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private links: PasswordLinksService, private wallet: WalletService) {}

  private audit(adminId: string, action: string, entityType: string, entityId: string, detail = '') {
    return this.prisma.auditLog.create({ data: { adminId, action, entityType, entityId, detail } });
  }

  // ---------- students ----------
  async students() {
    const [users, bookings] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'STUDENT' }, orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, phone: true, dateOfBirth: true, guardianEmail: true, guardianConsent: true, isActive: true, suspendedReason: true, anonymizedAt: true, createdAt: true },
      }),
      this.prisma.booking.findMany({ select: { studentId: true, status: true, priceMinor: true, currency: true, createdAt: true } }),
    ]);
    return users.map((u) => {
      const mine = bookings.filter((b) => b.studentId === u.id);
      const paid = mine.filter((b) => (PAID as readonly string[]).includes(b.status));
      const minor = u.dateOfBirth ? ageOn(u.dateOfBirth) < 18 : false;
      return {
        id: u.id, name: u.name, email: u.email, phone: u.phone, age: u.dateOfBirth ? ageOn(u.dateOfBirth) : null, minor,
        guardianEmail: u.guardianEmail, guardianConsent: u.guardianConsent, needsConsent: minor && !u.guardianConsent && !u.anonymizedAt,
        isActive: u.isActive, suspendedReason: u.suspendedReason, anonymized: !!u.anonymizedAt, joinedAt: u.createdAt,
        bookings: mine.length, paidSessions: paid.length,
        spent: paid.reduce<Record<string, number>>((o, b) => ({ ...o, [b.currency]: (o[b.currency] ?? 0) + b.priceMinor }), {}),
        lastBookingAt: mine.reduce<Date | null>((d, b) => (!d || b.createdAt > d ? b.createdAt : d), null),
      };
    });
  }

  async student(id: string) {
    if (!isId(id)) throw new NotFoundException('Student not found');
    const u = await this.prisma.user.findFirst({
      where: { id, role: 'STUDENT' },
      select: { id: true, name: true, email: true, phone: true, timezone: true, dateOfBirth: true, guardianEmail: true, guardianConsent: true, whatsappAlerts: true, isActive: true, suspendedReason: true, anonymizedAt: true, createdAt: true },
    });
    if (!u) throw new NotFoundException('Student not found');
    const [bookings, events, tickets] = await Promise.all([
      this.prisma.booking.findMany({ where: { studentId: id }, orderBy: { createdAt: 'desc' }, select: { reference: true, status: true, priceMinor: true, currency: true, awaitingVerification: true, cancelReason: true, createdAt: true, slot: { select: { startAt: true } }, mentor: { select: { user: { select: { name: true } } } } } }),
      this.prisma.auditLog.findMany({ where: { entityType: 'User', entityId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: { admin: { select: { name: true } } } }),
      this.prisma.supportTicket.findMany({ where: { OR: [{ userId: id }, { email: u.email }] }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, topic: true, status: true, urgent: true, createdAt: true } }),
    ]);
    const age = u.dateOfBirth ? ageOn(u.dateOfBirth) : null;
    return { ...u, age, minor: age != null && age < 18, bookings, tickets, wallet: await this.wallet.summary(id), history: events.map((e) => ({ action: e.action, detail: e.detail, at: e.createdAt, by: e.admin.name })) };
  }

  /** Adds or removes POINT B balance by hand, with a reason, e.g. goodwill credit or correcting a mistake. */
  async adjustWallet(adminId: string, id: string, currency: Currency, amountMinor: number, note: string) {
    const u = await this.prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
    if (!u) throw new NotFoundException('Student not found');
    if (!amountMinor) throw new BadRequestException('Enter an amount.');
    const balance = (await this.wallet.balances(id))[currency];
    if (balance + amountMinor < 0) throw new BadRequestException('That would make the balance negative.');
    await this.wallet.add(id, currency, amountMinor, 'ADJUSTMENT', { note: note.trim(), createdBy: adminId });
    await this.audit(adminId, 'BALANCE_ADJUSTED', 'User', id, `${amountMinor > 0 ? '+' : ''}${amountMinor / 100} ${currency}: ${note.trim()}`);
    if (amountMinor > 0) {
      const amount = money(amountMinor, currency);
      await this.notify.send(u.email, `${amount} added to your POINT B balance`, `Hi ${u.name.split(' ')[0]},\n\nWe've added ${amount} to your POINT B balance. ${note.trim()}\n\nYou can use it at checkout for any future session.`, u.id, { emailOnly: true, cta: { label: 'Find a mentor', url: `${webUrl()}/mentors` } });
    }
    return this.student(id);
  }

  async setGuardianConsent(adminId: string, id: string, consent: boolean) {
    const u = await this.prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
    if (!u) throw new NotFoundException('Student not found');
    await this.prisma.user.update({ where: { id }, data: { guardianConsent: consent } });
    await this.audit(adminId, consent ? 'GUARDIAN_CONSENT_RECORDED' : 'GUARDIAN_CONSENT_WITHDRAWN', 'User', id, u.guardianEmail ?? '');
    if (consent) {
      await this.notify.send(u.email, 'You can now book sessions', `Hi ${u.name.split(' ')[0]},\n\nYour parent or guardian has given consent, so you can now book sessions on POINT B Mentors.`, u.id, { cta: { label: 'Find a mentor', url: `${webUrl()}/mentors` } });
    }
    return this.student(id);
  }

  async setSuspended(adminId: string, id: string, suspend: boolean, reason?: string) {
    const u = await this.prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
    if (!u) throw new NotFoundException('Student not found');
    if (u.anonymizedAt) throw new BadRequestException('This account has been erased.');
    if (suspend && !reason?.trim()) throw new BadRequestException('Add a reason for suspending the account.');
    await this.prisma.user.update({ where: { id }, data: { isActive: !suspend, suspendedReason: suspend ? reason!.trim() : null } });
    await this.audit(adminId, suspend ? 'STUDENT_SUSPENDED' : 'STUDENT_REACTIVATED', 'User', id, reason?.trim() ?? '');
    return this.student(id);
  }

  /** Erases a student's personal details on request. Bookings and payments stay, attached to an anonymous record. */
  async anonymize(adminId: string, id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
    if (!u) throw new NotFoundException('Student not found');
    const active = await this.prisma.booking.count({ where: { studentId: id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } } });
    if (active) throw new BadRequestException(`This mentee has ${active} upcoming or unpaid booking${active === 1 ? '' : 's'}. Cancel or complete them first.`);
    await this.prisma.user.update({
      where: { id },
      data: {
        name: 'Erased mentee', email: `erased-${id}@erased.invalid`, phone: null, dateOfBirth: null, guardianEmail: null, whatsappAlerts: false,
        isActive: false, suspendedReason: null, anonymizedAt: new Date(), passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10), resetTokenHash: null,
      },
    });
    await this.prisma.savedMentor.deleteMany({ where: { userId: id } });
    const tickets = await this.prisma.supportTicket.findMany({ where: { OR: [{ userId: id }, { email: u.email }] }, select: { id: true, urgent: true } });
    for (const t of tickets) {
      await this.prisma.supportTicket.update({ where: { id: t.id }, data: { name: 'Erased mentee', email: `erased-${id}@erased.invalid`, userId: id, ...(t.urgent ? {} : { message: '[Removed when the account was erased]' }) } });
    }
    await this.prisma.activityEvent.deleteMany({ where: { userId: id } });
    await this.audit(adminId, 'STUDENT_ERASED', 'User', id, 'Personal data erased on request');
    return this.student(id);
  }

  // ---------- reviews ----------
  async reviews() {
    const rows = await this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: { booking: { select: { reference: true, slot: { select: { startAt: true } }, student: { select: { name: true } }, mentor: { select: { id: true, slug: true, user: { select: { name: true } } } } } } },
    });
    return rows.map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, status: r.status ?? 'APPROVED', moderatedAt: r.moderatedAt, moderatedBy: r.moderatedBy ?? (r.moderatedAt ? 'MENTOR' : null), editedAt: r.editedAt, createdAt: r.createdAt, // MENTOR only on decisions made before admins took this over
      reference: r.booking.reference, sessionAt: r.booking.slot.startAt, studentName: r.booking.student.name, mentorName: r.booking.mentor.user.name, mentorSlug: r.booking.mentor.slug,
    }));
  }

  async moderateReview(adminId: string, id: string, status: 'APPROVED' | 'HIDDEN', note?: string) {
    if (!isId(id)) throw new NotFoundException('Review not found');
    const r = await this.prisma.review.findUnique({ where: { id }, include: { booking: { select: { reference: true } } } });
    if (!r) throw new NotFoundException('Review not found');
    await this.prisma.review.update({ where: { id }, data: { status, moderatedAt: new Date(), moderatedBy: 'ADMIN' } });
    await this.audit(adminId, status === 'HIDDEN' ? 'REVIEW_HIDDEN' : 'REVIEW_PUBLISHED', 'Review', id, `${r.booking.reference}${note?.trim() ? `: ${note.trim()}` : ''}`);
    return this.reviews();
  }

  // ---------- support inbox ----------
  async tickets() {
    const [rows, staff] = await Promise.all([
      this.prisma.supportTicket.findMany({ orderBy: [{ updatedAt: 'desc' }], include: { _count: { select: { events: true } }, events: { where: { kind: { in: ['REPLY', 'MESSAGE'] } }, orderBy: { createdAt: 'desc' }, take: 1 } } }),
      this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true } }),
    ]);
    return rows.map(({ _count, events, ...t }) => ({
      ...t, events: _count.events, assignedName: staff.find((s) => s.id === t.assignedTo)?.name ?? null,
      preview: (events[0]?.kind === 'MESSAGE' ? events[0].body : t.message).slice(0, 160),
      // The requester wrote back after our last reply.
      newReply: events[0]?.kind === 'MESSAGE' && t.status !== 'RESOLVED',
    }));
  }

  async ticket(id: string) {
    if (!isId(id)) throw new NotFoundException('Message not found');
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException('Message not found');
    const [staff, user] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true } }),
      this.prisma.user.findFirst({ where: { OR: [...(t.userId ? [{ id: t.userId }] : []), { email: t.email }] }, select: { id: true, role: true, name: true } }),
    ]);
    return { ...t, staff, account: user, assignedName: staff.find((s) => s.id === t.assignedTo)?.name ?? null };
  }

  async updateTicket(admin: { id: string; name: string }, id: string, change: { status?: string; assignedTo?: string | null }) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Message not found');
    const events: { kind: string; body: string }[] = [];
    const data: { status?: string; resolvedAt?: Date | null; assignedTo?: string | null } = {};
    if (change.status && change.status !== t.status) {
      if (!(SUPPORT_STATUSES as readonly string[]).includes(change.status)) throw new BadRequestException('Unknown status');
      data.status = change.status; data.resolvedAt = change.status === 'RESOLVED' ? new Date() : null;
      events.push({ kind: 'STATUS', body: change.status });
    }
    if (change.assignedTo !== undefined && change.assignedTo !== t.assignedTo) {
      const who = change.assignedTo ? await this.prisma.user.findFirst({ where: { id: change.assignedTo, role: 'ADMIN' }, select: { name: true } }) : null;
      if (change.assignedTo && !who) throw new BadRequestException('Choose someone on the team.');
      data.assignedTo = change.assignedTo;
      events.push({ kind: 'ASSIGN', body: who?.name ?? 'Unassigned' });
    }
    if (events.length) {
      await this.prisma.supportTicket.update({ where: { id }, data });
      await this.prisma.supportEvent.createMany({ data: events.map((e) => ({ ...e, ticketId: id, byId: admin.id, byName: admin.name })) });
    }
    return this.ticket(id);
  }

  async addNote(admin: { id: string; name: string }, id: string, body: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Message not found');
    await this.prisma.supportEvent.create({ data: { ticketId: id, kind: 'NOTE', body: body.trim(), byId: admin.id, byName: admin.name } });
    if (t.status === 'OPEN') await this.prisma.supportTicket.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    return this.ticket(id);
  }

  /** Emails the person who wrote in, from the support address, and records the reply on the ticket. */
  async reply(admin: { id: string; name: string }, id: string, body: string, resolve: boolean) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Message not found');
    // Account holders can read the whole conversation and reply from their dashboard.
    const account = await this.prisma.user.findFirst({ where: { OR: [...(t.userId ? [{ id: t.userId }] : []), { email: t.email }], role: { in: ['STUDENT', 'MENTOR'] } }, select: { id: true, role: true } });
    const dashboard = account ? `${webUrl()}/dashboard/${account.role === 'MENTOR' ? 'mentor?tab=support&' : 'student?'}request=${t.id}` : null;
    await this.notify.send(t.email, `Re: ${t.topic} [${t.number}]`, `Hi ${t.name.split(' ')[0]},\n\n${body.trim()}\n\n${admin.name.split(' ')[0]}, POINT B Mentors`, account?.id ?? t.userId ?? undefined, {
      emailOnly: true, replyTo: process.env.SUPPORT_EMAIL, facts: [['Your message', t.message.length > 200 ? `${t.message.slice(0, 200)}…` : t.message], ['Reference', t.number]],
      ...(dashboard ? { cta: { label: 'View and reply in your dashboard', url: dashboard } } : {}),
    });
    await this.prisma.supportEvent.create({ data: { ticketId: id, kind: 'REPLY', body: body.trim(), byId: admin.id, byName: admin.name } });
    const status = resolve ? 'RESOLVED' : 'IN_PROGRESS';
    await this.prisma.supportTicket.update({ where: { id }, data: { status, resolvedAt: resolve ? new Date() : null } }); // also moves it up the requester's list
    if (t.status !== status) {
      await this.prisma.supportEvent.create({ data: { ticketId: id, kind: 'STATUS', body: status, byId: admin.id, byName: admin.name } });
    }
    return this.ticket(id);
  }

  // ---------- team ----------
  async team() {
    const rows = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, staffRole: true, isActive: true, totpEnabledAt: true, createdAt: true, resetTokenHash: true, passwordChangedAt: true } });
    const last = await Promise.all(rows.map((r) => this.prisma.auditLog.findFirst({ where: { adminId: r.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })));
    return rows.map(({ resetTokenHash, ...r }, i) => ({ ...r, staffRole: (r.staffRole ?? 'OWNER') as StaffRole, twoFactor: !!r.totpEnabledAt, invitePending: !!resetTokenHash && !r.passwordChangedAt, lastActionAt: last[i]?.createdAt ?? null }));
  }

  private async ownersLeft(exceptId: string) {
    const owners = await this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, id: { not: exceptId } }, select: { staffRole: true } });
    return owners.filter((o) => (o.staffRole ?? 'OWNER') === 'OWNER').length;
  }

  async invite(adminId: string, dto: { name: string; email: string; staffRole: StaffRole }) {
    if (!STAFF_ROLES.includes(dto.staffRole)) throw new BadRequestException('Choose a role');
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.role !== 'ADMIN') throw new ConflictException('That email belongs to a mentee or mentor account. Use a different email for team access.');
    if (existing?.isActive) throw new ConflictException('This person is already on the team.');
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { isActive: true, staffRole: dto.staffRole, name: dto.name.trim() } })
      : await this.prisma.user.create({ data: { email, name: dto.name.trim(), role: 'ADMIN', staffRole: dto.staffRole, passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) } });
    const { token, expiresAt } = await this.links.issue(user.id, 72);
    await this.notify.send(email, 'You’ve been invited to the POINT B admin team', `Hi ${dto.name.trim().split(' ')[0]},\n\nYou’ve been given ${STAFF_LABEL[dto.staffRole]} access to the POINT B Mentors admin. Use the button below to choose your password and sign in. We recommend turning on two-step sign-in straight away, under Settings → Security.`, user.id, {
      emailOnly: true, cta: { label: 'Set your password', url: `${webUrl()}/reset-password?token=${token}&welcome=1` }, facts: [['Role', STAFF_LABEL[dto.staffRole]], ['Link valid until', emailDate(expiresAt)]],
    });
    await this.audit(adminId, 'TEAM_MEMBER_INVITED', 'User', user.id, `${email} as ${STAFF_LABEL[dto.staffRole]}`);
    return this.team();
  }

  async setStaffRole(adminId: string, id: string, staffRole: StaffRole) {
    if (!STAFF_ROLES.includes(staffRole)) throw new BadRequestException('Choose a role');
    if (id === adminId) throw new ForbiddenException('You can’t change your own role. Ask another owner.');
    const u = await this.prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
    if (!u) throw new NotFoundException('Team member not found');
    if ((u.staffRole ?? 'OWNER') === 'OWNER' && staffRole !== 'OWNER' && (await this.ownersLeft(id)) === 0) throw new BadRequestException('There must always be at least one owner.');
    await this.prisma.user.update({ where: { id }, data: { staffRole } });
    await this.audit(adminId, 'TEAM_ROLE_CHANGED', 'User', id, `${u.email} → ${STAFF_LABEL[staffRole]}`);
    return this.team();
  }

  async removeMember(adminId: string, id: string) {
    if (id === adminId) throw new ForbiddenException('You can’t remove yourself. Ask another owner.');
    const u = await this.prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
    if (!u) throw new NotFoundException('Team member not found');
    if ((u.staffRole ?? 'OWNER') === 'OWNER' && (await this.ownersLeft(id)) === 0) throw new BadRequestException('There must always be at least one owner.');
    // Signed out everywhere and unable to sign in; their past actions stay in the audit log under their name.
    await this.prisma.user.update({ where: { id }, data: { isActive: false, resetTokenHash: null, passwordChangedAt: new Date() } });
    await this.audit(adminId, 'TEAM_MEMBER_REMOVED', 'User', id, u.email);
    return this.team();
  }

  async resetMemberTwoFactor(adminId: string, id: string) {
    if (id === adminId) throw new ForbiddenException('Turn off your own two-step sign-in from Security.');
    const u = await this.prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
    if (!u) throw new NotFoundException('Team member not found');
    await this.prisma.user.update({ where: { id }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpRecoveryHashes: [] } });
    await this.audit(adminId, 'TEAM_TWO_STEP_RESET', 'User', id, `${u.email} lost their phone`);
    return this.team();
  }

  // ---------- mentors, in depth ----------
  async mentor(id: string) {
    if (!isId(id)) throw new NotFoundException('Mentor not found');
    const m = await this.prisma.mentorProfile.findUnique({ where: { id }, include: { user: { select: { name: true, email: true, phone: true, createdAt: true } } } });
    if (!m) throw new NotFoundException('Mentor not found');
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86_400_000);
    const [slots, bookings, reviews, payouts, rules] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { mentorId: id, startAt: { gte: now, lt: in14 } }, orderBy: { startAt: 'asc' }, select: { startAt: true, kind: true, isBooked: true, capacity: true, seatsTaken: true } }),
      this.prisma.booking.findMany({ where: { mentorId: id }, orderBy: { createdAt: 'desc' }, select: { reference: true, status: true, mentorNoShowAt: true, priceMinor: true, currency: true, platformFeeMinor: true, listPriceMinor: true, mentorPaidInFull: true, commissionPercent: true, payoutId: true, createdAt: true, slot: { select: { startAt: true } }, student: { select: { name: true } } } }),
      this.prisma.review.findMany({ where: { booking: { mentorId: id } }, select: { rating: true, status: true } }),
      this.prisma.mentorPayout.findMany({ where: { mentorId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, amountMinor: true, currency: true, sessions: true, reference: true } }),
      commissionRules(this.prisma),
    ]);
    const count = (s: string) => bookings.filter((b) => b.status === s).length;
    const paid = bookings.filter((b) => (PAID as readonly string[]).includes(b.status));
    const earn = (b: (typeof bookings)[number]) => { const pct = b.commissionPercent ?? rules.tier[m.level]; const fee = feeForBooking(b, pct); return fee == null ? 0 : b.priceMinor - fee; };
    const publicReviews = reviews.filter((r) => (r.status ?? 'APPROVED') === 'APPROVED');
    return {
      ...m,
      stats: {
        completed: count('COMPLETED'), upcoming: bookings.filter((b) => b.status === 'CONFIRMED' && b.slot.startAt > now).length, cancelled: count('CANCELLED'), noShows: count('NO_SHOW'), mentorNoShows: bookings.filter((b) => b.mentorNoShowAt).length,
        rating: publicReviews.length ? publicReviews.reduce((n, r) => n + r.rating, 0) / publicReviews.length : null, reviews: reviews.length, hiddenReviews: reviews.filter((r) => r.status === 'HIDDEN').length,
        earnedMinor: paid.reduce((n, b) => n + earn(b), 0), dueMinor: paid.filter((b) => !b.payoutId).reduce((n, b) => n + earn(b), 0), paidMinor: payouts.reduce((n, x) => n + x.amountMinor, 0),
        forCancelledMinor: bookings.filter((b) => b.payoutId && !(PAID as readonly string[]).includes(b.status)).reduce((n, b) => n + earn(b), 0),
      },
      openSlots: slots.filter((s) => !s.isBooked).length,
      availability: Array.from({ length: 14 }, (_, i) => {
        const day = new Date(now.getTime() + i * 86_400_000).toISOString().slice(0, 10);
        const ds = slots.filter((s) => s.startAt.toISOString().slice(0, 10) === day);
        return { day, open: ds.filter((s) => !s.isBooked).length, booked: ds.filter((s) => s.isBooked).length };
      }),
      recentBookings: bookings.slice(0, 12).map((b) => ({ reference: b.reference, status: b.status, priceMinor: b.priceMinor, currency: b.currency, startAt: b.slot.startAt, studentName: b.student.name })),
      payouts: payouts.slice(0, 10),
    };
  }

  async updateMentorProfile(adminId: string, id: string, dto: Record<string, unknown>) {
    const m = await this.prisma.mentorProfile.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!m) throw new NotFoundException('Mentor not found');
    const fields = ['title', 'organization', 'introduction', 'careerSummary', 'linkedinUrl', 'verified'] as const;
    const data: Record<string, unknown> = Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, typeof dto[f] === 'string' ? (dto[f] as string).trim() || null : dto[f]]));
    if ('title' in data && !data.title) throw new BadRequestException('The headline can’t be empty.');
    if (typeof dto.photoImage === 'string') data.photoUrl = await saveMentorPhoto(this.prisma, id, dto.photoImage);
    await this.prisma.mentorProfile.update({ where: { id }, data });
    await this.audit(adminId, 'MENTOR_PROFILE_EDITED', 'MentorProfile', id, Object.keys(data).join(', '));
    return this.mentor(id);
  }

  async setPayoutDetails(adminId: string | null, mentorId: string, details: Record<string, string | undefined>) {
    const clean = Object.fromEntries(Object.entries(details).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v!.trim()]));
    if (!clean.accountTitle) throw new BadRequestException('Add the name on the account.');
    if (!clean.iban && !clean.accountNumber && !clean.wallet) throw new BadRequestException('Add an IBAN, account number or mobile wallet number.');
    await this.prisma.mentorProfile.update({ where: { id: mentorId }, data: { payoutDetails: { ...clean, updatedAt: new Date().toISOString(), updatedBy: adminId ? 'admin' : 'mentor' } } });
    if (adminId) await this.audit(adminId, 'MENTOR_PAYOUT_DETAILS_EDITED', 'MentorProfile', mentorId, clean.accountTitle);
    return clean;
  }
}
