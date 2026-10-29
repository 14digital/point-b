import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { AuthUser } from '../common/auth';
import { priceFor } from '../common/pricing';
import { DailyService } from '../calls/daily.service';
import { StripeService } from '../payments/stripe.service';
import { emailDate, webUrl } from '../common/email-template';
import { CancelBookingDto, CreateBookingDto, CreateReviewDto } from './bookings.dto';

export const HOLD_MINUTES = 15;
/** Students can move a confirmed session up to this many hours before it starts (2 days). */
export const DEFAULT_RESCHEDULE_HOURS = 48;
const REMINDER_MINUTES = 30;
// MongoDB omits unset optional fields, so "not reminded yet" must match both null and missing.
const NO_REMINDER = { OR: [{ reminderSentAt: null }, { reminderSentAt: { isSet: false } }] } satisfies Prisma.BookingWhereInput;

const include = {
  slot: true,
  mentor: { select: { id: true, slug: true, title: true, photoUrl: true, user: { select: { name: true, email: true } } } },
  student: { select: { id: true, name: true, email: true } },
  review: true,
  payments: { select: { providerRef: true, provider: true, status: true } },
} satisfies Prisma.BookingInclude;
/** The in-app call page. Everyone, mentor and student, joins through it; access is decided server-side. */
export const sessionUrl = (reference: string) => `${webUrl()}/session/${reference}`;
type FullBooking = Prisma.BookingGetPayload<{ include: typeof include }>;

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Bookings');
  private timer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService, private notify: NotificationsService, private daily: DailyService, private stripe: StripeService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sendReminders().catch((e) => this.log.error(`reminders failed: ${e.message}`)), 60_000);
    this.sendReminders().catch(() => undefined);
  }
  onModuleDestroy() { clearInterval(this.timer); }

  /** Emails student and mentor once per booking, from 30 minutes before the start. Safe across several API instances. */
  async sendReminders() {
    const now = new Date();
    const soon = await this.prisma.availabilitySlot.findMany({ where: { startAt: { gt: now, lte: new Date(now.getTime() + REMINDER_MINUTES * 60_000) } }, select: { id: true } });
    if (soon.length === 0) return;
    const due = await this.prisma.booking.findMany({ where: { status: 'CONFIRMED', ...NO_REMINDER, slotId: { in: soon.map((x) => x.id) } }, include });
    for (const b of due) {
      // Only the instance that flips reminderSentAt null -> set sends the emails.
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, ...NO_REMINDER }, data: { reminderSentAt: now } });
      if (claimed.count === 0) continue;
      const mins = Math.max(1, Math.round((b.slot.startAt.getTime() - now.getTime()) / 60_000));
      const link = sessionUrl(b.reference);
      const mentor = await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } });
      const facts = (who: [string, string]): [string, string][] => [who, ['Starts', emailDate(b.slot.startAt)], ['Reference', b.reference]];
      const cta = { label: 'Join your session', url: link };
      await this.notify.send(b.student.email, `Your session starts in ${mins} minutes`, `Hi ${b.student.name.split(' ')[0]},\n\nYour session with ${b.mentor.user.name} is about to begin. Use the button below to join. Your mentor will be in the room.`, b.student.id, { cta, facts: facts(['Mentor', b.mentor.user.name]) });
      await this.notify.send(b.mentor.user.email, `Your session starts in ${mins} minutes`, `Hi ${b.mentor.user.name.split(' ')[0]},\n\nYour session with ${b.student.name} is about to begin. You are the host: open the room first and the student will be let in.`, mentor?.userId, { cta, facts: [...facts(['Student', b.student.name]), ['Agenda', b.agenda]] });
    }
  }

  private shape(b: FullBooking, viewer?: AuthUser, noticeHours = DEFAULT_RESCHEDULE_HOURS) {
    const showLink = b.status === 'CONFIRMED' || b.status === 'COMPLETED';
    return {
      id: b.id, reference: b.reference, status: b.status, sessionKind: b.sessionKind, agenda: b.agenda,
      currentSituation: b.currentSituation, usefulOutcome: b.usefulOutcome, materialsToReview: b.materialsToReview,
      priceMinor: b.priceMinor, currency: b.currency,
      startAt: b.slot.startAt, endAt: b.slot.endAt,
      mentor: { id: b.mentor.id, slug: b.mentor.slug, name: b.mentor.user.name, title: b.mentor.title, photoUrl: b.mentor.photoUrl },
      student: viewer?.role === 'STUDENT' ? undefined : { id: b.student.id, name: b.student.name },
      meetingLink: showLink ? sessionUrl(b.reference) : null,
      review: b.review ? { rating: b.review.rating, comment: b.review.comment } : null,
      payment: b.payments[0] ?? null,
      holdExpiresAt: b.status === 'PENDING_PAYMENT' ? new Date(b.createdAt.getTime() + HOLD_MINUTES * 60_000) : null,
      cancelReason: b.cancelReason, createdAt: b.createdAt,
      rescheduleCount: b.rescheduleCount, rescheduledAt: b.rescheduledAt,
      rescheduleBy: b.status === 'CONFIRMED' ? new Date(b.slot.startAt.getTime() - noticeHours * 3600_000) : null,
    };
  }

  private async noticeHours() {
    const s = await this.prisma.setting.findUnique({ where: { key: 'reschedule_notice_hours' } });
    return s ? Number(s.value) : DEFAULT_RESCHEDULE_HOURS;
  }

  /** Frees slots held by unpaid bookings after HOLD_MINUTES. Safe to call often. */
  async releaseExpiredHolds() {
    const cutoff = new Date(Date.now() - HOLD_MINUTES * 60_000);
    const stale = await this.prisma.booking.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } }, select: { id: true, slotId: true, payments: { select: { provider: true, providerRef: true, status: true } } } });
    for (const b of stale) {
      for (const p of b.payments) if (p.provider === 'stripe' && p.status === 'PENDING' && p.providerRef.startsWith('pi_')) await this.stripe.cancelIntent(p.providerRef);
      await this.prisma.$transaction([
        this.prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Payment not completed in time' } }),
        this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'PENDING' }, data: { status: 'FAILED' } }),
        this.prisma.availabilitySlot.update({ where: { id: b.slotId }, data: { isBooked: false, seatsTaken: { decrement: 1 } } }),
      ]);
    }
  }

  /** MongoDB aborts one of two transactions touching the same document (P2034); group seats make that likely, so retry. */
  private async withWriteConflictRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
    for (let i = 1; ; i++) {
      try { return await fn(); } catch (e) {
        if ((e as { code?: string }).code !== 'P2034' || i >= attempts) throw e;
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * i));
      }
    }
  }

  async create(user: AuthUser, dto: CreateBookingDto) {
    await this.releaseExpiredHolds();
    const student = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (student.dateOfBirth) {
      const age = (Date.now() - student.dateOfBirth.getTime()) / (365.25 * 86400_000);
      if (age < 18 && !student.guardianConsent) {
        throw new ForbiddenException('A parent or guardian must give consent before students under 18 can book. We have emailed them.');
      }
    }
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: dto.slotId }, include: { mentor: true } });
    if (!slot || slot.mentor.status !== 'ACTIVE') throw new NotFoundException('This slot is no longer available');
    if (slot.startAt.getTime() <= Date.now() + 15 * 60_000) throw new BadRequestException('This slot starts too soon to book');
    if (slot.mentor.userId === user.id) throw new BadRequestException('You cannot book your own session');
    const { priceMinor, currency } = await priceFor(this.prisma, slot.mentor, slot.kind);
    const already = await this.prisma.booking.findFirst({ where: { slotId: slot.id, studentId: user.id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } }, select: { id: true } });
    if (already) throw new ConflictException('You already have a seat in this session');
    const reference = 'PBM-' + randomBytes(4).toString('hex').toUpperCase();

    try {
      const booking = await this.withWriteConflictRetry(() => this.prisma.$transaction(async (tx) => {
        // Atomic claim of one seat: succeeds only while seats remain (1:1 slots have a single seat).
        const claimed = await tx.availabilitySlot.updateMany({ where: { id: slot.id, isBooked: false, seatsTaken: { lt: slot.capacity } }, data: { seatsTaken: { increment: 1 } } });
        if (claimed.count === 0) throw new ConflictException('Sorry, that slot was just taken. Please choose another time.');
        await tx.availabilitySlot.updateMany({ where: { id: slot.id, seatsTaken: { gte: slot.capacity } }, data: { isBooked: true } });
        const b = await tx.booking.create({
          data: {
            reference, studentId: user.id, mentorId: slot.mentorId, slotId: slot.id, sessionKind: slot.kind,
            agenda: dto.agenda, currentSituation: dto.currentSituation, usefulOutcome: dto.usefulOutcome,
            materialsToReview: dto.materialsToReview ?? '', priceMinor, currency,
          },
        });
        await tx.payment.create({ data: { bookingId: b.id, provider: this.stripe.enabled() ? 'stripe' : (process.env.PAYMENTS_PROVIDER ?? 'mock'), providerRef: 'pay_' + randomBytes(10).toString('hex'), amountMinor: priceMinor, currency } });
        return b;
      }));
      return this.get(user, booking.reference);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002' || (e as { code?: string }).code === 'P2034') throw new ConflictException('Sorry, that slot was just taken. Please choose another time.');
      throw e;
    }
  }

  async listMine(user: AuthUser) {
    await this.releaseExpiredHolds();
    const rows = await this.prisma.booking.findMany({ where: { studentId: user.id }, include, orderBy: { slot: { startAt: 'desc' } } });
    const hours = await this.noticeHours();
    return rows.map((r) => this.shape(r, user, hours));
  }

  private async load(user: AuthUser, reference: string): Promise<FullBooking> {
    const b = await this.prisma.booking.findUnique({ where: { reference }, include });
    if (!b) throw new NotFoundException('Booking not found');
    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    const allowed = user.role === 'ADMIN' || b.studentId === user.id || mentorUserId === user.id;
    if (!allowed) throw new NotFoundException('Booking not found'); // do not reveal existence
    return b;
  }

  async get(user: AuthUser, reference: string) {
    return this.shape(await this.load(user, reference), user, await this.noticeHours());
  }

  /**
   * Gate for the call page. Returns a join URL and personal token only inside the session window,
   * and, for students, only once the mentor is in the room.
   */
  async call(user: AuthUser, reference: string) {
    const b = await this.load(user, reference);
    const base = { reference: b.reference, mentorName: b.mentor.user.name, startAt: b.slot.startAt, endAt: b.slot.endAt, sessionKind: b.sessionKind };
    if (b.status !== 'CONFIRMED' && b.status !== 'COMPLETED') return { ...base, state: 'not_confirmed' as const };
    const now = Date.now();
    if (now > b.slot.endAt.getTime() + 60 * 60_000) return { ...base, state: 'ended' as const };
    const mentorUserId = (await this.prisma.mentorProfile.findUniqueOrThrow({ where: { id: b.mentorId }, select: { userId: true } })).userId;
    const isHost = user.id === mentorUserId || user.role === 'ADMIN';
    // Nobody, mentor or student, can enter before the room opens 10 minutes ahead of the start.
    if (now < b.slot.startAt.getTime() - 10 * 60_000) return { ...base, state: 'too_early' as const };
    if (!this.daily.enabled()) throw new ServiceUnavailableException('Video calling is not configured yet. Please contact support.');
    const room = 'pb-' + (b.sessionKind === 'GROUP' ? b.slotId : b.reference).toLowerCase();
    const slot = b.slot;
    // Students wait for the mentor to arrive. (If Daily cannot tell, let them in rather than block the session.)
    if (!isHost && (await this.daily.presence(room, mentorUserId)) === 'no') return { ...base, state: 'waiting_for_host' as const };
    const url = await this.daily.ensureRoom(room, slot.endAt, slot.capacity + 2);
    if (isHost && !b.hostStartedAt) await this.prisma.booking.updateMany({ where: { id: b.id, hostStartedAt: { isSet: false } }, data: { hostStartedAt: new Date() } });
    const token = await this.daily.token(room, { userId: user.id, userName: user.name, owner: isHost, startAt: slot.startAt, endAt: slot.endAt });
    return { ...base, state: 'ready' as const, url, token, isHost };
  }

  /** Called by the payments module once the provider confirms the charge. Idempotent. */
  async confirmPaid(bookingId: string) {
    const b = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include });
    if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') return;
    if (b.status !== 'PENDING_PAYMENT') {
      // Paid after the hold lapsed: slot may have been rebooked. Needs manual refund.
      throw new ConflictException('Booking is no longer awaiting payment');
    }
    await this.prisma.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED', meetingLink: sessionUrl(b.reference) } });
    const when = b.slot.startAt.toISOString();
    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    const link = sessionUrl(b.reference);
    const kind = b.sessionKind === 'GROUP' ? 'Group session' : '1:1 session';
    const facts = (who: [string, string]): [string, string][] => [who, ['Date and time', emailDate(b.slot.startAt)], ['Type', kind], ['Agenda', b.agenda], ['Reference', b.reference]];
    const cta = { label: 'View your session', url: link };
    await this.notify.send(b.student.email, 'Your booking is confirmed', `Hi ${b.student.name.split(' ')[0]},\n\nThank you for booking. Your session with ${b.mentor.user.name} is confirmed and your payment has been received.\n\nYou can join from your dashboard when it is time. We will email you a reminder 30 minutes before it starts. If you need a different time, you can reschedule from your dashboard up to 2 days before the start.`, b.student.id, { cta, facts: facts(['Mentor', b.mentor.user.name]) });
    await this.notify.send(b.mentor.user.email, 'You have a new booking', `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} has booked a session with you. Their preparation notes are on your dashboard so you can read them beforehand.`, mentorUserId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor` }, facts: facts(['Student', b.student.name]) });
  }

  /**
   * Moves a confirmed session to another open time with the same mentor and the same session type.
   * Allowed until `reschedule_notice_hours` (default 48) before the current start. The fee carries over.
   */
  async reschedule(user: AuthUser, reference: string, newSlotId: string) {
    const b = await this.load(user, reference);
    if (b.studentId !== user.id) throw new ForbiddenException('Only the student who booked can reschedule');
    if (b.status !== 'CONFIRMED') throw new BadRequestException('Only confirmed sessions can be rescheduled');
    const hours = await this.noticeHours();
    if (b.slot.startAt.getTime() - Date.now() < hours * 3600_000) {
      throw new BadRequestException(`Sessions can be rescheduled up to ${hours / 24 === Math.round(hours / 24) ? `${hours / 24} days` : `${hours} hours`} before the start time, so this one can no longer be moved.`);
    }
    if (newSlotId === b.slotId) throw new BadRequestException('Please choose a different time');
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: newSlotId } });
    if (!slot || slot.mentorId !== b.mentorId) throw new BadRequestException('That time isn\'t available with this mentor');
    if (slot.kind !== b.sessionKind) throw new BadRequestException(`Please choose another ${b.sessionKind === 'GROUP' ? 'group' : '1:1'} time`);
    if (slot.startAt.getTime() <= Date.now() + 60 * 60_000) throw new BadRequestException('Please choose a time at least an hour from now');
    const already = await this.prisma.booking.findFirst({ where: { slotId: slot.id, studentId: user.id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } }, select: { id: true } });
    if (already) throw new ConflictException('You already have a seat in that session');

    const oldStart = b.slot.startAt;
    try {
      await this.withWriteConflictRetry(() => this.prisma.$transaction(async (tx) => {
        const claimed = await tx.availabilitySlot.updateMany({ where: { id: slot.id, isBooked: false, seatsTaken: { lt: slot.capacity } }, data: { seatsTaken: { increment: 1 } } });
        if (claimed.count === 0) throw new ConflictException('Sorry, that time was just taken. Please choose another.');
        await tx.availabilitySlot.updateMany({ where: { id: slot.id, seatsTaken: { gte: slot.capacity } }, data: { isBooked: true } });
        await tx.availabilitySlot.update({ where: { id: b.slotId }, data: { isBooked: false, seatsTaken: { decrement: 1 } } });
        // A new time means a new reminder and a fresh call room state.
        await tx.booking.update({
          where: { id: b.id },
          data: { slotId: slot.id, reminderSentAt: { unset: true }, hostStartedAt: { unset: true }, rescheduledAt: new Date(), rescheduleCount: { increment: 1 } },
        });
      }));
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034') throw new ConflictException('Sorry, that time was just taken. Please choose another.');
      throw e;
    }

    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    const facts = (who: [string, string]): [string, string][] => [who, ['New time', emailDate(slot.startAt)], ['Previously', emailDate(oldStart)], ['Reference', b.reference]];
    await this.notify.send(b.student.email, 'Your session has been rescheduled', `Hi ${b.student.name.split(' ')[0]},\n\nYour session with ${b.mentor.user.name} has been moved to a new time. Your payment carries over, so there is nothing more to pay.\n\nWe will email you a reminder 30 minutes before it starts.`, b.student.id, { cta: { label: 'View your session', url: sessionUrl(b.reference) }, facts: facts(['Mentor', b.mentor.user.name]) });
    await this.notify.send(b.mentor.user.email, 'A session has been rescheduled', `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} has moved their session with you to a new time. The original time is open again for other students.`, mentorUserId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor` }, facts: facts(['Student', b.student.name]) });
    return this.get(user, reference);
  }

  /**
   * Students reschedule; they can't cancel a confirmed session. The only student "cancel" is releasing
   * an unpaid hold. Admins can still cancel (with a refund) for exceptional support cases.
   */
  async cancel(user: AuthUser, reference: string, dto: CancelBookingDto) {
    const b = await this.load(user, reference);
    if (b.status !== 'CONFIRMED' && b.status !== 'PENDING_PAYMENT') throw new BadRequestException('This booking can no longer be cancelled');
    const isStudent = b.studentId === user.id && user.role === 'STUDENT';
    if (user.role !== 'ADMIN' && !(isStudent && b.status === 'PENDING_PAYMENT')) {
      throw new ForbiddenException('Confirmed sessions can\'t be cancelled, but you can reschedule up to 2 days before the start time.');
    }
    // Refund card payments with Stripe first, so a booking is never marked refunded when the money didn't move.
    for (const p of await this.prisma.payment.findMany({ where: { bookingId: b.id, status: 'SUCCEEDED', provider: 'stripe' } })) {
      try { await this.stripe.refund(p.providerRef, `Booking ${b.reference} cancelled`); } catch (e) {
        this.log.error(`Refund failed for ${b.reference}: ${(e as Error).message}`);
        throw new BadGatewayException('We couldn\'t process the refund just now, so the booking is still active. Please try again in a few minutes or contact support.');
      }
    }
    for (const p of await this.prisma.payment.findMany({ where: { bookingId: b.id, status: 'PENDING', provider: 'stripe' } })) {
      if (p.providerRef.startsWith('pi_')) await this.stripe.cancelIntent(p.providerRef);
    }
    await this.prisma.$transaction([
      this.prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason ?? (isStudent ? 'Cancelled by student' : 'Cancelled by mentor/admin') } }),
      this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'SUCCEEDED' }, data: { status: 'REFUNDED' } }),
      this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'PENDING' }, data: { status: 'FAILED' } }),
      this.prisma.availabilitySlot.update({ where: { id: b.slotId }, data: { isBooked: false, seatsTaken: { decrement: 1 } } }),
    ]);
    const refunded = b.status === 'CONFIRMED';
    const by = isStudent ? 'the student' : 'your mentor or our team';
    const cf = (who: [string, string]): [string, string][] => [who, ['Was scheduled for', emailDate(b.slot.startAt)], ['Reference', b.reference]];
    await this.notify.send(b.student.email, 'Your booking has been cancelled', `Hi ${b.student.name.split(' ')[0]},\n\nYour session with ${b.mentor.user.name} has been cancelled${isStudent ? '' : ` by ${by}`}.${refunded ? ' A full refund has been issued to your original payment method.' : ' You were not charged.'}\n\nYou are welcome to book another time whenever suits you.`, b.student.id, { cta: { label: 'Find another time', url: `${webUrl()}/mentors/${b.mentor.slug}` }, facts: cf(['Mentor', b.mentor.user.name]) });
    await this.notify.send(b.mentor.user.email, 'A session has been cancelled', `Hi ${b.mentor.user.name.split(' ')[0]},\n\nThe session with ${b.student.name} has been cancelled${isStudent ? ' by the student' : ''}. The time slot is open again for other students.`, (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor` }, facts: cf(['Student', b.student.name]) });
    return this.get(user, reference);
  }

  async markCompleted(user: AuthUser, reference: string, outcome: 'COMPLETED' | 'NO_SHOW' = 'COMPLETED') {
    const b = await this.load(user, reference);
    const mentorUserId = (await this.prisma.mentorProfile.findUniqueOrThrow({ where: { id: b.mentorId } })).userId;
    if (user.role !== 'ADMIN' && mentorUserId !== user.id) throw new ForbiddenException('Only the mentor can complete this session');
    if (b.status !== 'CONFIRMED') throw new BadRequestException('Only confirmed sessions can be completed');
    // Allowed from the scheduled start, or earlier if the mentor has already opened the call room.
    if (b.slot.startAt.getTime() > Date.now() && !b.hostStartedAt) throw new BadRequestException('This session has not started yet');
    await this.prisma.booking.update({ where: { id: b.id }, data: { status: outcome, completedAt: new Date() } });
    if (outcome === 'COMPLETED') {
      await this.notify.send(b.student.email, `How was your session with ${b.mentor.user.name}?`, `Hi ${b.student.name.split(' ')[0]},\n\nThank you for your session with ${b.mentor.user.name}. Your feedback takes less than a minute and helps other students choose the right mentor, and it helps your mentor improve.\n\nPlease rate your session and share a few words about how it went.`, b.student.id, { cta: { label: 'Leave your feedback', url: `${webUrl()}/dashboard/student` }, facts: [['Mentor', b.mentor.user.name], ['Session', emailDate(b.slot.startAt)], ['Reference', b.reference]] });
    }
    return this.get(user, reference);
  }

  async review(user: AuthUser, reference: string, dto: CreateReviewDto) {
    const b = await this.load(user, reference);
    if (b.studentId !== user.id) throw new ForbiddenException('Only the student can review this session');
    if (b.status !== 'COMPLETED') throw new BadRequestException('You can review a session once it has been completed');
    if (b.review) throw new ConflictException('You have already reviewed this session');
    await this.prisma.review.create({ data: { bookingId: b.id, rating: dto.rating, comment: dto.comment } });
    return this.get(user, reference);
  }
}
