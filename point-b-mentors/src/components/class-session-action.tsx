"use client";

import { useEffect, useState } from "react";
import { FinanceModal } from "@/components/finance-modal";
import { Button } from "@/components/ui";
import { fmtDay, fmtTime } from "@/lib/format";

/** Room opens 10 minutes before start and closes an hour after end — matches the API call window. */
const OPENS_BEFORE_MS = 10 * 60_000;
const STAYS_OPEN_MS = 60 * 60_000;

export function classWindow(startAt: string, endAt: string, now = Date.now()) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const opensAt = start - OPENS_BEFORE_MS;
  const closesAt = end + STAYS_OPEN_MS;
  return {
    opensAt, closesAt,
    joinable: now >= opensAt && now <= closesAt,
    upcoming: now < opensAt,
    ended: now > closesAt,
  };
}

/** Mentor or student: Open class when the room is joinable; otherwise Session details with schedule. */
export function ClassSessionAction({
  href, startAt, endAt, classNumber, sessionsCount, courseTitle, mentorName, outline, role = "student", size = "sm",
}: {
  href: string; startAt: string; endAt: string; classNumber: number; sessionsCount: number;
  courseTitle: string; mentorName: string; outline?: string | null; role?: "student" | "mentor"; size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const win = classWindow(startAt, endAt, now);
  const detail = `Class ${classNumber} of ${sessionsCount}`;
  const btn = size === "md"
    ? "rounded-full px-6 py-3 text-sm font-medium"
    : "rounded-full px-5 py-2.5 text-sm font-medium";

  if (win.joinable) {
    return (
      <a href={href} target={role === "student" ? "_blank" : undefined} rel={role === "student" ? "noreferrer" : undefined}
        className={`${btn} bg-forest text-white transition-colors hover:bg-ink`}>
        {role === "mentor" ? `Open class ${classNumber}` : "Join now"}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${btn} bg-ink text-white transition-colors hover:bg-ink/90`}
        onClick={() => { setNow(Date.now()); setOpen(true); }}
      >
        Session details
      </button>
      {open && (
        <FinanceModal
          label="Class details"
          eyebrow={courseTitle}
          title={<span className="font-display text-2xl leading-tight text-ink">{detail}</span>}
          onClose={() => setOpen(false)}
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              {win.upcoming && (
                <Button size="sm" disabled>{role === "mentor" ? "Open class" : "Join now"}</Button>
              )}
            </div>
          }
        >
          <dl className="space-y-3 rounded-2xl bg-paper px-5 py-4 text-sm">
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">Date</dt><dd className="text-right text-ink">{fmtDay(startAt)}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">Time</dt><dd className="text-right text-ink">{fmtTime(startAt)}–{fmtTime(endAt)}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">{role === "mentor" ? "Learners" : "Teacher"}</dt><dd className="text-right text-ink">{mentorName}</dd></div>
            {outline && <div className="flex justify-between gap-6"><dt className="text-ink-soft">This class</dt><dd className="max-w-[60%] text-right text-ink">{outline}</dd></div>}
          </dl>
          <div className={`rounded-2xl px-5 py-4 ${win.ended ? "bg-paper" : "bg-lemon/60"}`}>
            <p className="font-medium text-ink">
              {win.ended ? "This class has finished" : "This class hasn’t started yet"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink/70">
              {win.ended
                ? "The room is closed."
                : `The room opens at ${fmtTime(new Date(win.opensAt).toISOString())}, 10 minutes before the start. ${role === "mentor" ? "Open the class from here once it’s time — learners join after you." : "You’ll be able to join from this page once the room opens."}`}
            </p>
          </div>
        </FinanceModal>
      )}
    </>
  );
}
