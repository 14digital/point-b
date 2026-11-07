"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckoutDialog } from "@/components/checkout";
import { MentorPhoto } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PAYMENT_CHANGED } from "@/lib/events";
import { fmtDayShort, fmtTime, formatMoney } from "@/lib/format";
import type { Booking } from "@/lib/types";


const left = (iso: string, now: number) => {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  return { ms, label: `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` };
};

/**
 * A student who closes the payment window, or leaves the page, keeps seeing this reminder at the bottom of
 * every page until the session is paid or the hold runs out. One click reopens checkout where they left off.
 */
export function PaymentDueBar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [due, setDue] = useState<Booking[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [paying, setPaying] = useState<Booking | null>(null);
  const [paidFor, setPaidFor] = useState<Booking | null>(null);
  const isStudent = user?.role === "STUDENT";

  // Bumped to re-check: on page change, window focus, or a payment event.
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isStudent) return;
    let alive = true;
    api<Booking[]>("/bookings").then((rows) => {
      if (!alive) return;
      setDue(rows.filter((b) => b.status === "PENDING_PAYMENT" && !b.awaitingVerification && b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() > Date.now())
        .sort((a, b) => new Date(a.holdExpiresAt!).getTime() - new Date(b.holdExpiresAt!).getTime()));
    }).catch(() => undefined); // the reminder is a convenience; never break the page
    return () => { alive = false; };
  }, [isStudent, pathname, tick]);
  useEffect(() => {
    window.addEventListener(PAYMENT_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(PAYMENT_CHANGED, refresh); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  useEffect(() => {
    if (!due.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [due.length]);
  useEffect(() => {
    if (!paidFor) return;
    const t = setTimeout(() => setPaidFor(null), 8000);
    return () => clearTimeout(t);
  }, [paidFor]);

  const live = isStudent ? due.filter((b) => left(b.holdExpiresAt!, now).ms > 0) : [];
  const b = live[0];
  const onPaid = useCallback(() => {
    setPaidFor(paying); setPaying(null); refresh();
  }, [paying, refresh]);

  if (paidFor && !b) return (
    <Shell>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-white">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">You&rsquo;re booked in with {paidFor.mentor.name}</p>
        <p className="text-xs text-ink-soft">{fmtDayShort(paidFor.startAt)} at {fmtTime(paidFor.startAt)} · A confirmation email is on its way.</p>
      </div>
      <Link href="/dashboard/student" className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-line hover:ring-ink/40">My sessions</Link>
    </Shell>
  );
  if (!b && !paying) return null;

  const t = b ? left(b.holdExpiresAt!, now) : null;
  const urgent = !!t && t.ms < 3 * 60_000;
  return (
    <>
      {b && (
        <Shell>
          <MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="hidden h-10 w-10 shrink-0 rounded-full sm:block" initialsClass="text-sm" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-ink">
              <span className={`h-2 w-2 shrink-0 rounded-full ${urgent ? "bg-rust" : "bg-brass"} animate-pulse`} aria-hidden />
              Payment due · {formatMoney(b.priceMinor, b.currency)}
            </p>
            <p className="truncate text-xs text-ink-soft">
              <span className={`font-mono font-medium tabular-nums ${urgent ? "text-rust" : "text-ink"}`}>{t!.label}</span> left<span className="hidden sm:inline"> to hold your time</span> · {b.mentor.name}, {fmtDayShort(b.startAt)} at {fmtTime(b.startAt)}
              {live.length > 1 && <> · <a href="/dashboard/student?tab=awaiting-payment" className="underline underline-offset-2">{live.length - 1} more</a></>}
            </p>
          </div>
          <button type="button" onClick={() => setPaying(b)} className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] sm:px-5"><span className="sm:hidden">Pay now</span><span className="hidden sm:inline">Complete payment</span></button>
        </Shell>
      )}
      {paying && (
        <CheckoutDialog reference={paying.reference} title={`Session with ${paying.mentor.name}`} subtitle={`${fmtDayShort(paying.startAt)} · ${fmtTime(paying.startAt)}`}
          onClose={() => { setPaying(null); refresh(); }} onPaid={onPaid} />
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-3 sm:pb-5" role="status" aria-live="polite">
      <div className="pointer-events-auto flex w-full max-w-2xl animate-[pop_0.35s_ease-out] items-center gap-3 rounded-[22px] bg-white/95 p-3 pl-4 shadow-[0_24px_60px_-20px_rgba(17,17,17,0.45)] ring-1 ring-line backdrop-blur sm:gap-4 sm:p-3.5 sm:pl-4">
        {children}
      </div>
    </div>
  );
}
