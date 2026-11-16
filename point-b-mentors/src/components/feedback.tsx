"use client";

import { useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import type { Booking } from "@/lib/types";

export const Stars = ({ n }: { n: number }) => <span className="text-brass" aria-label={`${n} out of 5`}>{"★".repeat(n)}<span className="text-line">{"★".repeat(5 - n)}</span></span>;

const WORDS = ["", "Not helpful", "Could be better", "Good", "Very good", "Excellent"];
const LIKERT = [
  { key: "clarity" as const, label: "Teaching clarity", hint: "How clear was the teaching?" },
  { key: "usefulness" as const, label: "Usefulness", hint: "How useful was this for your work or studies?" },
  { key: "recommend" as const, label: "Would recommend", hint: "Would you recommend this course to a peer?" },
];

type Scores = { clarity: number; usefulness: number; recommend: number };

/** Rating and comment form. Course enrolments also ask three short Likert items. Submitted feedback stays private until the POINT B team approves it. */
export function FeedbackForm({ b, existing, onDone, onCancel }: {
  b: Pick<Booking, "reference" | "mentor" | "course">;
  existing?: { rating: number; comment: string; clarity?: number | null; usefulness?: number | null; recommend?: number | null };
  onDone: () => void; onCancel?: () => void;
}) {
  const isCourse = !!b.course;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [scores, setScores] = useState<Scores>({
    clarity: existing?.clarity ?? 0,
    usefulness: existing?.usefulness ?? 0,
    recommend: existing?.recommend ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const likertReady = !isCourse || (scores.clarity > 0 && scores.usefulness > 0 && scores.recommend > 0);
  const unchanged = !!existing && rating === existing.rating && comment.trim() === existing.comment
    && (!isCourse || (scores.clarity === (existing.clarity ?? 0) && scores.usefulness === (existing.usefulness ?? 0) && scores.recommend === (existing.recommend ?? 0)));

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api(`/bookings/${b.reference}/review`, {
        method: existing ? "PATCH" : "POST",
        body: { rating, comment: comment.trim(), ...(isCourse ? scores : {}) },
      });
      onDone();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 rounded-2xl bg-gradient-to-b from-paper-dim to-white p-4 ring-1 ring-line/80 sm:p-5">
      <div>
        <p className="text-sm font-medium text-ink">{existing ? "Edit your feedback" : isCourse ? `How was ${b.course!.title}?` : `How was your session with ${b.mentor.name.split(" ")[0]}?`}</p>
        {isCourse && !existing && <p className="mt-1 text-xs text-ink-soft">One short review for the whole course — stars, three quick ratings, and a comment.</p>}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Overall</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" role="radiogroup" aria-label="Overall rating">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className={`text-3xl leading-none transition-transform hover:scale-110 ${n <= rating ? "text-brass" : "text-line"}`}>★</button>)}
          </div>
          <span className="text-sm text-ink-soft">{WORDS[rating] || "Tap a star"}</span>
        </div>
      </div>
      {isCourse && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Quick ratings</p>
          <ul className="space-y-2.5">
            {LIKERT.map((item) => (
              <li key={item.key} className="rounded-2xl bg-white px-3 py-3 ring-1 ring-line/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="text-xs text-ink-soft">{item.hint}</p>
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={item.label}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={scores[item.key] === n} aria-label={`${n}`}
                        onClick={() => setScores((s) => ({ ...s, [item.key]: n }))}
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium tabular-nums transition-colors ${scores[item.key] === n ? "bg-ink text-white" : "bg-paper text-ink ring-1 ring-line hover:ring-ink/30"}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Comment</p>
        <textarea className="input min-h-28" maxLength={1000} placeholder={isCourse ? "What will you take into your next role? Anything we should improve?" : "What was useful? What will you do next?"} value={comment} onChange={(e) => setComment(e.target.value)} />
        <p className="mt-1.5 text-xs text-ink-soft">{existing ? "You can only edit your feedback once, so please check it before saving. Our team will review it again." : "Your teacher can read this. The POINT B team reviews feedback before anything appears on a public profile."}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !rating || !likertReady || comment.trim().length < 5 || unchanged} onClick={submit}>{busy ? <Spinner /> : existing ? "Save changes" : "Submit feedback"}</Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

const STATE = {
  PENDING: "Thank you. Our team reviews feedback before it appears on the teacher’s public profile.",
  APPROVED: "Shared with your teacher.",
  HIDDEN: "Shared with your teacher.",
} as const;

/** What the student sees after submitting: their words, where the feedback stands, and any actions the page offers. */
export function SubmittedFeedback({ review, onEdit, onSupport }: {
  review: NonNullable<Booking["review"]>;
  onEdit?: () => void; onSupport?: () => void;
}) {
  const canEdit = !!onEdit && review.canEdit;
  const likert = [
    review.clarity != null && `Clarity ${review.clarity}/5`,
    review.usefulness != null && `Usefulness ${review.usefulness}/5`,
    review.recommend != null && `Recommend ${review.recommend}/5`,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper-dim px-4 py-3 text-sm text-ink-soft">
      <div className="min-w-0 flex-1 basis-60">
        <Stars n={review.rating} /> <span className="ml-1 break-words">&ldquo;{review.comment}&rdquo;</span>
        {!!likert.length && <p className="mt-1 text-xs">{likert.join(" · ")}</p>}
        <p className="mt-1.5 text-xs">{STATE[review.status ?? "APPROVED"]}</p>
      </div>
      {(canEdit || onSupport) && (
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>}
          {onSupport && <Button size="sm" variant="secondary" onClick={onSupport}>Support</Button>}
        </div>
      )}
    </div>
  );
}
