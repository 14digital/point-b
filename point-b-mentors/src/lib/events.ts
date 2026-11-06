/** Fired whenever a hold starts, a payment window closes or a payment goes through, so the payment-due bar re-checks. */
export const PAYMENT_CHANGED = "pointb:payment-changed";
export const paymentChanged = () => window.dispatchEvent(new Event(PAYMENT_CHANGED));
