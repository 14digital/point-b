import type { BookingStatus } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { WalletService } from '../common/wallet.service';
import { AuthUser } from '../common/auth';
import { bookingFee, commissionFor, commissionRules, priceFor, visitorPricing } from '../common/pricing';
import { money } from '../common/currency';
import { DailyService } from '../calls/daily.service';
import { StripeService } from '../payments/stripe.service';
import { ActivityService } from '../activity/activity.service';
import { emailDate, webUrl } from '../common/email-template';
import { CancelBookingDto, CreateBookingDto, CreateReviewDto, PromoCheckDto } from './bookings.dto';

export const HOLD_MINUTES = 15;
/** Default for how many hours before the start a student can still move a session; admins change it with `reschedule_notice_hours`. */
/** "3 days" for whole days, otherwise "36 hours". */
export const noticeLabel = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hour${h === 1 ? '' : 's'}`);
export const DEFAULT_RESCHEDULE_HOURS = 48;
const REMINDER_MINUTES = 30;
const CLOSE_CHECK_MINUTES = 10;
/** How long after the start a student must wait, and how long after the end they can still report, that the mentor never joined. */
const REPORT_AFTER_MINUTES = 10;
const REPORT_WINDOW_DAYS = 7;
// MongoDB omits unset optional fields, so "not reminded yet" must match both null and missing.
const NO_REMINDER = { OR: [{ reminderSentAt: null }, { reminderSentAt: { isSet: false } }] } satisfies Prisma.BookingWhereInput;

const include = {
  slot: true,
  course: { select: { id: true, slug: true, title: true, sessionsCount: true, sessionMinutes: true, weekdays: true, startTime: true, slots: { select: { id: true, sessionNumber: true, startAt: true, endAt: true, hostStartedAt: true }, orderBy: { startAt: 'asc' } } } },
  mentor: { select: { id: true, slug: true, title: true, photoUrl: true, user: { select: { name: true, email: true } } } },
  student: { select: { id: true, name: true, email: true } },
  review: true,
  payments: { select: { providerRef: true, provider: true, status: true, processedAt: true, bankSubmittedAt: true, bankTxnRef: true }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.BookingInclude;
/** The in-app call page. Everyone, mentor and student, joins through it; access is decided server-side. */
export const sessionUrl = (reference: string) => `${webUrl()}/session/${reference}`;
type FullBooking = Prisma.BookingGetPayload<{ include: typeof include }>;
/** Bookings that are a single session rather than a course enrolment. */
const NOT_COURSE = { OR: [{ courseId: null }, { courseId: { isSet: false } }] } satisfies Prisma.BookingWhereInput;
const UNREMINDED_SLOT = { OR: [{ reminderSentAt: null }, { reminderSentAt: { isSet: false } }] } satisfies Prisma.AvailabilitySlotWhereInput;
/** The class of a course that is on now (the room is open from 10 minutes before to an hour after), or else the next one. */
export function currentClass<T extends { startAt: Date; endAt: Date }>(classes: T[], now = Date.now()): { live: T | null; next: T | null } {
  const live = classes.find((c) => now >= c.startAt.getTime() - 10 * 60_000 && now <= c.endAt.getTime() + 60 * 60_000) ?? null;
  return { live, next: classes.find((c) => c.startAt.getTime() > now) ?? null };
}
const lastClass = (b: FullBooking) => b.course?.slots[b.course.slots.length - 1] ?? b.slot;

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Bookings');
  private timer?: NodeJS.Timeout;
  private closer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService, private notify: NotificationsService, private daily: DailyService, private stripe: StripeService, private activity: ActivityService, private wallet: WalletService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sendReminders().catch((e) => this.log.error(`reminders failed: ${e.message}`)), 60_000);
    this.sendReminders().catch(() => undefined);
    this.closer = setInterval(() => this.closeFinished().catch((e) => this.log.error(`closing sessions failed: ${e.message}`)), CLOSE_CHECK_MINUTES * 60_000);
  }
  onModuleDestroy() { clearInterval(this.timer); clearInterval(this.closer); }

  /**
   * Marks a session completed a day after it ended if the mentor opened the room but never recorded the outcome.
   * Sessions the mentor never joined are left open: the student can report those, and the team can see them.
   */
  async closeFinished() {
    const now = Date.now();
    const due = await this.prisma.booking.findMany({ where: { status: 'CONFIRMED', hostStartedAt: { isSet: true, not: null }, slot: { endAt: { lt: new Date(now - 24 * 3600_000) } }, ...NOT_COURSE }, include, take: 100 });
    for (const b of due) {
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'COMPLETED', completedAt: new Date() } });
      // An email about a session from weeks ago would only confuse people.
      if (claimed.count && !b.review && b.slot.endAt.getTime() > now - REPORT_WINDOW_DAYS * 86400_000) await this.askForFeedback(b);
    }
    // Course enrolments finish shortly after the final class (grace), then we ask for one end-of-course review.
    const COURSE_FEEDBACK_GRACE_MS = 15 * 60_000;
    const finished = await this.prisma.course.findMany({ where: { status: { in: ['LIVE', 'CLOSED'] }, bookings: { some: { status: 'CONFIRMED' } } }, select: { id: true, slots: { select: { endAt: true }, orderBy: { startAt: 'desc' }, take: 1 } } });
    for (const c of finished.filter((c) => c.slots[0] && c.slots[0].endAt.getTime() < now - COURSE_FEEDBACK_GRACE_MS)) {
      const open = await this.prisma.booking.findMany({ where: { courseId: c.id, status: 'CONFIRMED' }, include, take: 500 });
      for (const b of open) {
        const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'COMPLETED', completedAt: new Date() } });
        if (claimed.count && !b.review && lastClass(b).endAt.getTime() > now - REPORT_WINDOW_DAYS * 86400_000) await this.askForFeedback(b);
      }
    }
  }

  /** Emails student and mentor once per booking, from 30 minutes before the start. Safe across several API instances. */
  async sendReminders() {
    const now = new Date();
    const soon = await this.prisma.availabilitySlot.findMany({ where: { startAt: { gt: now, lte: new Date(now.getTime() + REMINDER_MINUTES * 60_000) } }, select: { id: true } });
    if (soon.length === 0) return;
    await this.sendClassReminders(now);
    const due = await this.prisma.booking.findMany({ where: { status: 'CONFIRMED', ...NO_REMINDER, ...NOT_COURSE, slotId: { in: soon.map((x) => x.id) } }, include });
    for (const b of due) {
      // Only the instance that flips reminderSentAt null -> set sends the emails.
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, ...NO_REMINDER }, data: { reminderSentAt: now } });
      if (claimed.count === 0) continue;
      const mins = Math.max(1, Math.round((b.slot.startAt.getTime() - now.getTime()) / 60_000));
      const link = sessionUrl(b.reference);
      const mentor = await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } });
      const facts = (who: [string, string]): [string, string][] => [who, ['Starts', emailDate(b.slot.startAt)], ['Reference', b.reference]];
      const cta = { label: 'Join your session', url: link };
      await this.notify.send(b.student.email, `Your session starts in ${mins} minutes`, `Hi ${b.student.name.split(' ')[0]},\n\nYour session with ${b.mentor.user.name} is about to begin. Use the button below to join. Your mentor will be in the room.`, b.student.id, { cta, facts: facts(['Mentor', b.mentor.user.name]), whatsapp: { alert: 'sessionReminder', params: [b.student.name.split(' ')[0], b.mentor.user.name, String(mins), link] } });
      await this.notify.send(b.mentor.user.email, `Your session starts in ${mins} minutes`, `Hi ${b.mentor.user.name.split(' ')[0]},\n\nYour session with ${b.student.name} is about to begin. You are the host: open the room first and your mentee will be let in.`, mentor?.userId, { cta, facts: [...facts(['Student', b.student.name]), ['Agenda', b.agenda]] });
    }
  }

  /** Before each class of a course: one reminder to every enrolled learner and to the mentor. Claimed per class. */
  private async sendClassReminders(now: Date) {
    const classes = await this.prisma.availabilitySlot.findMany({ where: { courseId: { not: null }, startAt: { gt: now, lte: new Date(now.getTime() + REMINDER_MINUTES * 60_000) }, ...UNREMINDED_SLOT }, include: { course: { select: { id: true, title: true, sessionsCount: true, mentor: { select: { userId: true, user: { select: { name: true, email: true } } } } } } } });
    for (const k of classes) {
      if (!k.course) continue;
      const claimed = await this.prisma.availabilitySlot.updateMany({ where: { id: k.id, ...UNREMINDED_SLOT }, data: { reminderSentAt: now } });
      if (!claimed.count) continue;
      const mins = Math.max(1, Math.round((k.startAt.getTime() - now.getTime()) / 60_000));
      const label = `Class ${k.sessionNumber ?? 1} of ${k.course.sessionsCount}`;
      const learners = await this.prisma.booking.findMany({ where: { courseId: k.course.id, status: 'CONFIRMED' }, select: { reference: true, student: { select: { id: true, name: true, email: true } } } });
      for (const l of learners) {
        const link = sessionUrl(l.reference);
        await this.notify.send(l.student.email, `${k.course.title} starts in ${mins} minutes`, `Hi ${l.student.name.split(' ')[0]},\n\nYour class with ${k.course.mentor.user.name} is about to begin. Use the button below to join.`, l.student.id, { cta: { label: 'Join the class', url: link }, facts: [['Course', k.course.title], ['Class', label], ['Starts', emailDate(k.startAt)]], whatsapp: { alert: 'sessionReminder', params: [l.student.name.split(' ')[0], k.course.mentor.user.name, String(mins), link] } });
      }
      await this.notify.send(k.course.mentor.user.email, `${k.course.title} starts in ${mins} minutes`, `Hi ${k.course.mentor.user.name.split(' ')[0]},\n\nYour class is about to begin, with ${learners.length} learner${learners.length === 1 ? '' : 's'} enrolled. You are the host: open the room first and your learners will be let in.`, k.course.mentor.userId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor?tab=courses` }, facts: [['Course', k.course.title], ['Class', label], ['Starts', emailDate(k.startAt)]] });
    }
  }

  private shape(b: FullBooking, viewer?: AuthUser, noticeHours = DEFAULT_RESCHEDULE_HOURS) {
    const showLink = b.status === 'CONFIRMED' || b.status === 'COMPLETED';
    return {
      id: b.id, reference: b.reference, status: b.status, sessionKind: b.sessionKind, agenda: b.agenda,
      currentSituation: b.currentSituation, usefulOutcome: b.usefulOutcome, materialsToReview: b.materialsToReview,
      priceMinor: b.priceMinor, currency: b.currency, listPriceMinor: b.listPriceMinor ?? b.priceMinor, discountMinor: b.discountMinor ?? 0, walletAppliedMinor: b.walletAppliedMinor ?? 0,
      startAt: b.slot.startAt, endAt: b.slot.endAt,
      mentor: { id: b.mentor.id, slug: b.mentor.slug, name: b.mentor.user.name, title: b.mentor.title, photoUrl: b.mentor.photoUrl },
      student: viewer?.role === 'STUDENT' ? undefined : { id: b.student.id, name: b.student.name },
      meetingLink: showLink ? sessionUrl(b.reference) : null,
      review: b.review ? {
        rating: b.review.rating, comment: b.review.comment, status: b.review.status ?? 'APPROVED', canEdit: !b.review.editedAt,
        clarity: b.review.clarity ?? null, usefulness: b.review.usefulness ?? null, recommend: b.review.recommend ?? null,
      } : null,
      canReview: !b.review && this.reviewable(b),
      canReportMissing: viewer?.id === b.studentId && this.mentorMissing(b),
      mentorReport: b.mentorReportStatus ?? null, mentorReportNote: b.mentorReportNote ?? null,
      payment: b.payments[0] ?? null,
      holdExpiresAt: b.status === 'PENDING_PAYMENT' && !b.awaitingVerification ? new Date(b.createdAt.getTime() + HOLD_MINUTES * 60_000) : null,
      awaitingVerification: b.status === 'PENDING_PAYMENT' && !!b.awaitingVerification,
      cancelReason: b.cancelReason, createdAt: b.createdAt,
      rescheduleCount: b.rescheduleCount, rescheduledAt: b.rescheduledAt,
      rescheduleBy: b.status === 'CONFIRMED' && !b.course ? new Date(b.slot.startAt.getTime() - noticeHours * 3600_000) : null,
      cancelBy: b.status === 'CONFIRMED' ? new Date(b.slot.startAt.getTime() - noticeHours * 3600_000) : null,
      course: b.course ? (() => {
        const { live, next } = currentClass(b.course.slots);
        const last = b.course.slots[b.course.slots.length - 1];
        return {
          id: b.course.id, slug: b.course.slug, title: b.course.title, sessionsCount: b.course.sessionsCount,
          classes: b.course.slots.map((k) => ({ number: k.sessionNumber ?? 1, startAt: k.startAt, endAt: k.endAt })),
          liveClass: live ? { number: live.sessionNumber ?? 1, startAt: live.startAt, endAt: live.endAt } : null,
          nextClass: next ? { number: next.sessionNumber ?? 1, startAt: next.startAt, endAt: next.endAt } : null,
          endsAt: last?.endAt ?? b.slot.endAt,
        };
      })() : null,
    };
  }

  async noticeHours() {
    const s = await this.prisma.setting.findUnique({ where: { key: 'reschedule_notice_hours' } });
    const n = s ? Number(s.value) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RESCHEDULE_HOURS;
  }

  /** Frees slots held by unpaid bookings after HOLD_MINUTES. Safe to call often. */
  async releaseExpiredHolds() {
    const cutoff = new Date(Date.now() - HOLD_MINUTES * 60_000);
    // Bookings waiting for an admin to check a bank transfer keep their slot until it is approved or rejected.
    const stale = await this.prisma.booking.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff }, OR: [{ awaitingVerification: null }, { awaitingVerification: false }, { awaitingVerification: { isSet: false } }] }, select: { id: true, slotId: true, studentId: true, reference: true, currency: true, walletAppliedMinor: true, payments: { select: { provider: true, providerRef: true, status: true } } } });
    for (const b of stale) {
      for (const p of b.payments) if (p.provider === 'stripe' && p.status === 'PENDING' && p.providerRef.startsWith('pi_')) await this.stripe.cancelIntent(p.providerRef);
      await this.prisma.$transaction([
        this.prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Payment not completed in time' } }),
        this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'PENDING' }, data: { status: 'FAILED' } }),
        this.prisma.availabilitySlot.update({ where: { id: b.slotId }, data: { isBooked: false, seatsTaken: { decrement: 1 } } }),
      ]);
      await this.wallet.returnUnused(b);
      this.activity.record(b.studentId, 'hold_expired', { reference: b.reference });
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

  async create(user: AuthUser, dto: CreateBookingDto, country?: string | null) {
    await this.releaseExpiredHolds();
    if (!user.emailVerified) throw new ForbiddenException('Please confirm your email address before booking.');
    const student = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (student.dateOfBirth) {
      const age = (Date.now() - student.dateOfBirth.getTime()) / (365.25 * 86400_000);
      if (age < 18 && !student.guardianConsent) {
        throw new ForbiddenException('A parent or guardian must give consent before anyone under 18 can book. We have emailed them.');
      }
    }
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: dto.slotId }, include: { mentor: true } });
    if (!slot || slot.mentor.status !== 'ACTIVE') throw new NotFoundException('This slot is no longer available');
    if (slot.startAt.getTime() <= Date.now() + 15 * 60_000) throw new BadRequestException('This slot starts too soon to book');
    if (slot.mentor.userId === user.id) throw new BadRequestException('You cannot book your own session');
    const { priceMinor: listPriceMinor, currency } = await priceFor(this.prisma, slot.mentor, slot.kind, await visitorPricing(this.prisma, country));
    if ((dto.expectedPriceMinor !== undefined && dto.expectedPriceMinor !== listPriceMinor) || (dto.expectedCurrency && dto.expectedCurrency !== currency)) {
      throw new ConflictException('The price for your location has changed. Please refresh the page to see the latest price.');
    }
    const repeatStudent = await this.isRepeat(user.id, slot.mentorId);
    const promo = dto.promoCode?.trim() ? await this.resolveCode(user.id, dto.promoCode, slot) : null;
    const discountMinor = promo ? Math.round((listPriceMinor * promo.percentOff) / 100 / 100) * 100 : 0;
    const priceMinor = listPriceMinor - discountMinor;
    const commissionPercent = commissionFor(await commissionRules(this.prisma), slot.mentor.level, slot.kind, repeatStudent);
    const referral = promo?.kind === 'referral';
    const pricing = {
      listPriceMinor, discountMinor, repeatStudent, commissionPercent,
      promoCodeId: promo?.kind === 'promo' ? promo.id : null,
      referralCodeId: referral ? promo.id : null,
      mentorPaidInFull: referral ? true : null,
      platformFeeMinor: commissionPercent == null ? null : bookingFee(priceMinor, commissionPercent, { listPriceMinor, mentorPaidInFull: referral }),
    };
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
            materialsToReview: dto.materialsToReview ?? '', priceMinor, currency, ...pricing,
          },
        });
        await tx.payment.create({ data: { bookingId: b.id, provider: this.stripe.enabled() ? 'stripe' : (process.env.PAYMENTS_PROVIDER ?? 'mock'), providerRef: 'pay_' + randomBytes(10).toString('hex'), amountMinor: priceMinor, currency } });
        return b;
      }));
      this.activity.record(user.id, 'booking_held', { reference: booking.reference });
      return this.get(user, booking.reference);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002' || (e as { code?: string }).code === 'P2034') throw new ConflictException('Sorry, that slot was just taken. Please choose another time.');
      throw e;
    }
  }

  /** Whether the student has already had a paid session with this mentor. */
  private async isRepeat(studentId: string, mentorId: string) {
    return !!(await this.prisma.booking.findFirst({ where: { studentId, mentorId, status: { in: ['CONFIRMED', 'COMPLETED'] } }, select: { id: true } }));
  }

  /**
   * A code the student may use on this slot. Either a mentor's personal promo code (theirs, from this mentor, for a 1:1,
   * unused, unexpired and not held by another booking), or a company referral code for this mentor, which any student
   * can use once while it is live. On a referral the mentor is still paid in full.
   */
  private async resolveCode(studentId: string, raw: string, slot: { id: string; mentorId: string; kind: string }) {
    const code = raw.trim().toUpperCase();
    const ref = await this.prisma.referralCode.findUnique({ where: { code } });
    if (ref) {
      if (ref.mentorId !== slot.mentorId) throw new BadRequestException('That referral code is for sessions with a different mentor.');
      if (slot.kind !== 'ONE_TO_ONE') throw new BadRequestException('Referral codes apply to 1:1 sessions only.');
      if (ref.pausedAt) throw new BadRequestException('That referral code is not active at the moment.');
      if (ref.expiresAt && ref.expiresAt < new Date()) throw new BadRequestException('That referral code has expired.');
      const live = { referralCodeId: ref.id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'] as BookingStatus[] } };
      if (await this.prisma.booking.findFirst({ where: { ...live, studentId }, select: { id: true } })) throw new BadRequestException('You have already used this referral code.');
      if (ref.maxUses != null && (await this.prisma.booking.count({ where: live })) >= ref.maxUses) throw new BadRequestException('That referral code has reached its limit.');
      return { kind: 'referral' as const, id: ref.id, code: ref.code, percentOff: ref.percentOff };
    }
    const p = await this.resolvePromo(studentId, code, slot);
    return { kind: 'promo' as const, id: p.id, code: p.code, percentOff: p.percentOff };
  }

  private async resolvePromo(studentId: string, raw: string, slot: { id: string; mentorId: string; kind: string }) {
    const code = raw.trim().toUpperCase();
    const p = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!p || p.studentId !== studentId || p.revokedAt) throw new BadRequestException('That promo code is not valid for your account.');
    if (p.mentorId !== slot.mentorId) throw new BadRequestException('That promo code is for sessions with a different mentor.');
    if (slot.kind !== 'ONE_TO_ONE') throw new BadRequestException('Promo codes apply to 1:1 sessions only.');
    if (p.usedAt) throw new BadRequestException('That promo code has already been used.');
    if (p.expiresAt < new Date()) throw new BadRequestException('That promo code has expired.');
    const held = await this.prisma.booking.findFirst({ where: { promoCodeId: p.id, status: 'PENDING_PAYMENT' }, select: { id: true } });
    if (held) throw new BadRequestException('That promo code is already applied to a booking awaiting payment.');
    return p;
  }

  async promoCheck(user: AuthUser, dto: PromoCheckDto, country?: string | null) {
    await this.releaseExpiredHolds();
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: dto.slotId }, include: { mentor: true } });
    if (!slot) throw new NotFoundException('This slot is no longer available');
    const p = await this.resolveCode(user.id, dto.code, slot);
    const { priceMinor, currency } = await priceFor(this.prisma, slot.mentor, slot.kind, await visitorPricing(this.prisma, country));
    const discountMinor = Math.round((priceMinor * p.percentOff) / 100 / 100) * 100;
    return { code: p.code, kind: p.kind, percentOff: p.percentOff, listPriceMinor: priceMinor, discountMinor, priceMinor: priceMinor - discountMinor, currency };
  }

  /** The student's promo codes that can still be used, so the booking form can offer them. */
  async myPromos(user: AuthUser) {
    const rows = await this.prisma.promoCode.findMany({ where: { studentId: user.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    const mentors = await this.prisma.mentorProfile.findMany({ where: { id: { in: rows.map((r) => r.mentorId) } }, select: { id: true, slug: true, user: { select: { name: true } } } });
    return rows.map((r) => {
      const m = mentors.find((x) => x.id === r.mentorId);
      return { code: r.code, percentOff: r.percentOff, expiresAt: r.expiresAt, note: r.note, mentorId: r.mentorId, mentorSlug: m?.slug ?? null, mentorName: m?.user.name ?? '' };
    });
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
    if (b.course) return this.courseCall(user, b);
    const base = { reference: b.reference, mentorName: b.mentor.user.name, startAt: b.slot.startAt, endAt: b.slot.endAt, sessionKind: b.sessionKind, canReportMissing: b.studentId === user.id && this.mentorMissing(b), mentorReport: b.studentId === user.id ? b.mentorReportStatus ?? null : null };
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
    if (isHost && !b.hostStartedAt) await this.prisma.booking.updateMany({ where: { ...(b.sessionKind === 'GROUP' ? { slotId: b.slotId } : { id: b.id }), hostStartedAt: { isSet: false } }, data: { hostStartedAt: new Date() } }); // In a group the mentor joins through one booking, but the session is everyone's.
    const token = await this.daily.token(room, { userId: user.id, userName: user.name, owner: isHost, startAt: slot.startAt, endAt: slot.endAt });
    if (user.role !== 'ADMIN') this.activity.record(user.id, 'session_joined', { reference: b.reference });
    return { ...base, state: 'ready' as const, url, token, isHost };
  }

  /**
   * The call page for a course: the room of whichever class is on now. Each class has its own room, which every enrolled
   * learner shares; learners wait until the mentor has opened it.
   */
  private async courseCall(user: AuthUser, b: FullBooking) {
    const course = b.course!;
    const { live, next } = currentClass(course.slots);
    const k = live ?? next ?? course.slots[course.slots.length - 1];
    const base = { reference: b.reference, mentorName: b.mentor.user.name, startAt: k.startAt, endAt: k.endAt, sessionKind: b.sessionKind, canReportMissing: false, mentorReport: null, course: { title: course.title, classNumber: k.sessionNumber ?? 1, sessionsCount: course.sessionsCount } };
    if (b.status !== 'CONFIRMED' && b.status !== 'COMPLETED') return { ...base, state: 'not_confirmed' as const };
    if (!live) return { ...base, state: next ? 'too_early' as const : 'ended' as const };
    if (!this.daily.enabled()) throw new ServiceUnavailableException('Video calling is not configured yet. Please contact support.');
    const mentorUserId = (await this.prisma.mentorProfile.findUniqueOrThrow({ where: { id: b.mentorId }, select: { userId: true } })).userId;
    const isHost = user.id === mentorUserId || user.role === 'ADMIN';
    const room = 'pb-' + live.id.toLowerCase();
    if (!isHost && (await this.daily.presence(room, mentorUserId)) === 'no') return { ...base, state: 'waiting_for_host' as const };
    // Room for everyone enrolled plus the mentor and a few of the team; Daily rooms take up to 200 people.
    const enrolled = await this.prisma.booking.count({ where: { courseId: course.id, status: { in: ['CONFIRMED', 'COMPLETED'] } } });
    const url = await this.daily.ensureRoom(room, live.endAt, Math.min(200, enrolled + 5));
    if (isHost && !live.hostStartedAt) {
      await this.prisma.availabilitySlot.updateMany({ where: { id: live.id, hostStartedAt: { isSet: false } }, data: { hostStartedAt: new Date() } });
      await this.prisma.booking.updateMany({ where: { courseId: course.id, hostStartedAt: { isSet: false } }, data: { hostStartedAt: new Date() } });
    }
    const token = await this.daily.token(room, { userId: user.id, userName: user.name, owner: isHost, startAt: live.startAt, endAt: live.endAt });
    if (user.role !== 'ADMIN') this.activity.record(user.id, 'session_joined', { reference: b.reference, label: `${course.title}, class ${live.sessionNumber ?? 1}` });
    return { ...base, startAt: live.startAt, endAt: live.endAt, course: { ...base.course, classNumber: live.sessionNumber ?? 1 }, state: 'ready' as const, url, token, isHost };
  }

  /**
   * Enrols a learner on a live course: holds a seat (counted on the course's first class) and opens a payment, exactly
   * like a booking. Price is the course's, in rupees. Open until the final class starts.
   */
  async enrol(user: AuthUser, courseId: string, expectedPriceMinor?: number) {
    await this.releaseExpiredHolds();
    if (!user.emailVerified) throw new ForbiddenException('Please confirm your email address before enrolling.');
    const student = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (student.dateOfBirth) {
      const age = (Date.now() - student.dateOfBirth.getTime()) / (365.25 * 86400_000);
      if (age < 18 && !student.guardianConsent) throw new ForbiddenException('A parent or guardian must give consent before anyone under 18 can enrol. We have emailed them.');
    }
    const course = /^[a-f0-9]{24}$/i.test(courseId) ? await this.prisma.course.findUnique({ where: { id: courseId }, include: { mentor: true, slots: { orderBy: { startAt: 'asc' } } } }) : null;
    if (!course || course.status !== 'LIVE' || course.mentor.status !== 'ACTIVE' || !course.slots.length || course.priceMinor == null) throw new NotFoundException('This course isn’t open for enrolment');
    const first = course.slots[0], last = course.slots[course.slots.length - 1];
    if (last.startAt.getTime() <= Date.now()) throw new BadRequestException('The final class of this course has already started, so it’s closed for enrolment.');
    if (course.mentor.userId === user.id) throw new BadRequestException('You cannot enrol on your own course');
    if (expectedPriceMinor !== undefined && expectedPriceMinor !== course.priceMinor) throw new ConflictException('The price of this course has changed. Please refresh the page to see the latest price.');
    const already = await this.prisma.booking.findFirst({ where: { courseId: course.id, studentId: user.id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'] } }, select: { reference: true, status: true } });
    if (already) {
      // Coming back to a payment they started: carry on with it.
      if (already.status === 'PENDING_PAYMENT') return this.get(user, already.reference);
      throw new ConflictException('You’re already enrolled on this course. You’ll find it on your dashboard.');
    }
    const priceMinor = course.priceMinor;
    const reference = 'PBC-' + randomBytes(4).toString('hex').toUpperCase();
    try {
      const booking = await this.withWriteConflictRetry(() => this.prisma.$transaction(async (tx) => {
        const claimed = await tx.availabilitySlot.updateMany({ where: { id: first.id, isBooked: false, seatsTaken: { lt: first.capacity } }, data: { seatsTaken: { increment: 1 } } });
        if (claimed.count === 0) throw new ConflictException('Sorry, this course has just filled up.');
        await tx.availabilitySlot.updateMany({ where: { id: first.id, seatsTaken: { gte: first.capacity } }, data: { isBooked: true } });
        const b = await tx.booking.create({
          data: {
            reference, studentId: user.id, mentorId: course.mentorId, slotId: first.id, courseId: course.id, sessionKind: 'GROUP',
            agenda: course.title, currentSituation: '', usefulOutcome: '', priceMinor, currency: 'PKR',
            // Learner pays POINT B; the mentor's fixed course fee is settled separately (not a % of this booking).
            listPriceMinor: priceMinor, discountMinor: 0, repeatStudent: false, commissionPercent: null, platformFeeMinor: null,
          },
        });
        await tx.payment.create({ data: { bookingId: b.id, provider: this.stripe.enabled() ? 'stripe' : (process.env.PAYMENTS_PROVIDER ?? 'mock'), providerRef: 'pay_' + randomBytes(10).toString('hex'), amountMinor: priceMinor, currency: 'PKR' } });
        return b;
      }));
      this.activity.record(user.id, 'booking_held', { reference: booking.reference, label: course.title });
      return this.get(user, booking.reference);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034') throw new ConflictException('Sorry, this course has just filled up.');
      throw e;
    }
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
    this.activity.record(b.studentId, 'payment_succeeded', { reference: b.reference, label: b.mentor.user.name });
    if (b.promoCodeId) await this.prisma.promoCode.updateMany({ where: { id: b.promoCodeId, usedAt: null }, data: { usedAt: new Date(), bookingId: b.id } });
    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    const link = sessionUrl(b.reference);
    if (b.course) {
      const { next } = currentClass(b.course.slots);
      const facts: [string, string][] = [['Course', b.course.title], ['Taught by', b.mentor.user.name], ['Classes', `${b.course.sessionsCount}, ${b.course.sessionMinutes} minutes each`], ...(next ? [['Next class', emailDate(next.startAt)] as [string, string]] : []), ['Reference', b.reference]];
      await this.notify.send(b.student.email, `You’re enrolled: ${b.course.title}`, `Hi ${b.student.name.split(' ')[0]},\n\nThank you. Your payment has been received and your place on ${b.course.title} with ${b.mentor.user.name} is confirmed.\n\nEvery class runs live online, in your browser. Join from your dashboard when it is time; we will email you a reminder 30 minutes before each class.`, b.student.id, { cta: { label: 'View your course', url: link }, facts, whatsapp: { alert: 'bookingConfirmed', params: [b.student.name.split(' ')[0], b.mentor.user.name, next?.startAt ?? b.slot.startAt, 'Course', b.reference, link] } });
      await this.notify.send(b.mentor.user.email, `New learner on ${b.course.title}`, `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} has enrolled on your course.`, mentorUserId, { emailOnly: true, cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor?tab=courses` }, facts: [['Course', b.course.title], ['Learner', b.student.name]] });
      return;
    }
    const kind = b.sessionKind === 'GROUP' ? 'Group session' : '1:1 session';
    const facts = (who: [string, string]): [string, string][] => [who, ['Date and time', emailDate(b.slot.startAt)], ['Type', kind], ['Agenda', b.agenda], ['Reference', b.reference]];
    const cta = { label: 'View your session', url: link };
    await this.notify.send(b.student.email, 'Your booking is confirmed', `Hi ${b.student.name.split(' ')[0]},\n\nThank you for booking. Your session with ${b.mentor.user.name} is confirmed and your payment has been received.\n\nYou can join from your dashboard when it is time. We will email you a reminder 30 minutes before it starts. If you need a different time, you can reschedule from your dashboard up to ${noticeLabel(await this.noticeHours())} before the start.`, b.student.id, { cta, facts: facts(['Mentor', b.mentor.user.name]), whatsapp: { alert: 'bookingConfirmed', params: [b.student.name.split(' ')[0], b.mentor.user.name, b.slot.startAt, kind, b.reference, link] } });
    await this.notify.send(b.mentor.user.email, 'You have a new booking', `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} has booked a session with you. Their preparation notes are on your dashboard so you can read them beforehand.`, mentorUserId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor` }, facts: facts(['Student', b.student.name]) });
  }

  /**
   * Moves a confirmed session to another open time with the same mentor and the same session type.
   * Allowed until `reschedule_notice_hours` (default 48) before the current start. The fee carries over.
   */
  async reschedule(user: AuthUser, reference: string, newSlotId: string) {
    const b = await this.load(user, reference);
    if (b.studentId !== user.id) throw new ForbiddenException('Only the person who booked can reschedule');
    if (b.course) throw new BadRequestException('Course classes run on a fixed schedule, so they can’t be moved.');
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
    await this.notify.send(b.student.email, 'Your session has been rescheduled', `Hi ${b.student.name.split(' ')[0]},\n\nYour session with ${b.mentor.user.name} has been moved to a new time. Your payment carries over, so there is nothing more to pay.\n\nWe will email you a reminder 30 minutes before it starts.`, b.student.id, { cta: { label: 'View your session', url: sessionUrl(b.reference) }, facts: facts(['Mentor', b.mentor.user.name]), whatsapp: { alert: 'sessionRescheduled', params: [b.student.name.split(' ')[0], b.mentor.user.name, slot.startAt, oldStart, b.reference, sessionUrl(b.reference)] } });
    await this.notify.send(b.mentor.user.email, 'A session has been rescheduled', `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} has moved their session with you to a new time. The original time is open again for other mentees.`, mentorUserId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor` }, facts: facts(['Student', b.student.name]) });
    this.activity.record(user.id, 'rescheduled', { reference: b.reference });
    return this.get(user, reference);
  }

  /**
   * Students can release an unpaid hold at any time, and cancel a confirmed session for a full refund up to the
   * notice period before it starts. After that there is no refund. Admins can cancel at any time for support cases.
   */
  async cancel(user: AuthUser, reference: string, dto: CancelBookingDto) {
    const b = await this.load(user, reference);
    if (b.status !== 'CONFIRMED' && b.status !== 'PENDING_PAYMENT') throw new BadRequestException('This booking can no longer be cancelled');
    const isStudent = b.studentId === user.id && user.role === 'STUDENT';
    if (user.role !== 'ADMIN' && !isStudent) throw new ForbiddenException('Only the person who booked can cancel this session');
    if (isStudent && b.status === 'CONFIRMED') {
      const hours = await this.noticeHours();
      if (b.slot.startAt.getTime() - Date.now() < hours * 3600_000) throw new BadRequestException(b.course ? `A course can be cancelled for a full refund up to ${noticeLabel(hours)} before its first class, so this one can no longer be cancelled or refunded.` : `Sessions can be cancelled for a full refund up to ${noticeLabel(hours)} before the start time, so this one can no longer be cancelled or refunded.`);
    }
    // Only the request that flips the status goes on, so a double click can never credit the balance twice.
    const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason ?? (isStudent ? 'Cancelled by the person who booked' : 'Cancelled by mentor/admin') } });
    if (!claimed.count) throw new ConflictException('This booking has already been changed. Please refresh the page.');
    // A paid session is not refunded to the card or bank: the full price goes to the student's POINT B balance instead.
    for (const p of await this.prisma.payment.findMany({ where: { bookingId: b.id, status: 'PENDING', provider: 'stripe' } })) {
      if (p.providerRef.startsWith('pi_')) await this.stripe.cancelIntent(p.providerRef);
    }
    await this.prisma.$transaction([
      this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'SUCCEEDED' }, data: { status: 'REFUNDED' } }),
      this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'PENDING' }, data: { status: 'FAILED' } }),
      this.prisma.availabilitySlot.update({ where: { id: b.slotId }, data: { isBooked: false, seatsTaken: { decrement: 1 } } }),
    ]);
    const refunded = b.status === 'CONFIRMED';
    const creditText = money(b.priceMinor, b.currency);
    if (refunded) await this.wallet.add(b.studentId, b.currency, b.priceMinor, 'CANCELLATION', { bookingId: b.id, reference: b.reference, note: dto.reason ?? 'Session cancelled' });
    else await this.wallet.returnUnused(b);
    if (b.course) {
      const what = `your place on ${b.course.title}`;
      await this.notify.send(b.student.email, 'Your enrolment has been cancelled', `Hi ${b.student.name.split(' ')[0]},\n\n${what[0].toUpperCase() + what.slice(1)} has been cancelled${isStudent ? '' : ' by our team'}.${refunded ? ` The full ${creditText} has been added to your POINT B balance, and you can use it for any future course.` : ' You were not charged.'}`, b.student.id, { cta: { label: 'See all courses', url: `${webUrl()}/courses` }, facts: [['Course', b.course.title], ['Reference', b.reference]] });
      this.activity.record(b.studentId, 'booking_cancelled', { reference: b.reference, label: isStudent ? 'By the learner' : 'By the team' });
      return this.get(user, reference);
    }
    const by = isStudent ? 'the student' : 'your mentor or our team';
    const cf = (who: [string, string]): [string, string][] => [who, ['Was scheduled for', emailDate(b.slot.startAt)], ['Reference', b.reference]];
    await this.notify.send(b.student.email, 'Your booking has been cancelled', `Hi ${b.student.name.split(' ')[0]},\n\nYour session with ${b.mentor.user.name} has been cancelled${isStudent ? '' : ` by ${by}`}.${refunded ? ` The full ${creditText} has been added to your POINT B balance, and you can use it at checkout for any future session.` : ' You were not charged.'}\n\nYou are welcome to book another time whenever suits you.`, b.student.id, { cta: { label: 'Find another time', url: `${webUrl()}/mentors/${b.mentor.slug}` }, facts: cf(['Mentor', b.mentor.user.name]), whatsapp: { alert: 'bookingCancelled', params: [b.student.name.split(' ')[0], b.mentor.user.name, b.slot.startAt, refunded ? `${creditText} has been added to your POINT B balance for your next session.` : 'You were not charged.', b.reference, `${webUrl()}/mentors/${b.mentor.slug}`] } });
    await this.notify.send(b.mentor.user.email, 'A session has been cancelled', `Hi ${b.mentor.user.name.split(' ')[0]},\n\nThe session with ${b.student.name} has been cancelled${isStudent ? ' by your mentee' : ''}. The time slot is open again for other mentees.`, (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId, { cta: { label: 'Open your dashboard', url: `${webUrl()}/dashboard/mentor` }, facts: cf(['Student', b.student.name]) });
    this.activity.record(b.studentId, 'booking_cancelled', { reference: b.reference, label: isStudent ? 'By the mentee' : 'By the team' });
    return this.get(user, reference);
  }

  async markCompleted(user: AuthUser, reference: string, outcome: 'COMPLETED' | 'NO_SHOW' = 'COMPLETED') {
    const b = await this.load(user, reference);
    const mentorUserId = (await this.prisma.mentorProfile.findUniqueOrThrow({ where: { id: b.mentorId } })).userId;
    if (user.role !== 'ADMIN' && mentorUserId !== user.id) throw new ForbiddenException('Only the mentor can complete this session');
    if (b.status !== 'CONFIRMED') throw new BadRequestException('Only confirmed sessions can be completed');
    if (b.course) throw new BadRequestException('Courses are completed automatically after the final class.');
    // Allowed from the scheduled start, or earlier if the mentor has already opened the call room.
    if (b.slot.startAt.getTime() > Date.now() && !b.hostStartedAt) throw new BadRequestException('This session has not started yet');
    // A student can only have missed a session the mentor was actually in.
    if (outcome === 'NO_SHOW' && user.role !== 'ADMIN' && !b.hostStartedAt) throw new BadRequestException('Please join the session room before marking your mentee as a no-show.');
    await this.prisma.booking.update({ where: { id: b.id }, data: { status: outcome, completedAt: new Date() } });
    if (outcome === 'COMPLETED') await this.askForFeedback(b);
    return this.get(user, reference);
  }

  private async askForFeedback(b: FullBooking) {
    if (b.course) {
      await this.notify.send(b.student.email, `How was ${b.course.title}?`, `Hi ${b.student.name.split(' ')[0]},\n\nThank you for taking ${b.course.title} with ${b.mentor.user.name}. Your feedback takes less than a minute and helps us plan the next courses.`, b.student.id, { cta: { label: 'Leave your feedback', url: `${webUrl()}/dashboard/student` }, facts: [['Course', b.course.title], ['Taught by', b.mentor.user.name], ['Reference', b.reference]] });
      return;
    }
    await this.notify.send(b.student.email, `How was your session with ${b.mentor.user.name}?`, `Hi ${b.student.name.split(' ')[0]},\n\nThank you for your session with ${b.mentor.user.name}. Your feedback takes less than a minute and helps other students and professionals choose the right mentor, and it helps your mentor improve.\n\nPlease rate your session and share a few words about how it went.`, b.student.id, { cta: { label: 'Leave your feedback', url: `${webUrl()}/dashboard/student` }, whatsapp: { alert: 'feedbackRequest', params: [b.student.name.split(' ')[0], b.mentor.user.name, b.slot.startAt, `${webUrl()}/dashboard/student`] }, facts: [['Mentor', b.mentor.user.name], ['Session', emailDate(b.slot.startAt)], ['Reference', b.reference]] });
  }

  /** The mentor never opened the room, the session should have started, and it's recent enough to report. */
  private mentorMissing(b: FullBooking) {
    if (b.status !== 'CONFIRMED' && b.status !== 'COMPLETED') return false;
    if (b.course) return false; // a missed class is raised with support, not refunded per learner
    if (b.hostStartedAt || b.mentorReportStatus) return false;
    const now = Date.now();
    return now >= b.slot.startAt.getTime() + REPORT_AFTER_MINUTES * 60_000 && now <= b.slot.endAt.getTime() + REPORT_WINDOW_DAYS * 86400_000;
  }

  /** The student reports that the mentor never joined. Nothing is refunded until an admin has checked it. */
  async reportMissingMentor(user: AuthUser, reference: string) {
    const b = await this.load(user, reference);
    if (b.studentId !== user.id) throw new ForbiddenException('Only the person who booked can report this');
    if (!this.mentorMissing(b)) throw new BadRequestException('This can be reported from 10 minutes after the start, if your mentor has not joined the room.');
    const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, status: b.status, OR: [{ mentorReportStatus: null }, { mentorReportStatus: { isSet: false } }] }, data: { mentorReportStatus: 'PENDING', mentorReportedAt: new Date() } });
    if (!claimed.count) throw new ConflictException('This session has already been reported.');
    const facts: [string, string][] = [['Session', emailDate(b.slot.startAt)], ['Reference', b.reference]];
    await this.notify.send(b.student.email, 'We\'ve received your report', `Hi ${b.student.name.split(' ')[0]},\n\nThanks for telling us that ${b.mentor.user.name} didn't join your session. The POINT B team will check what happened and email you with the outcome. If we confirm your mentor didn't attend, the full price will be added to your POINT B balance.`, b.student.id, { facts });
    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    await this.notify.send(b.mentor.user.email, 'A mentee reported that you didn\'t join', `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} reported that you didn't join your session. The POINT B team is reviewing it. If you did attend, or something went wrong, please contact us as soon as you can.`, mentorUserId, { facts: [['Student', b.student.name], ...facts] });
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER;
    if (inbox) await this.notify.send(inbox, `Review needed: mentor did not join [${b.reference}]`, `${b.student.name} reported that ${b.mentor.user.name} did not join. Please review it and approve or decline the refund.`, undefined, { emailOnly: true, cta: { label: 'Review bookings', url: `${webUrl()}/admin?tab=bookings` }, facts: [['Mentor', b.mentor.user.name], ['Student', b.student.name], ...facts] });
    this.activity.record(b.studentId, 'mentor_reported', { reference: b.reference });
    return this.get(user, reference);
  }

  /** An admin decides a report: approving refunds the student to their balance, declining leaves the session as it was. */
  async decideMentorReport(user: AuthUser, reference: string, approve: boolean, note?: string) {
    const b = await this.load(user, reference);
    const text = note?.trim() || null;
    const now = new Date();
    const decided = { mentorReportStatus: approve ? 'APPROVED' : 'DECLINED', mentorReportDecidedAt: now, mentorReportNote: text };
    // Only the request that flips the report goes on, so it can never be refunded twice.
    const claimed = await this.prisma.booking.updateMany({
      where: { id: b.id, mentorReportStatus: 'PENDING', status: { in: ['CONFIRMED', 'COMPLETED'] } },
      data: approve ? { ...decided, status: 'CANCELLED', cancelledAt: now, mentorNoShowAt: now, cancelReason: 'Your mentor did not join. The full price was refunded to your POINT B balance.' } : decided,
    });
    if (!claimed.count) throw new ConflictException('This report has already been decided.');
    const amount = money(b.priceMinor, b.currency);
    const facts: [string, string][] = [['Session', emailDate(b.slot.startAt)], ['Reference', b.reference]];
    const first = b.student.name.split(' ')[0];
    const mentorFirst = b.mentor.user.name.split(' ')[0];
    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    const why = text ? `\n\n${text}` : '';
    if (approve) {
      await this.prisma.payment.updateMany({ where: { bookingId: b.id, status: 'SUCCEEDED' }, data: { status: 'REFUNDED' } });
      await this.wallet.add(b.studentId, b.currency, b.priceMinor, 'CANCELLATION', { bookingId: b.id, reference: b.reference, note: 'Mentor did not join', createdBy: user.id });
      await this.notify.send(b.student.email, 'Your refund has been approved', `Hi ${first},\n\nWe've confirmed that ${b.mentor.user.name} didn't join your session, and we're sorry. The full ${amount} has been added to your POINT B balance, and you can use it for any future session.${why}`, b.student.id, { cta: { label: 'Find another time', url: `${webUrl()}/mentors/${b.mentor.slug}` }, facts });
      await this.notify.send(b.mentor.user.email, 'Your session was refunded', `Hi ${mentorFirst},\n\nThe POINT B team confirmed that you didn't join your session with ${b.student.name}. Your mentee has been refunded, so this session won't be paid out.${why}`, mentorUserId, { facts });
    } else {
      await this.notify.send(b.student.email, 'An update on your report', `Hi ${first},\n\nWe looked into your report about your session with ${b.mentor.user.name} and couldn't confirm that your mentor didn't join, so no refund has been issued.${why}\n\nIf you think we've got this wrong, please reply through support.`, b.student.id, { cta: { label: 'Contact support', url: `${webUrl()}/contact` }, facts });
      await this.notify.send(b.mentor.user.email, 'A report about your session was closed', `Hi ${mentorFirst},\n\nThe POINT B team reviewed the report about your session with ${b.student.name} and has closed it. No further action is needed.`, mentorUserId, { facts });
    }
    await this.prisma.auditLog.create({ data: { adminId: user.id, action: approve ? 'MENTOR_REPORT_APPROVED' : 'MENTOR_REPORT_DECLINED', entityType: 'Booking', entityId: b.id, detail: `${b.reference}${text ? `: ${text}` : ''}` } });
    return this.get(user, reference);
  }

  /** Feedback opens once the session/course has finished (or the mentor opened the 1:1 room). */
  private reviewable(b: FullBooking) {
    if (b.status === 'CANCELLED' || b.status === 'NO_SHOW' || b.status === 'PENDING_PAYMENT') return false;
    if (b.status === 'COMPLETED') return true;
    if (b.status !== 'CONFIRMED') return false;
    const now = Date.now();
    // One feedback per course enrolment, after the final class has finished.
    if (b.course) return lastClass(b).endAt.getTime() <= now;
    return b.slot.endAt.getTime() <= now || (!!b.hostStartedAt && b.slot.startAt.getTime() <= now);
  }

  private reviewScores(b: FullBooking, dto: CreateReviewDto) {
    if (b.course) {
      if (dto.clarity == null || dto.usefulness == null || dto.recommend == null) {
        throw new BadRequestException('Please rate teaching clarity, usefulness, and whether you would recommend this course.');
      }
      return { clarity: dto.clarity, usefulness: dto.usefulness, recommend: dto.recommend };
    }
    return { clarity: dto.clarity ?? null, usefulness: dto.usefulness ?? null, recommend: dto.recommend ?? null };
  }

  async review(user: AuthUser, reference: string, dto: CreateReviewDto) {
    const b = await this.load(user, reference);
    if (b.studentId !== user.id) throw new ForbiddenException('Only the person who booked can review this session');
    if (b.review) throw new ConflictException('You have already reviewed this session');
    if (!this.reviewable(b)) throw new BadRequestException(b.course ? 'You can leave feedback once the final class has finished' : 'You can leave feedback once the session has finished');
    const scores = this.reviewScores(b, dto);
    // Private until the POINT B team approves it; mentors can read it but not change it.
    await this.prisma.review.create({ data: { bookingId: b.id, rating: dto.rating, comment: dto.comment, ...scores, status: 'PENDING' } });
    const mentorUserId = (await this.prisma.mentorProfile.findUnique({ where: { id: b.mentorId }, select: { userId: true } }))?.userId;
    const what = b.course ? b.course.title : 'your session';
    await this.notify.send(b.mentor.user.email, `New feedback from ${b.student.name.split(' ')[0]}`, `Hi ${b.mentor.user.name.split(' ')[0]},\n\n${b.student.name} has left feedback on ${what}. You can read it on your dashboard. The POINT B team reviews all feedback before it appears on your public profile.`, mentorUserId, { cta: { label: 'Read the feedback', url: `${webUrl()}/dashboard/mentor?tab=feedback` }, facts: [['Rating', `${dto.rating} out of 5`], [b.course ? 'Course' : 'Session', b.course ? b.course.title : emailDate(b.slot.startAt)]] });
    this.activity.record(user.id, 'review_left', { reference: b.reference });
    return this.get(user, reference);
  }

  /** Students can change their feedback once. The new text goes back to the POINT B team, so it can't skip approval. */
  async editReview(user: AuthUser, reference: string, dto: CreateReviewDto) {
    const b = await this.load(user, reference);
    if (b.studentId !== user.id) throw new ForbiddenException('Only the person who booked can edit this feedback');
    if (!b.review) throw new BadRequestException('You haven’t left feedback on this session yet');
    const scores = this.reviewScores(b, dto);
    // A single conditional update, so two edits sent at once can't both succeed.
    const claimed = await this.prisma.review.updateMany({
      where: { id: b.review.id, OR: [{ editedAt: null }, { editedAt: { isSet: false } }] },
      data: { rating: dto.rating, comment: dto.comment, ...scores, status: 'PENDING', moderatedAt: null, moderatedBy: null, editedAt: new Date() },
    });
    if (!claimed.count) throw new ConflictException('You have already used your one edit on this feedback');
    this.activity.record(user.id, 'review_edited', { reference: b.reference });
    return this.get(user, reference);
  }
}
