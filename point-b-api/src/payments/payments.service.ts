import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService, HOLD_MINUTES } from '../bookings/bookings.service';
import { AuthUser } from '../common/auth';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  constructor(private prisma: PrismaService, private bookings: BookingsService, private stripe: StripeService) {}

  verifySignature(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !rawBody || !signature) throw new UnauthorizedException('Missing signature');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected), b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid signature');
  }

  /** The only path that marks a payment as succeeded. Reached from a verified webhook or a server-side check with Stripe. */
  async applyResult(providerRef: string, status: 'succeeded' | 'failed') {
    const payment = await this.prisma.payment.findUnique({ where: { providerRef } });
    if (!payment) throw new NotFoundException('Unknown payment');
    if (payment.status !== 'PENDING') return { ok: true, idempotent: true };
    if (status === 'failed') {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', processedAt: new Date() } });
      return { ok: true };
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', processedAt: new Date() } });
    try {
      await this.bookings.confirmPaid(payment.bookingId);
    } catch (e) {
      // Paid after the hold lapsed (the slot may have gone to someone else): give the money back automatically.
      if (!(e instanceof ConflictException) || payment.provider !== 'stripe') throw e;
      await this.stripe.refund(providerRef, 'Paid after the booking hold expired');
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      this.log.warn(`Refunded late payment ${providerRef}`);
    }
    return { ok: true };
  }

  private async pendingPayment(user: AuthUser, reference: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reference },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 }, mentor: { select: { user: { select: { name: true } } } }, student: { select: { email: true } }, slot: { select: { startAt: true } } },
    });
    if (!booking || booking.studentId !== user.id) throw new NotFoundException('Booking not found');
    const payment = booking.payments[0];
    if (!payment) throw new NotFoundException('Payment not found');
    return { booking, payment };
  }

  /** Starts (or resumes) checkout for a held booking and tells the browser which checkout to show. */
  async checkout(user: AuthUser, reference: string) {
    await this.bookings.releaseExpiredHolds();
    const { booking, payment } = await this.pendingPayment(user, reference);
    if (booking.status === 'CONFIRMED') return { state: 'paid' as const, reference };
    if (booking.status !== 'PENDING_PAYMENT') throw new BadRequestException('This booking hold has expired. Please choose a time again.');
    const base = {
      reference,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      holdExpiresAt: new Date(booking.createdAt.getTime() + HOLD_MINUTES * 60_000).toISOString(),
    };
    if (payment.provider !== 'stripe') return { ...base, state: 'ready' as const, provider: 'mock' as const, providerRef: payment.providerRef };
    if (!this.stripe.enabled()) throw new BadRequestException('Card payments are not configured. Please contact support.');

    let intent = payment.providerRef.startsWith('pi_') ? await this.stripe.retrieveIntent(payment.providerRef) : null;
    if (!intent) {
      intent = await this.stripe.createIntent({
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        bookingId: booking.id,
        reference,
        email: booking.student.email,
        description: `POINT B Mentors session with ${booking.mentor.user.name} (${reference})`,
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: intent.id } });
    }
    if (intent.status === 'succeeded') {
      await this.applyResult(intent.id, 'succeeded');
      return { state: 'paid' as const, reference };
    }
    return { ...base, state: 'ready' as const, provider: 'stripe' as const, clientSecret: intent.client_secret, publishableKey: this.stripe.publishableKey() };
  }

  /**
   * Called by the browser after Stripe confirms the card. We never trust the browser's word:
   * the intent is re-read from Stripe and only a "succeeded" status confirms the booking.
   * (The webhook does the same thing, so either path arriving first is fine.)
   */
  async sync(user: AuthUser, reference: string) {
    const { booking, payment } = await this.pendingPayment(user, reference);
    if (payment.provider === 'stripe' && payment.status === 'PENDING' && payment.providerRef.startsWith('pi_')) {
      const intent = await this.stripe.retrieveIntent(payment.providerRef);
      if (intent.status === 'succeeded') await this.applyResult(intent.id, 'succeeded');
      else return { status: booking.status, paymentStatus: intent.status };
    }
    const fresh = await this.prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { status: true } });
    return { status: fresh.status, paymentStatus: 'succeeded' };
  }

  async stripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.stripe.enabled() || !process.env.STRIPE_WEBHOOK_SECRET) throw new UnauthorizedException('Stripe webhooks are not configured');
    if (!rawBody || !signature) throw new UnauthorizedException('Missing signature');
    let event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }
    if (event.type === 'payment_intent.succeeded') {
      try {
        await this.applyResult(event.data.object.id, 'succeeded');
      } catch (e) {
        if (!(e instanceof NotFoundException)) throw e; // intents not created by this app are ignored
      }
    }
    // payment_intent.payment_failed is deliberately ignored: the student can retry with another card while the hold lasts.
    return { received: true };
  }

  /** Demo checkout. Disabled when Stripe is configured or PAYMENTS_PROVIDER is anything other than "mock". */
  async mockComplete(user: AuthUser, providerRef: string) {
    if (this.stripe.enabled() || (process.env.PAYMENTS_PROVIDER ?? 'mock') !== 'mock') throw new ForbiddenException('Mock checkout is disabled');
    const payment = await this.prisma.payment.findUnique({ where: { providerRef }, include: { booking: true } });
    if (!payment || payment.booking.studentId !== user.id) throw new NotFoundException('Payment not found');
    if (payment.provider !== 'mock') throw new ForbiddenException('Mock checkout is disabled');
    if (payment.booking.status === 'CANCELLED') throw new BadRequestException('This booking hold has expired. Please choose a time again.');
    await this.applyResult(providerRef, 'succeeded');
    return { ok: true, reference: payment.booking.reference };
  }
}
