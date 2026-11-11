"use client";

import { useEffect, useState } from "react";
import { FinanceModal } from "@/components/finance-modal";
import { Button } from "@/components/ui";
import { fmtDay, fmtTime } from "@/lib/format";

/** The room opens this long before the start. Must match the call check in the API. */
const OPENS_BEFORE_MS = 10 * 60_000;

function timeLeft(ms: number) {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
  const days = Math.round(mins / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Joins the call once the room is open. Before that it shows when the room opens in a popup, instead of sending
 * the student to a waiting page. Keeps its own clock, so "Join now" appears on time without a refresh.
 */
export function SessionButton({ link, startAt, endAt, withName, detail, joinClass, waitClass, waitLabel = "Session details" }: {
  link: string; startAt: string; endAt: string; withName: string; detail: string; joinClass: string; waitClass: string; waitLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const opensAt = new Date(startAt).getTime() - OPENS_BEFORE_MS;
  const open = now >= opensAt;

  return (
    <>
      {open
        ? <a href={link} target="_blank" rel="noreferrer" className={joinClass}>Join now</a>
        : <button type="button" className={waitClass} onClick={() => { setNow(Date.now()); setShowing(true); }}>{waitLabel}</button>}
      {showing && (
        <FinanceModal label="Your session" eyebrow="Your session" onClose={() => setShowing(false)}
          title={<span className="font-display text-2xl leading-tight text-ink">Session with {withName}</span>}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowing(false)}>Close</Button>
              {open
                ? <a href={link} target="_blank" rel="noreferrer" onClick={() => setShowing(false)} className="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-white">Join now</a>
                : <Button size="sm" disabled>Join now</Button>}
            </div>
          }>
          <dl className="space-y-3 rounded-2xl bg-paper px-5 py-4 text-sm">
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">Date</dt><dd className="text-right text-ink">{fmtDay(startAt)}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">Time</dt><dd className="text-right text-ink">{fmtTime(startAt)}–{fmtTime(endAt)}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">Session</dt><dd className="text-right text-ink">{detail}</dd></div>
          </dl>
          <div className={`rounded-2xl px-5 py-4 ${open ? "bg-mint" : "bg-lemon/60"}`} aria-live="polite">
            <p className="font-medium text-ink">{open ? "Your session is open" : "Your session isn’t open yet"}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/70">
              {open ? "The call room is ready. Join whenever you’re set." : `The call room opens at ${fmtTime(new Date(opensAt).toISOString())}, in ${timeLeft(opensAt - now)}.${new Date(startAt).getTime() - now > 30 * 60_000 ? " We’ll email you a reminder 30 minutes before the start." : ""}`}
            </p>
          </div>
        </FinanceModal>
      )}
    </>
  );
}
