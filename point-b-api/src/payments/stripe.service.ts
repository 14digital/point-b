import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/** Thin wrapper over Stripe. Payments fall back to the demo checkout when STRIPE_SECRET_KEY is not set. */
@Injectable()
export class StripeService {
  private readonly log = new Logger(StripeService.name);
  private client: Stripe | null = null;

  enabled() {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  get stripe(): Stripe {
    if (!this.client) this.client = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    return this.client;
  }

  publishableKey() {
    // Accept the Next.js-style name too, since it's a common habit to copy it from a frontend .env.
    return process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  }

  createIntent(opts: { amountMinor: number; currency: string; bookingId: string; reference: string; email: string; description: string }) {
    return this.stripe.paymentIntents.create(
      {
        amount: opts.amountMinor,
        currency: opts.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: opts.email,
        description: opts.description,
        metadata: { bookingId: opts.bookingId, reference: opts.reference },
      },
      // One intent per booking, even if the student opens checkout twice.
      { idempotencyKey: `booking-${opts.bookingId}` },
    );
  }

  retrieveIntent(id: string) {
    return this.stripe.paymentIntents.retrieve(id);
  }

  /** Best-effort: an unpaid hold that lapsed should not stay chargeable. */
  async cancelIntent(id: string) {
    try {
      await this.stripe.paymentIntents.cancel(id);
    } catch (e) {
      this.log.warn(`Could not cancel ${id}: ${(e as Error).message}`);
    }
  }

  refund(paymentIntentId: string, reason: string) {
    return this.stripe.refunds.create(
      { payment_intent: paymentIntentId, metadata: { reason } },
      { idempotencyKey: `refund-${paymentIntentId}` },
    );
  }

  constructEvent(rawBody: Buffer, signature: string) {
    return this.stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
  }
}
