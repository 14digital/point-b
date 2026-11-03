"use client";

import { useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import type { Booking } from "@/lib/types";

export const Stars = ({ n }: { n: number }) => <span className="text-brass" aria-label={`${n} out of 5`}>{"★".repeat(n)}<span className="text-line">{"★".repeat(5 - n)}</span></span>;

const WORDS = ["", "Not helpful", "Could be better", "Good", "Very good", "Excellent"];

/** Rating and comment form. Submitted feedback stays private until the mentor approves it. */
export function FeedbackForm({ b, onDone, onCancel }: { b: Pick<Booking, "reference" | "mentor">; onDone: () => void; onCancel?: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { await api(`/bookings/${b.reference}/review`, { body: { rating, comment: comment.trim() } }); onDone(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-2xl bg-paper-dim p-4 sm:p-5">
      <p className="text-sm font-medium text-ink">How was your session with {b.mentor.name.split(" ")[0]}?</p>
      <div className="flex items-center gap-3">
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className={`text-3xl leading-none transition-transform hover:scale-110 ${n <= rating ? "text-brass" : "text-line"}`}>★</button>)}
        </div>
        <span className="text-sm text-ink-soft">{WORDS[rating]}</span>
      </div>
      <textarea className="input min-h-24" maxLength={1000} placeholder="What was useful? What will you do next?" value={comment} onChange={(e) => setComment(e.target.value)} />
      <p className="text-xs text-ink-soft">Your mentor reviews feedback before it appears on their public profile. Only your first name and initial are shown.</p>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !rating || comment.trim().length < 5} onClick={submit}>{busy ? <Spinner /> : "Submit feedback"}</Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

const STATE = {
  PENDING: "Sent to your mentor. It will appear on their public profile once they approve it.",
  APPROVED: "Published on your mentor’s public profile.",
  HIDDEN: "Shared with your mentor, who has chosen not to publish it.",
} as const;

/** What the student sees after submitting: their words plus where the feedback stands. */
export function SubmittedFeedback({ review }: { review: NonNullable<Booking["review"]> }) {
  return (
    <div className="rounded-2xl bg-paper-dim px-4 py-3 text-sm text-ink-soft">
      <Stars n={review.rating} /> <span className="ml-1">&ldquo;{review.comment}&rdquo;</span>
      <p className="mt-1.5 text-xs">{STATE[review.status ?? "APPROVED"]}</p>
    </div>
  );
}
