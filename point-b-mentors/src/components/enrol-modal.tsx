"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Badge, Button, MentorPhoto, Spinner } from "./ui";
import { Checkout } from "./checkout";
import { InlineAuth } from "./inline-auth";
import { VerifyEmail } from "./verify-email";
import { classesLabel } from "./course-card";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { paymentChanged } from "@/lib/events";
import { track } from "@/lib/track";
import { fmtDay, fmtTime, formatMoney, TZ_LABEL } from "@/lib/format";
import { useNoticeLabel } from "@/lib/policy";
import { useNow } from "@/lib/use-api";
import type { Booking, Course } from "@/lib/types";

const BODY = "min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 sm:px-8";
const FOOT = "flex items-center justify-end gap-2 border-t border-line bg-white px-6 py-4 sm:px-8";

type Step = "review" | "payment" | "done";

/** Enrolment: check the course, then pay (card, bank or QR transfer, or POINT B balance), then confirmation. */
export function EnrolModal({ course: c, onClose: close }: { course: Course; onClose: (changed: boolean) => void }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const notice = useNoticeLabel();
  const [step, setStep] = useState<Step>("review");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClose = useCallback(() => close(!!booking), [close, booking]);
  const price = c.priceMinor ?? 0;
  const now = useNow();
  const upcoming = c.classes.filter((k) => new Date(k.startAt).getTime() > now);
  const missed = c.classes.length - upcoming.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const needsAuth = !loading && !user;
  const wrongRole = !!user && user.role !== "STUDENT";
  const minorBlocked = !!user && user.isMinor && !user.guardianConsent;
  const unconfirmed = user?.role === "STUDENT" && user.emailVerified === false;
  const blocked = needsAuth || wrongRole || minorBlocked || unconfirmed;
  useEffect(() => { if (!loading) track(needsAuth ? "auth_prompted" : "booking_step", { label: needsAuth ? c.title : step }); }, [loading, needsAuth, step, c.title]);

  async function hold() {
    setBusy(true); setError(null);
    try {
      const b = await api<Booking>(`/courses/${c.id}/enrol`, { body: { expectedPriceMinor: price } });
      track("booking_started", { label: c.title });
      setBooking(b);
      if (b.status === "CONFIRMED") setStep("done"); else setStep("payment");
      paymentChanged();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  const paid = useCallback(async () => {
    if (booking) setBooking(await api<Booking>(`/bookings/${booking.reference}`).catch(() => booking));
    setStep("done");
  }, [booking]);

  const HEAD: Record<Step, [string, string]> = {
    review: ["Enrol on this course", "Check the details, then pay to take your place."],
    payment: ["Complete payment", "Your place is held for 15 minutes while you pay."],
    done: ["You’re enrolled", "A confirmation email is on its way."],
  };
  const [title, subtitle] = needsAuth ? ["Sign in to enrol", "Create an account or sign in to continue."] : unconfirmed ? ["Confirm your email", "So we can send your class dates and join link."] : HEAD[step];

  let footer: React.ReactNode = null;
  if (!blocked && step === "review") footer = <><Button variant="secondary" onClick={onClose}>Not now</Button><Button className="flex-1 sm:flex-none sm:min-w-48" disabled={busy} onClick={hold}>{busy ? <Spinner /> : `Continue to payment`}</Button></>;
  if (step === "done") footer = <><Button variant="secondary" onClick={onClose}>Close</Button><Button className="flex-1 sm:flex-none" onClick={() => router.push("/dashboard/student")}>Go to my courses</Button></>;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-sm" onClick={() => step !== "payment" && onClose()} />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[min(720px,90dvh)] sm:flex-row sm:rounded-[28px]">
        <aside className="shrink-0 border-b border-line bg-paper px-6 py-5 sm:w-64 sm:border-b-0 sm:border-r sm:px-7 sm:py-8">
          <p className="font-display text-xl leading-tight text-ink sm:text-2xl">{c.title}</p>
          <div className="mt-4 flex items-center gap-3">
            <MentorPhoto name={c.mentor.name} photoUrl={c.mentor.photoUrl} className="h-10 w-10 shrink-0 rounded-full" initialsClass="text-sm" />
            <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{c.mentor.name}</p><p className="truncate text-xs text-ink-soft">{c.mentor.title}</p></div>
          </div>
          <dl className="mt-6 hidden space-y-4 text-sm sm:block">
            <Item label="Schedule" value={c.schedule} />
            <Item label="Classes" value={classesLabel(c)} />
            {c.firstClassAt && <Item label={missed ? "Next class" : "First class"} value={upcoming[0] ? fmtDay(upcoming[0].startAt) : fmtDay(c.firstClassAt)} />}
          </dl>
          <div className="mt-8 hidden border-t border-line pt-4 sm:block">
            <p className="text-xs text-ink-soft">Whole course</p>
            <p className="font-display text-3xl text-ink">{formatMoney(price, "PKR")}</p>
          </div>
          <p className="mt-3 text-xs text-ink-soft sm:hidden">{c.schedule} · {formatMoney(price, "PKR")}</p>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
            <div>
              <h2 className="font-display text-[1.75rem] leading-tight text-ink">{title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
            </div>
            <button onClick={onClose} aria-label={step === "payment" ? "Close and pay later" : "Close"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </header>

          {step === "payment" && booking ? (
            <Checkout reference={booking.reference} onPaid={paid} bodyClass={BODY} footerClass={FOOT} />
          ) : (<>
            <div className={BODY}>
              {needsAuth && <InlineAuth onDone={() => setStep("review")} />}
              {unconfirmed && <VerifyEmail />}
              {wrongRole && <Alert tone="info">You&rsquo;re signed in as a {user!.role.toLowerCase()}. Enrolling needs a learner account. Sign out and create one to enrol.</Alert>}
              {minorBlocked && <Alert tone="info">Anyone under 18 needs a parent or guardian to give consent before enrolling. We emailed your guardian when you registered; once they confirm, you can enrol.</Alert>}

              {!blocked && step === "review" && (
                <>
                  <div className="rounded-2xl bg-paper p-5 text-sm">
                    <Row l="Course" v={c.title} />
                    <Row l="Taught by" v={c.mentor.name} />
                    <Row l="Schedule" v={`${c.schedule}, ${TZ_LABEL}`} />
                    <Row l="Classes" v={classesLabel(c)} />
                    <Row l="Where" v="Live online, in your browser" />
                    <div className="mt-3 flex justify-between border-t border-line pt-3 font-medium text-ink"><span>Total for the whole course</span><span>{formatMoney(price, "PKR")}</span></div>
                  </div>
                  {missed > 0 && <Alert tone="info">{missed} of {c.classes.length} classes have already taken place. You&rsquo;ll join from the next one, on {upcoming[0] ? `${fmtDay(upcoming[0].startAt)} at ${fmtTime(upcoming[0].startAt)}` : "the final class"}.</Alert>}
                  <p className="text-xs leading-relaxed text-ink-soft">We hold your place for 15 minutes while you pay. Pay by card, bank transfer or QR, or with your POINT B balance. You can cancel for a full refund to your balance up to {notice} before the first class; see the <Link href="/legal?tab=refunds" className="underline" target="_blank">refund policy</Link>.</p>
                  {error && <Alert>{error}</Alert>}
                </>
              )}

              {step === "done" && booking && (
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-pale text-forest"><svg width="24" height="24" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">Reference <span className="font-medium text-ink">{booking.reference}</span>. Join every class from your dashboard; we&rsquo;ll email you a reminder 30 minutes before each one.</p>
                  {upcoming[0] && <Badge tone="forest" className="mt-4">First class for you · {fmtDay(upcoming[0].startAt)} · {fmtTime(upcoming[0].startAt)}</Badge>}
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

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-0.5 text-ink">{value}</dd></div>;
}

function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between gap-4 py-1"><span className="text-ink-soft">{l}</span><span className="text-right text-ink">{v}</span></div>;
}
