"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, MentorPhoto, Skeleton, Spinner } from "./ui";
import { api, errMsg } from "@/lib/api";
import { useApi, useNow } from "@/lib/use-api";
import { fmtDay, fmtDayShort, fmtTime, groupByDay, localTz } from "@/lib/format";
import type { Booking, MentorDetail, Slot } from "@/lib/types";

/** Lets a student move a confirmed session to another open time with the same mentor. */
export function RescheduleDialog({ b, onClose, onDone }: { b: Booking; onClose: () => void; onDone: () => void }) {
  const { data: mentor, loading, error: loadError } = useApi<MentorDetail>(`/mentors/${b.mentor.slug}`);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Booking | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, busy]);

  // Same session type, not the current time, at least an hour away (the API enforces the same rules).
  const group = b.sessionKind === "GROUP";
  const earliest = useNow() + 60 * 60_000;
  const options = (mentor?.slots ?? []).filter((s) => (s.kind === "GROUP") === group && s.startAt !== b.startAt && new Date(s.startAt).getTime() > earliest);
  const days = groupByDay(options);
  const activeKey = dayKey ?? days[0]?.key;
  const day = days.find((d) => d.key === activeKey);

  async function confirm() {
    if (!slot) return;
    setBusy(true); setError(null);
    try {
      setDone(await api<Booking>(`/bookings/${b.reference}/reschedule`, { body: { slotId: slot.id } }));
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Reschedule session">
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-sm" onClick={() => !busy && (done ? onDone() : onClose())} />
      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-center gap-4">
            <MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-12 w-12 shrink-0 rounded-full" initialsClass="text-base" />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">{done ? "All set" : "Reschedule"}</p>
              <h2 className="mt-1 font-display text-[1.75rem] leading-tight text-ink">{done ? "Your session has moved" : `Pick a new time with ${b.mentor.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0]}`}</h2>
            </div>
          </div>
          {!busy && (
            <button onClick={done ? onDone : onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft hover:bg-paper-dim hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
          {/* Current → new */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-paper p-4">
            <TimeBox label={done ? "Was" : "Current time"} iso={b.startAt} muted={!!slot || !!done} />
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-ink-soft" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {done ? <TimeBox label="Now" iso={done.startAt} highlight /> : slot ? <TimeBox label="New time" iso={slot.startAt} highlight /> : <div className="rounded-xl border border-dashed border-ink/15 px-3 py-2.5 text-xs text-ink-soft">Choose below</div>}
          </div>

          {done ? (
            <p className="text-sm leading-relaxed text-ink-soft">Your payment carries over, so there&rsquo;s nothing more to pay. We&rsquo;ve emailed you and {b.mentor.name} the new details, and you&rsquo;ll get a reminder 30 minutes before it starts.</p>
          ) : loading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-24" /></div>
          ) : loadError ? (
            <Alert>{loadError}</Alert>
          ) : days.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/15 px-6 py-10 text-center">
              <p className="font-display text-2xl text-ink">No other times open</p>
              <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">{b.mentor.name} has no other {group ? "group" : "1:1"} times available right now. Your current booking stays as it is.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-ink">Choose a day</p>
                <div className="no-scrollbar -mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                  {days.slice(0, 21).map((d) => {
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
              </div>
              <div>
                <p className="text-sm font-medium text-ink">Choose a time</p>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {day?.slots.map((s) => (
                    <button key={s.id} onClick={() => setSlot(s)} aria-pressed={slot?.id === s.id}
                      className={`rounded-full border py-2.5 text-sm transition-colors ${slot?.id === s.id ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"}`}>
                      {fmtTime(s.startAt)}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-ink-soft">Times in your timezone · {localTz()}</p>
              </div>
            </>
          )}
          {error && <Alert>{error}</Alert>}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-white px-6 py-4 sm:px-8">
          {done ? (
            <Button className="ml-auto" onClick={onDone}>Done</Button>
          ) : (
            <>
              <p className="hidden text-xs text-ink-soft sm:block">{b.rescheduleBy ? `Changes allowed until ${fmtDayShort(b.rescheduleBy)}, ${fmtTime(b.rescheduleBy)}` : ""}</p>
              <div className="flex flex-1 justify-end gap-2 sm:flex-none">
                <Button variant="secondary" disabled={busy} onClick={onClose}>Keep current time</Button>
                <Button disabled={!slot || busy} onClick={confirm}>{busy ? <Spinner /> : "Confirm new time"}</Button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function TimeBox({ label, iso, muted, highlight }: { label: string; iso: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${highlight ? "bg-white ring-1 ring-ink/10" : ""}`}>
      <p className="text-[11px] uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={`mt-0.5 text-sm ${muted ? "text-ink-soft line-through decoration-ink/30" : "font-medium text-ink"}`}>{fmtDay(iso).replace(/ \d{4}$/, "")}</p>
      <p className={`text-sm ${muted ? "text-ink-soft line-through decoration-ink/30" : "text-ink"}`}>{fmtTime(iso)}</p>
    </div>
  );
}
