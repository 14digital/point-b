"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Alert, Button, Skeleton, Spinner } from "./ui";
import { api, errMsg } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/types";

interface BankInfo { accountTitle: string; bankName: string; accountNumber: string | null; iban: string | null; raastId: string | null; qrUrl: string | null }
type CheckoutInfo =
  | { state: "paid"; reference: string }
  | { state: "verifying"; reference: string; amountMinor: number; currency: Currency; txnRef: string | null }
  | {
      state: "ready"; provider: "mock" | "stripe"; reference: string; amountMinor: number; currency: Currency; holdExpiresAt: string;
      providerRef?: string; clientSecret?: string; publishableKey?: string; bank?: BankInfo | null;
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
  const [method, setMethod] = useState<"card" | "bank">("card");

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

  if (info.state === "verifying") return <Verifying info={info} bodyClass={bodyClass} footerClass={footerClass} />;

  // Bank app / QR is offered beside the card form for PKR sessions.
  const picker = info.bank ? <MethodPicker value={method} onChange={setMethod} /> : null;
  if (info.bank && method === "bank") {
    return <BankForm info={info} bank={info.bank} picker={picker} onSubmitted={() => setInfo({ state: "verifying", reference: info.reference, amountMinor: info.amountMinor, currency: info.currency, txnRef: null })} bodyClass={bodyClass} footerClass={footerClass} footerLead={footerLead} />;
  }

  if (info.provider === "stripe" && info.clientSecret && info.publishableKey) {
    return (
      <Elements stripe={stripeFor(info.publishableKey)} options={{ clientSecret: info.clientSecret, appearance, fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" }] }}>
        <StripeForm info={info} picker={picker} onPaid={onPaid} bodyClass={bodyClass} footerClass={footerClass} footerLead={footerLead} />
      </Elements>
    );
  }
  if (info.provider === "stripe") {
    return <div className={bodyClass}><Alert>Card payments are not fully configured (missing publishable key). Please contact support.</Alert></div>;
  }
  return <MockForm info={info} picker={picker} onPaid={onPaid} bodyClass={bodyClass} footerClass={footerClass} footerLead={footerLead} />;
}

type FormProps = { info: Extract<CheckoutInfo, { state: "ready" }>; onPaid: () => void; bodyClass: string; footerClass: string; footerLead?: ReactNode; picker?: ReactNode };

function MethodPicker({ value, onChange }: { value: "card" | "bank"; onChange: (v: "card" | "bank") => void }) {
  const opts = [
    ["card", "Card", <svg key="c" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" strokeLinecap="round" /></svg>],
    ["bank", "Bank app · QR", <svg key="q" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" /><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5" strokeLinecap="round" /></svg>],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1" role="tablist" aria-label="Payment method">
      {opts.map(([v, label, icon]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${value === v ? "bg-white text-ink shadow-sm ring-1 ring-ink/5" : "text-ink-soft hover:text-ink"}`}>
          {icon}{label}
        </button>
      ))}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] text-ink-soft">{label}</p>
        <p className="truncate font-medium tabular-nums text-ink">{value}</p>
      </div>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); }}
        className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-ink hover:ring-ink/30">{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

/** Pay from any banking app: scan the QR (or use the account details), then send the transaction ID for us to check. */
function BankForm({ info, bank, picker, onSubmitted, bodyClass, footerClass, footerLead }: { info: FormProps["info"]; bank: BankInfo; picker: ReactNode; onSubmitted: () => void; bodyClass: string; footerClass: string; footerLead?: ReactNode }) {
  const [txnRef, setTxnRef] = useState("");
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hold = useCountdown(info.holdExpiresAt);
  const ready = txnRef.trim().length >= 4 && sender.trim().length >= 2;
  async function submit() {
    setBusy(true); setError(null);
    try { await api(`/payments/${info.reference}/bank-transfer`, { body: { txnRef: txnRef.trim(), senderName: sender.trim() } }); onSubmitted(); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <>
      <div className={bodyClass}>
        <Summary info={info} />
        {picker}
        <div className="overflow-hidden rounded-2xl ring-1 ring-line">
          <div className="grid gap-5 p-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            {bank.qrUrl ? (
              <div className="mx-auto w-40 rounded-2xl bg-white p-2.5 ring-1 ring-line sm:mx-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bank.qrUrl} alt={`QR code to pay ${bank.accountTitle}`} className="aspect-square w-full object-contain" />
              </div>
            ) : null}
            <div className={bank.qrUrl ? "" : "sm:col-span-2"}>
              <p className="text-sm font-medium text-ink">{bank.qrUrl ? "Scan with any banking app" : "Transfer from any banking app"}</p>
              <ol className="mt-2 space-y-1.5 text-sm text-ink-soft">
                <li><span className="font-medium text-ink">1.</span> Open your bank or wallet app (Raast, JazzCash, Easypaisa or any bank).</li>
                <li><span className="font-medium text-ink">2.</span> {bank.qrUrl ? "Scan the QR code, or use the details below." : "Send to the account below."}</li>
                <li><span className="font-medium text-ink">3.</span> Pay exactly <span className="font-medium text-ink">{formatMoney(info.amountMinor, info.currency)}</span> and add <span className="font-medium text-ink">{info.reference}</span> in the note.</li>
              </ol>
            </div>
          </div>
          <div className="divide-y divide-line border-t border-line bg-paper/60 px-5 text-sm">
            <CopyRow label="Account title" value={`${bank.accountTitle} · ${bank.bankName}`} />
            {bank.raastId && <CopyRow label="Raast ID" value={bank.raastId} />}
            {bank.iban && <CopyRow label="IBAN" value={bank.iban} />}
            {bank.accountNumber && <CopyRow label="Account number" value={bank.accountNumber} />}
            <CopyRow label="Amount" value={String(info.amountMinor / 100)} />
            <CopyRow label="Payment note" value={info.reference} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">After paying, tell us about the transfer</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs text-ink-soft">Transaction ID / reference</span><input className="input" value={txnRef} maxLength={60} onChange={(e) => setTxnRef(e.target.value)} placeholder="From your bank's receipt" /></label>
            <label className="block"><span className="mb-1.5 block text-xs text-ink-soft">Name on the sending account</span><input className="input" value={sender} maxLength={80} onChange={(e) => setSender(e.target.value)} autoComplete="name" placeholder="e.g. Sara Ahmed" /></label>
          </div>
          <p className="mt-2 text-xs text-ink-soft">{hold && !hold.expired ? <>Send these within {hold.label} so we can hold your time. </> : null}We check every transfer by hand and confirm your booking, usually within a few hours.</p>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
      <footer className={footerClass}>
        {footerLead}
        <Button className="flex-1 sm:flex-none sm:min-w-52" disabled={!ready || busy || !!hold?.expired} onClick={submit}>{busy ? <Spinner /> : "I've paid, confirm my booking"}</Button>
      </footer>
    </>
  );
}

function Verifying({ info, bodyClass, footerClass }: { info: Extract<CheckoutInfo, { state: "verifying" }>; bodyClass: string; footerClass: string }) {
  return (
    <>
      <div className={bodyClass}>
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lemon text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <p className="mt-5 font-display text-2xl text-ink">We&rsquo;re checking your payment</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">Your time is held while we match your transfer of <span className="font-medium text-ink">{formatMoney(info.amountMinor, info.currency)}</span>. You&rsquo;ll get an email as soon as your booking is confirmed, usually within a few hours.</p>
          <p className="mt-3 text-xs text-ink-soft">Ref. {info.reference}{info.txnRef ? ` · Transaction ${info.txnRef}` : ""}</p>
        </div>
      </div>
      <footer className={footerClass}><Button href="/dashboard/student" className="w-full sm:w-auto sm:min-w-48">Go to my sessions</Button></footer>
    </>
  );
}

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

function StripeForm({ info, picker, onPaid, bodyClass, footerClass, footerLead }: FormProps) {
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
        {picker}
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

function MockForm({ info, picker, onPaid, bodyClass, footerClass, footerLead }: FormProps) {
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
        {picker}
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
