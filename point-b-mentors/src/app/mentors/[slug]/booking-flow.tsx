"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Field, MentorPhoto, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AGENDAS } from "@/lib/constants";
import { Checkout } from "@/components/checkout";
import { fmtDay, fmtDayShort, fmtTime, formatMoney, groupByDay, localTz } from "@/lib/format";
import type { Booking, MentorDetail, SessionKind, Slot } from "@/lib/types";

export function BookingPanel({ mentor, onSlotTaken }: { mentor: MentorDetail; onSlotTaken: () => void }) {
  const hasGroup = mentor.slots.some((s) => s.kind === "GROUP");
  const hasSolo = mentor.slots.some((s) => s.kind !== "GROUP");
  const [kind, setKind] = useState<SessionKind>("ONE_TO_ONE");
  const mode: SessionKind = kind === "GROUP" ? (hasGroup ? "GROUP" : "ONE_TO_ONE") : (hasSolo ? "ONE_TO_ONE" : "GROUP");
  const days = groupByDay(mentor.slots.filter((s) => (mode === "GROUP") === (s.kind === "GROUP")));
  const price = mode === "GROUP" ? mentor.groupPriceMinor : mentor.priceMinor;
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [open, setOpen] = useState(false);
  const activeKey = dayKey ?? days[0]?.key;
  const day = days.find((d) => d.key === activeKey);

  if (days.length === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-paper px-5 py-6 text-center">
        <p className="font-display text-xl text-ink">No open times right now</p>
        <p className="mt-1 text-sm text-ink-soft">New availability is added regularly. Please check back soon.</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-4xl leading-none text-ink">{formatMoney(price, mentor.currency)}</span>
        <span className="text-sm text-ink-soft">{mode === "GROUP" ? "per seat · 30 min" : "30 min · private"}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1" role="group" aria-label="Session type">
        {([["ONE_TO_ONE", "1:1 session", mentor.priceMinor, hasSolo], ["GROUP", "Group", mentor.groupPriceMinor, hasGroup]] as const).map(([k, label, amt, avail]) => (
          <button key={k} disabled={!avail} aria-pressed={mode === k} onClick={() => { setKind(k); setDayKey(null); setSlot(null); }}
            className={`rounded-xl px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${mode === k ? "bg-white shadow-sm ring-1 ring-ink/5" : "hover:bg-white/50"}`}>
            <span className="block text-sm font-medium text-ink">{label}</span>
            <span className="text-xs text-ink-soft">{avail ? `${formatMoney(amt, mentor.currency)}${k === "GROUP" ? " / seat" : ""}` : "None scheduled"}</span>
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">{mode === "GROUP" ? "Share the call with a few other students. Lower price, less one-on-one time." : "Just you and the mentor, the full 30 minutes."}</p>

      <p className="mt-6 text-sm font-medium text-ink">Choose a day</p>
      <div className="no-scrollbar -mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(90deg,#000_85%,transparent)]">
        {days.slice(0, 14).map((d) => {
          const on = activeKey === d.key;
          const dt = new Date(d.iso);
          return (
            <button key={d.key} onClick={() => { setDayKey(d.key); setSlot(null); }} aria-pressed={on}
              className={`flex w-[62px] shrink-0 snap-start flex-col items-center rounded-2xl py-2.5 transition-colors ${on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-dim"}`}>
              <span className={`text-[11px] uppercase tracking-wider ${on ? "text-paper/60" : "text-ink-soft"}`}>{dt.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span className="mt-0.5 font-display text-2xl leading-tight">{dt.getDate()}</span>
              <span className={`text-[11px] ${on ? "text-paper/60" : "text-ink-soft"}`}>{dt.toLocaleDateString("en-GB", { month: "short" })}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink">Choose a time</p>
        {day && <p className="text-xs text-ink-soft">{day.slots.length} available</p>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {day?.slots.map((s) => (
          <button key={s.id} onClick={() => setSlot(s)} aria-pressed={slot?.id === s.id}
            className={`rounded-full border py-2.5 text-sm transition-colors ${slot?.id === s.id ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"}`}>
            {fmtTime(s.startAt)}
            {s.kind === "GROUP" && <span className={`block text-[10px] leading-tight ${slot?.id === s.id ? "text-paper/70" : "text-ink-soft"}`}>{s.seatsLeft} of {s.capacity} seats</span>}
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" /><path d="M2 10h16M10 2c2.5 2.5 2.5 13.5 0 16M10 2c-2.5 2.5-2.5 13.5 0 16" stroke="currentColor" strokeWidth="1.2" /></svg>
        Times in your timezone · {localTz()}
      </p>
      <Button className="mt-6 w-full" size="lg" disabled={!slot} onClick={() => setOpen(true)}>
        {slot ? `Book ${fmtTime(slot.startAt)}, ${fmtDayShort(slot.startAt)}` : "Select a time"}
      </Button>
      {open && slot && <BookingModal mentor={mentor} slot={slot} price={price} onClose={() => setOpen(false)} onSlotTaken={() => { setOpen(false); setSlot(null); onSlotTaken(); }} />}
    </div>
  );
}

const BODY = "min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 sm:px-8";
const FOOT = "flex items-center justify-end gap-2 border-t border-line bg-white px-6 py-4 sm:px-8";

type Step = "auth" | "agenda" | "prepare" | "review" | "payment" | "done";
const STEPS: Step[] = ["agenda", "prepare", "review", "payment"];

function BookingModal({ mentor, slot, price, onClose, onSlotTaken }: { mentor: MentorDetail; slot: Slot; price: number; onClose: () => void; onSlotTaken: () => void }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("agenda");
  const [agenda, setAgenda] = useState("");
  const [situation, setSituation] = useState("");
  const [outcome, setOutcome] = useState("");
  const [materials, setMaterials] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && step !== "payment" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, step]);

  const needsAuth = !loading && !user;
  const wrongRole = !!user && user.role !== "STUDENT";
  const minorBlocked = !!user && user.isMinor && !user.guardianConsent;
  const index = STEPS.indexOf(step);

  async function hold() {
    setBusy(true); setError(null);
    try {
      const b = await api<Booking>("/bookings", { body: { slotId: slot.id, agenda, currentSituation: situation, usefulOutcome: outcome, materialsToReview: materials || undefined } });
      setBooking(b); setStep("payment");
    } catch (e) {
      const msg = errMsg(e);
      if (/just taken|no longer available/i.test(msg)) { setError(msg); setTimeout(onSlotTaken, 1800); } else setError(msg);
    } finally { setBusy(false); }
  }

  const paid = useCallback(async () => {
    if (booking) setBooking(await api<Booking>(`/bookings/${booking.reference}`).catch(() => booking));
    setStep("done");
  }, [booking]);

  const blocked = needsAuth || wrongRole || minorBlocked;
  const first = mentor.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0];
  const HEAD: Record<Step, [string, string]> = {
    auth: ["Sign in", "Create an account or sign in to continue."],
    agenda: ["What would you like to focus on?", "Pick the topic closest to what you want to talk about."],
    prepare: [`Help ${first} prepare`, `These notes go to ${first} before the call so the 30 minutes are well used.`],
    review: ["Review your booking", "Check the details before we hold your time."],
    payment: ["Complete payment", "Your time is held while you pay. Reschedule free up to 2 days before."],
    done: ["You\u2019re booked in", "A confirmation email is on its way."],
  };
  const [title, subtitle] = needsAuth ? HEAD.auth : HEAD[step];

  let footer: React.ReactNode = null;
  if (!blocked && step === "agenda") footer = <Button className="w-full sm:w-auto sm:min-w-40" disabled={!agenda} onClick={() => setStep("prepare")}>Continue</Button>;
  if (!blocked && step === "prepare") footer = <><Button variant="secondary" onClick={() => setStep("agenda")}>Back</Button><Button className="flex-1 sm:flex-none sm:min-w-40" disabled={situation.trim().length < 10 || outcome.trim().length < 10} onClick={() => setStep("review")}>Continue</Button></>;
  if (!blocked && step === "review") footer = <><Button variant="secondary" onClick={() => setStep("prepare")}>Back</Button><Button className="flex-1 sm:flex-none sm:min-w-48" disabled={busy} onClick={hold}>{busy ? <Spinner /> : "Continue to payment"}</Button></>;
  if (step === "done") footer = <><Button variant="secondary" onClick={onClose}>Close</Button><Button className="flex-1 sm:flex-none" onClick={() => router.push("/dashboard/student")}>Go to my sessions</Button></>;

  // Portal to <body>: the booking card is animated (transform), which would otherwise trap a fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-sm" onClick={() => step !== "payment" && onClose()} />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[min(720px,90dvh)] sm:flex-row sm:rounded-[28px]">
        {/* Summary rail */}
        <aside className="shrink-0 border-b border-line bg-paper px-6 py-5 sm:w-64 sm:border-b-0 sm:border-r sm:px-7 sm:py-8">
          <div className="flex items-center gap-3 sm:block">
            <MentorPhoto name={mentor.name} photoUrl={mentor.photoUrl} className="h-12 w-12 shrink-0 rounded-full sm:h-16 sm:w-16" initialsClass="text-lg sm:text-xl" />
            <div className="min-w-0 sm:mt-4">
              <p className="truncate font-medium text-ink">{mentor.name}</p>
              <p className="truncate text-xs text-ink-soft sm:whitespace-normal">{mentor.title}</p>
            </div>
          </div>
          <dl className="mt-6 hidden space-y-4 text-sm sm:block">
            <SummaryItem label="Date" value={fmtDay(slot.startAt)} />
            <SummaryItem label="Time" value={`${fmtTime(slot.startAt)} – ${fmtTime(slot.endAt)}`} />
            <SummaryItem label="Session" value={slot.kind === "GROUP" ? `Group · up to ${slot.capacity}` : "1:1 · 30 minutes"} />
            {agenda && <SummaryItem label="Focus" value={agenda} />}
          </dl>
          <p className="mt-3 text-xs text-ink-soft sm:hidden">{fmtDayShort(slot.startAt)} · {fmtTime(slot.startAt)} · {formatMoney(price, mentor.currency)}</p>
          <div className="mt-8 hidden border-t border-line pt-4 sm:block">
            <p className="text-xs text-ink-soft">{slot.kind === "GROUP" ? "Per seat" : "Total"}</p>
            <p className="font-display text-3xl text-ink">{formatMoney(price, mentor.currency)}</p>
          </div>
        </aside>

        {/* Step content */}
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
            <div>
              {!blocked && index >= 0 && <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">Step {index + 1} of {STEPS.length}</p>}
              <h2 className="mt-1.5 font-display text-[1.75rem] leading-tight text-ink">{title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
            </div>
            {step !== "payment" && (
              <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            )}
          </header>
          {!blocked && index >= 0 && (
            <div className="mt-5 flex gap-1.5 px-6 sm:px-8" aria-hidden>{STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= index ? "bg-ink" : "bg-paper-dim"}`} />)}</div>
          )}

          {step === "payment" && booking ? (
            <Checkout reference={booking.reference} onPaid={paid} bodyClass={BODY} footerClass={FOOT} />
          ) : (<>
          <div className={BODY}>
            {needsAuth && <InlineAuth onDone={() => setStep("agenda")} />}
            {wrongRole && <Alert tone="info">You&rsquo;re signed in as a {user!.role.toLowerCase()}. Booking sessions needs a student account — sign out and register as a student.</Alert>}
            {minorBlocked && <Alert tone="info">Students under 18 need a parent or guardian to give consent before booking. We emailed your guardian when you registered; once they confirm, you can book. Contact support if you need help.</Alert>}

            {!blocked && step === "agenda" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AGENDAS.map((a) => (
                  <button key={a} onClick={() => setAgenda(a)} aria-pressed={agenda === a}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm transition-all ${agenda === a ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink/40 hover:bg-paper"}`}>
                    {a}
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${agenda === a ? "border-paper bg-paper" : "border-ink/25"}`}>
                      {agenda === a && <span className="h-2 w-2 rounded-full bg-ink" />}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!blocked && step === "prepare" && (
              <>
                <Field label="What is your current situation?" hint={`${situation.length}/1000 · at least 10 characters`}><textarea className="input min-h-24" maxLength={1000} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="e.g. Final-year student deciding between two job offers" /></Field>
                <Field label="What would make this session useful?" hint="At least 10 characters"><textarea className="input min-h-24" maxLength={1000} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. A clearer way to compare the two offers" /></Field>
                <Field label="Anything to review beforehand? (optional)"><textarea className="input min-h-16" maxLength={1000} value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="e.g. A link to your CV or portfolio" /></Field>
              </>
            )}

            {!blocked && step === "review" && (
              <>
                <div className="rounded-2xl bg-paper p-5 text-sm">
                  <Row l="Mentor" v={mentor.name} /><Row l="Date" v={fmtDay(slot.startAt)} />
                  <Row l="Time" v={`${fmtTime(slot.startAt)}–${fmtTime(slot.endAt)} (30 minutes)`} /><Row l="Type" v={slot.kind === "GROUP" ? `Group session (up to ${slot.capacity} students)` : "1:1 session"} /><Row l="Focus" v={agenda} />
                  <Row l={slot.kind === "GROUP" ? "Fee per seat" : "Session fee"} v={formatMoney(price, mentor.currency)} /><Row l="Taxes & processing fees" v={formatMoney(0, mentor.currency)} />
                  <div className="mt-3 flex justify-between border-t border-line pt-3 font-medium text-ink"><span>Total due</span><span>{formatMoney(price, mentor.currency)}</span></div>
                </div>
                <p className="text-xs leading-relaxed text-ink-soft">We hold your {slot.kind === "GROUP" ? "seat" : "slot"} for 15 minutes while you pay. Booked sessions can&rsquo;t be cancelled, but you can reschedule for free up to 2 days before; see the <Link href="/legal?tab=refunds" className="underline" target="_blank">rescheduling policy</Link>.</p>
                {error && <Alert>{error}</Alert>}
              </>
            )}

            {step === "done" && booking && (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-pale text-forest"><svg width="24" height="24" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">Reference <span className="font-medium text-ink">{booking.reference}</span>. Your meeting link is on your dashboard, and you&rsquo;ll get a reminder 30 minutes before.</p>
                <Badge tone="forest" className="mt-4">{fmtDay(booking.startAt)} · {fmtTime(booking.startAt)}</Badge>
              </div>
            )}
          </div>

          {footer && <footer className={FOOT}>{footer}</footer>}
          </>)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function InlineAuth({ onDone }: { onDone: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"up" | "in">("up");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === "in") await login(f.email, f.password);
      else await register({ ...f, timezone: localTz() });
      onDone();
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-soft">{mode === "up" ? "Create a free account to book. It takes a few seconds." : "Welcome back. Sign in to continue your booking."}</p>
      {mode === "up" && <Field label="Full name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>}
      <Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
      <Field label="Password" hint={mode === "up" ? "At least 8 characters" : undefined}><input className="input" type="password" required minLength={mode === "up" ? 8 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "up" ? "new-password" : "current-password"} /></Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? <Spinner /> : mode === "up" ? "Create account & continue" : "Sign in & continue"}</Button>
      <button type="button" className="w-full text-center text-sm text-ink-soft underline underline-offset-4" onClick={() => { setMode(mode === "up" ? "in" : "up"); setError(null); }}>
        {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
      <p className="text-center text-xs text-ink-soft">Under 18? Register on the <Link href="/sign-in?mode=register" className="underline">sign-up page</Link> so we can ask a guardian for consent.</p>
    </form>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between gap-4 py-1"><span className="text-ink-soft">{l}</span><span className="text-right text-ink">{v}</span></div>;
}
