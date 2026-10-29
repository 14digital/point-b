"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Alert, Button, Skeleton, Spinner } from "./ui";
import { api, errMsg } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/types";

type CheckoutInfo =
  | { state: "paid"; reference: string }
  | {
      state: "ready"; provider: "mock" | "stripe"; reference: string; amountMinor: number; currency: Currency; holdExpiresAt: string;
      providerRef?: string; clientSecret?: string; publishableKey?: string;
    };

// loadStripe must run once per key, not on every render.
const stripeCache = new Map<string, Promise<Stripe | null>>();
const stripeFor = (key: string) => {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key)!;
};

const appearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#111111",
    colorText: "#111111",
    colorTextSecondary: "#55565b",
    colorTextPlaceholder: "#9a9a9f",
    colorDanger: "#9a3324",
    colorBackground: "#ffffff",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "15px",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid #e2e0d9", boxShadow: "none", padding: "12px 14px" },
    ".Input:focus": { borderColor: "#111111", boxShadow: "0 0 0 1px #111111" },
    ".Label": { fontWeight: "500", marginBottom: "6px" },
    ".Tab": { border: "1px solid #e2e0d9", boxShadow: "none" },
    ".Tab:hover": { borderColor: "#c9c6bd" },
    ".Tab--selected, .Tab--selected:focus": { borderColor: "#111111", boxShadow: "0 0 0 1px #111111" },
  },
};

/** Minutes:seconds left on the booking hold. */
function useCountdown(until?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return null;
  const ms = Math.max(0, new Date(until).getTime() - now);
  return { expired: ms === 0, label: `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` };
}

/**
 * Payment step for a held booking. Renders a scrollable body and a footer with the pay button,
 * so it slots into any dialog. Uses Stripe when the API has keys, otherwise the demo checkout.
 */
export function Checkout({ reference, onPaid, bodyClass, footerClass, footerLead }: {
  reference: string; onPaid: () => void; bodyClass: string; footerClass: string; footerLead?: ReactNode;
}) {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<CheckoutInfo>(`/payments/${reference}/checkout`, { method: "POST" })
      .then((i) => { if (cancelled) return; if (i.state === "paid") onPaid(); else setInfo(i); })
      .catch((e) => !cancelled && setError(errMsg(e)));
    return () => { cancelled = true; };
  }, [reference, onPaid]);

  if (error || !info || info.state === "paid") {
    return (
      <>
        <div className={bodyClass}>
          {error ? <Alert>{error}</Alert> : <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        </div>
        <footer className={footerClass}>{footerLead}<Button className="w-full sm:w-auto sm:min-w-48" disabled>{error ? "Payment unavailable" : <Spinner />}</Button></footer>
      </>
    );
  }

  if (info.provider === "stripe" && info.clientSecret && info.publishableKey) {
    return (
      <Elements stripe={stripeFor(info.publishableKey)} options={{ clientSecret: info.clientSecret, appearance, fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" }] }}>
        <StripeForm info={info} onPaid={onPaid} bodyClass={bodyClass} footerClass={footerClass} footerLead={footerLead} />
      </Elements>
    );
  }
  if (info.provider === "stripe") {
    return <div className={bodyClass}><Alert>Card payments are not fully configured (missing publishable key). Please contact support.</Alert></div>;
  }
  return <MockForm info={info} onPaid={onPaid} bodyClass={bodyClass} footerClass={footerClass} footerLead={footerLead} />;
}

type FormProps = { info: Extract<CheckoutInfo, { state: "ready" }>; onPaid: () => void; bodyClass: string; footerClass: string; footerLead?: ReactNode };

function Summary({ info }: { info: FormProps["info"] }) {
  const hold = useCountdown(info.holdExpiresAt);
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-paper px-5 py-4">
      <div>
        <p className="text-xs text-ink-soft">Amount due</p>
        <p className="font-display text-3xl leading-tight text-ink">{formatMoney(info.amountMinor, info.currency)}</p>
        <p className="text-xs text-ink-soft">Ref. {info.reference}</p>
      </div>
      {hold && (
        <div className={`rounded-xl px-3 py-2 text-right ${hold.expired ? "bg-rust-pale text-rust" : "bg-white text-ink"}`}>
          <p className="text-[11px] uppercase tracking-wider opacity-60">{hold.expired ? "Hold expired" : "Time held"}</p>
          <p className="font-mono text-lg tabular-nums">{hold.label}</p>
        </div>
      )}
    </div>
  );
}

function SecureNote({ stripe }: { stripe: boolean }) {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-soft">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.5" /></svg>
      {stripe ? "Payments are encrypted and processed by Stripe. We never see or store your card details." : "Demo mode: no card is charged."}
    </p>
  );
}

/** After Stripe says the card went through, confirm with our API (which re-checks with Stripe). */
async function settle(reference: string) {
  for (let i = 0; i < 8; i++) {
    const r = await api<{ status: string; paymentStatus: string }>(`/payments/${reference}/sync`, { method: "POST" });
    if (r.status === "CONFIRMED") return;
    if (r.paymentStatus !== "processing" && r.paymentStatus !== "succeeded") throw new Error("Payment was not completed. Please try again.");
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("Your payment is processing. We'll email you as soon as it's confirmed — you can close this window.");
}

function StripeForm({ info, onPaid, bodyClass, footerClass, footerLead }: FormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true); setError(null);
    const { error: err } = await stripe.confirmPayment({
      elements,
      // Only used by payment methods that must leave the page (some bank authentications).
      confirmParams: { return_url: `${window.location.origin}/dashboard/student?paid=${info.reference}` },
      redirect: "if_required",
    });
    if (err) { setError(err.message ?? "Your payment could not be completed."); setBusy(false); return; }
    try { await settle(info.reference); onPaid(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <>
      <div className={bodyClass}>
        <Summary info={info} />
        <div className="relative min-h-[220px]">
          {!ready && <div className="absolute inset-0 space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
          <PaymentElement onReady={() => setReady(true)} options={{ layout: { type: "tabs", defaultCollapsed: false }, business: { name: "POINT B Mentors" } }} />
        </div>
        {error && <Alert>{error}</Alert>}
        <SecureNote stripe />
      </div>
      <footer className={footerClass}>
        {footerLead}
        <Button className="flex-1 sm:flex-none sm:min-w-52" disabled={!stripe || !ready || busy} onClick={pay}>
          {busy ? <><Spinner /> Processing…</> : <>Pay {formatMoney(info.amountMinor, info.currency)}</>}
        </Button>
      </footer>
    </>
  );
}

function MockForm({ info, onPaid, bodyClass, footerClass, footerLead }: FormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setBusy(true); setError(null);
    try { await api(`/payments/mock/${info.providerRef}/complete`, { method: "POST" }); onPaid(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <>
      <div className={bodyClass}>
        <Summary info={info} />
        <Alert tone="info"><strong>Demo checkout.</strong> Stripe keys aren&rsquo;t configured on the server, so no card is charged and the booking is confirmed straight away.</Alert>
        {error && <Alert>{error}</Alert>}
        <SecureNote stripe={false} />
      </div>
      <footer className={footerClass}>
        {footerLead}
        <Button className="flex-1 sm:flex-none sm:min-w-52" disabled={busy} onClick={pay}>{busy ? <Spinner /> : `Pay ${formatMoney(info.amountMinor, info.currency)} (demo)`}</Button>
      </footer>
    </>
  );
}

/** Standalone payment dialog, used to resume checkout from the dashboard. */
export function CheckoutDialog({ reference, title, subtitle, onClose, onPaid }: { reference: string; title: string; subtitle: string; onClose: () => void; onPaid: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">Complete payment</p>
            <h2 className="mt-1.5 font-display text-[1.75rem] leading-tight text-ink">{title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft hover:bg-paper-dim hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <Checkout reference={reference} onPaid={onPaid}
          bodyClass="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 sm:px-8"
          footerClass="flex items-center justify-end gap-2 border-t border-line bg-white px-6 py-4 sm:px-8" />
      </div>
    </div>,
    document.body,
  );
}
