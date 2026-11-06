"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Alert, Button, Skeleton, Spinner } from "./ui";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { paymentChanged } from "@/lib/events";
import { track } from "@/lib/track";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/types";

interface BankInfo { accountTitle: string; bankName: string; accountNumber: string | null; iban: string | null; raastId: string | null; qrUrl: string | null }
type CheckoutInfo =
  | { state: "paid"; reference: string }
  | { state: "verifying"; reference: string; amountMinor: number; currency: Currency; txnRef: string | null; submittedAt?: string | null }
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
    return <BankForm info={info} bank={info.bank} picker={picker} onSubmitted={(txnRef) => setInfo({ state: "verifying", reference: info.reference, amountMinor: info.amountMinor, currency: info.currency, txnRef, submittedAt: new Date().toISOString() })} bodyClass={bodyClass} footerClass={footerClass} footerLead={footerLead} />;
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

const MAX_SIDE = 1600;
const MAX_BYTES = 2_500_000;

/** Shrinks a receipt photo in the browser so it uploads quickly: longest side 1600px, JPEG. */
async function shrinkImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image of your receipt (JPG, PNG or WebP).");
  if (file.size > 15_000_000) throw new Error("That image is too large. Please take a screenshot instead.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("We couldn't read that image. Please upload a JPG or PNG screenshot."); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < MAX_BYTES) return url;
  }
  throw new Error("That image is too large. Please take a screenshot instead.");
}

/** The payment QR code, large enough to scan from another phone, with a way to save it for scanning from the gallery. */
function QrViewer({ src, title, amount, reference, onClose }: { src: string; title: string; amount: string; reference: string; onClose: () => void }) {
  useEffect(() => {
    // Capture first so Escape closes only this viewer, not the payment dialog underneath.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Payment QR code">
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-zoom-out bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-[28px] bg-white p-5 text-center shadow-2xl sm:p-6">
        <button onClick={onClose} aria-label="Close" autoFocus className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink-soft hover:bg-paper-dim hover:text-ink">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">Scan to pay</p>
        <p className="mt-1 font-display text-2xl text-ink">{amount}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`QR code to pay ${title}`} className="mx-auto mt-4 aspect-square max-h-[60dvh] w-full rounded-2xl object-contain ring-1 ring-line" />
        <a href={src} download={`pointb-payment-qr-${reference}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Save QR image
        </a>
      </div>
    </div>,
    document.body,
  );
}

const StepDot = ({ n, active, done }: { n: number; active: boolean; done: boolean }) => (
  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${done ? "bg-forest text-white" : active ? "bg-ink text-white" : "bg-paper-dim text-ink-soft"}`}>
    {done ? <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg> : n}
  </span>
);

/**
 * Pay from any banking app in two steps: pay with the QR code or account details, then upload the receipt
 * screenshot (and transaction ID if there is one) for our team to match against the account statement.
 */
function BankForm({ info, bank, picker, onSubmitted, bodyClass, footerClass, footerLead }: { info: FormProps["info"]; bank: BankInfo; picker: ReactNode; onSubmitted: (txnRef: string | null) => void; bodyClass: string; footerClass: string; footerLead?: ReactNode }) {
  const { user } = useAuth();
  const [step, setStep] = useState<"pay" | "confirm">("pay");
  const [showDetails, setShowDetails] = useState(!bank.qrUrl);
  const [qrOpen, setQrOpen] = useState(false);
  const [proof, setProof] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [txnRef, setTxnRef] = useState("");
  const [sender, setSender] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const hold = useCountdown(info.holdExpiresAt);
  const amount = formatMoney(info.amountMinor, info.currency);

  async function pick(file?: File | null) {
    if (!file) return;
    setReading(true); setError(null);
    try { setProof(await shrinkImage(file)); } catch (e) { setError((e as Error).message); } finally { setReading(false); }
  }
  async function submit() {
    if (!proof) return;
    setBusy(true); setError(null);
    try {
      await api(`/payments/${info.reference}/bank-transfer`, { body: { proof, txnRef: txnRef.trim() || undefined, senderName: sender.trim() || undefined } });
      track("bank_transfer_submitted", { reference: info.reference });
      onSubmitted(txnRef.trim() || null);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  const steps = (
    <div className="flex items-center gap-2 text-xs">
      <StepDot n={1} active={step === "pay"} done={step === "confirm"} /><span className={step === "pay" ? "font-medium text-ink" : "text-ink-soft"}>Pay {amount}</span>
      <span className="mx-1 h-px w-6 bg-line" aria-hidden />
      <StepDot n={2} active={step === "confirm"} done={false} /><span className={step === "confirm" ? "font-medium text-ink" : "text-ink-soft"}>Upload receipt</span>
    </div>
  );

  if (step === "pay") return (
    <>
      <div className={bodyClass}>
        <Summary info={info} />
        {picker}
        {steps}
        <div className="overflow-hidden rounded-2xl ring-1 ring-line">
          <div className={`grid gap-5 p-5 ${bank.qrUrl ? "sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center" : ""}`}>
            {bank.qrUrl && (
              <div className="mx-auto w-44 sm:mx-0">
                <button type="button" onClick={() => setQrOpen(true)} aria-label="Enlarge the QR code" className="group relative block w-full rounded-2xl bg-white p-2 ring-1 ring-line transition-shadow hover:shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bank.qrUrl} alt={`QR code to pay ${bank.accountTitle}`} className="aspect-square w-full object-contain" />
                  <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/80 text-white shadow transition-transform group-hover:scale-110" aria-hidden>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M12 3.5h4.5V8M8 16.5H3.5V12M16.5 3.5l-5 5M3.5 16.5l5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
                <div className="mt-2 flex justify-center gap-3 text-xs">
                  <button type="button" onClick={() => setQrOpen(true)} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Enlarge</button>
                  <a href={bank.qrUrl} download={`pointb-payment-qr-${info.reference}`} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Save image</a>
                </div>
              </div>
            )}
            <div>
              <p className="font-medium text-ink">{bank.qrUrl ? "Scan with any banking app" : "Transfer from any banking app"}</p>
              <p className="mt-1 text-sm text-ink-soft">Raast, JazzCash, Easypaisa or any Pakistani bank app.</p>
              <div className="mt-4 inline-block rounded-xl bg-paper px-4 py-2.5">
                <p className="text-[11px] text-ink-soft">Pay exactly</p>
                <p className="font-display text-2xl leading-tight text-ink tabular-nums">{amount}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-line bg-paper/60 px-5">
            {bank.qrUrl && (
              <button type="button" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails} className="flex w-full items-center justify-between py-3 text-sm text-ink">
                <span>Can&rsquo;t scan? Use the account details</span>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden className={`transition-transform ${showDetails ? "rotate-180" : ""}`}><path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            {showDetails && (
              <div className="divide-y divide-line border-t border-line text-sm">
                <CopyRow label="Account title" value={`${bank.accountTitle} · ${bank.bankName}`} />
                {bank.raastId && <CopyRow label="Raast ID" value={bank.raastId} />}
                {bank.iban && <CopyRow label="IBAN" value={bank.iban} />}
                {bank.accountNumber && <CopyRow label="Account number" value={bank.accountNumber} />}
                <CopyRow label="Amount" value={String(info.amountMinor / 100)} />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-ink-soft">Paying on this phone? Save the QR image, then choose it from your gallery in your bank app&rsquo;s scanner. After paying, take a screenshot of the receipt. You&rsquo;ll upload it next.</p>
      </div>
      {qrOpen && bank.qrUrl && <QrViewer src={bank.qrUrl} title={bank.accountTitle} amount={amount} reference={info.reference} onClose={() => setQrOpen(false)} />}
      <footer className={footerClass}>
        {footerLead}
        <Button className="flex-1 sm:flex-none sm:min-w-52" disabled={!!hold?.expired} onClick={() => setStep("confirm")}>I&rsquo;ve paid, next step</Button>
      </footer>
    </>
  );

  return (
    <>
      <div className={bodyClass}>
        <Summary info={info} />
        <div className="flex items-center justify-between gap-3">
          {steps}
          <button type="button" onClick={() => setStep("pay")} className="text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Payment details</button>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Receipt screenshot <span className="font-normal text-ink-soft">· required</span></p>
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          {proof ? (
            <div className="flex items-center gap-4 rounded-2xl p-3 ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof} alt="Your payment receipt" className="h-24 w-20 shrink-0 rounded-xl object-cover ring-1 ring-line" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden className="text-forest"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>Receipt added</p>
                <p className="mt-0.5 text-xs text-ink-soft">Check the amount and transaction ID are readable.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <button type="button" onClick={() => fileInput.current?.click()} className="rounded-full px-3 py-1 text-xs font-medium text-ink ring-1 ring-line hover:ring-ink/40">Replace</button>
                <button type="button" onClick={() => setProof(null)} className="rounded-full px-3 py-1 text-xs text-ink-soft hover:text-ink">Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => fileInput.current?.click()} disabled={reading}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
              className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? "border-ink bg-paper" : "border-line hover:border-ink/40 hover:bg-paper/60"}`}>
              {reading ? <Spinner /> : (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-paper text-ink">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 15.5l-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span className="mt-3 text-sm font-medium text-ink">Upload a screenshot of your receipt</span>
                  <span className="mt-1 text-xs text-ink-soft">Tap to choose, or drop it here · JPG, PNG or WebP</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-xs text-ink-soft">Transaction ID (optional)</span><input className="input" value={txnRef} maxLength={60} onChange={(e) => setTxnRef(e.target.value)} placeholder="From your receipt" /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-ink-soft">Name on the sending account</span><input className="input" value={sender} maxLength={80} onChange={(e) => setSender(e.target.value)} autoComplete="name" /></label>
        </div>
        <div className="flex gap-3 rounded-2xl bg-paper px-4 py-3.5 text-xs leading-relaxed text-ink-soft">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden className="mt-0.5 shrink-0 text-ink"><path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5l6-2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7.5 10l1.8 1.8L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Our team matches your receipt with our account statement: the amount, the transaction ID and the time. Your session stays held while we check, and we confirm by email, usually within a few hours.</span>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
      <footer className={footerClass}>
        {footerLead}
        <Button className="flex-1 sm:flex-none sm:min-w-52" disabled={!proof || busy || reading || !!hold?.expired} onClick={submit}>{busy ? <Spinner /> : "Submit for verification"}</Button>
      </footer>
    </>
  );
}

function Verifying({ info, bodyClass, footerClass }: { info: Extract<CheckoutInfo, { state: "verifying" }>; bodyClass: string; footerClass: string }) {
  const at = info.submittedAt ? new Date(info.submittedAt) : null;
  const steps: [string, string, "done" | "now" | "next"][] = [
    ["Payment details sent", at ? `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${at.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}` : "Just now", "done"],
    ["We’re checking your payment", "We match your receipt with our account statement. Usually within a few hours.", "now"],
    ["Booking confirmed", "You’ll get an email with your session details and join link.", "next"],
  ];
  return (
    <>
      <div className={bodyClass}>
        <div className="rounded-2xl bg-paper px-5 py-4">
          <p className="text-xs text-ink-soft">Amount</p>
          <p className="font-display text-3xl leading-tight text-ink">{formatMoney(info.amountMinor, info.currency)}</p>
          <p className="text-xs text-ink-soft">Ref. {info.reference}{info.txnRef ? ` · Transaction ${info.txnRef}` : ""}</p>
        </div>
        <ol className="relative space-y-6 pl-1">
          {steps.map(([title, text, state], i) => (
            <li key={title} className="relative flex gap-4">
              {i < steps.length - 1 && <span className={`absolute left-[11px] top-7 h-[calc(100%+0.5rem)] w-px ${state === "done" ? "bg-forest" : "bg-line"}`} aria-hidden />}
              <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${state === "done" ? "bg-forest text-white" : state === "now" ? "bg-lemon text-ink ring-4 ring-lemon/40" : "bg-paper-dim text-ink-soft"}`}>
                {state === "done" ? <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : state === "now" ? <span className="h-2 w-2 animate-pulse rounded-full bg-ink" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <div className="min-w-0 pb-1">
                <p className={`text-sm font-medium ${state === "next" ? "text-ink-soft" : "text-ink"}`}>{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-soft">Your session time is held for you while we check. If we can&rsquo;t match the payment, we&rsquo;ll email you the reason.</p>
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
    track("payment_attempted", { reference: info.reference, label: "Card" });
    const { error: err } = await stripe.confirmPayment({
      elements,
      // Only used by payment methods that must leave the page (some bank authentications).
      confirmParams: { return_url: `${window.location.origin}/dashboard/student?paid=${info.reference}` },
      redirect: "if_required",
    });
    if (err) {
      track("payment_failed", { reference: info.reference, label: err.message ?? "Card payment failed" });
      setError(err.message ?? "Your payment could not be completed."); setBusy(false); return;
    }
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
    track("payment_attempted", { reference: info.reference, label: "Demo" });
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
export function CheckoutDialog({ reference, title, subtitle, onClose: close, onPaid: paid }: { reference: string; title: string; subtitle: string; onClose: () => void; onPaid: () => void }) {
  const onClose = useCallback(() => { close(); paymentChanged(); }, [close]);
  const onPaid = useCallback(() => { paid(); paymentChanged(); }, [paid]);
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
