"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Mark, MentorPhoto, Skeleton, Spinner } from "@/components/ui";
import { DashboardHero, DateTile, Panel, StatTile, Tabs, greeting, relative } from "@/components/dashboard";
import { Reveal } from "@/components/motion";
import { CheckoutDialog } from "@/components/checkout";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtDayShort, fmtTime, formatMoney } from "@/lib/format";
import { useApi, useNow } from "@/lib/use-api";
import type { Booking } from "@/lib/types";

const TABS = ["Upcoming", "Awaiting payment", "Past"] as const;
type Tab = (typeof TABS)[number];

export default function StudentDashboardPage() {
  return <RequireRole role="STUDENT"><Suspense><Dashboard /></Suspense></RequireRole>;
}

function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<Booking[]>("/bookings");
  const params = useSearchParams();
  const router = useRouter();
  const returned = params.get("paid");
  // Back from a payment method that redirects (e.g. bank authentication): confirm with the API, then tidy the URL.
  useEffect(() => {
    if (!returned) return;
    api(`/payments/${returned}/sync`, { method: "POST" }).catch(() => undefined).finally(() => { reload(); router.replace("/dashboard/student"); });
  }, [returned, reload, router]);
  const now = useNow();
  const upcoming = (data ?? []).filter((b) => b.status === "CONFIRMED" && new Date(b.endAt).getTime() > now).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const pending = (data ?? []).filter((b) => b.status === "PENDING_PAYMENT");
  const past = (data ?? []).filter((b) => !upcoming.includes(b) && !pending.includes(b)).sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt));
  const completed = past.filter((b) => b.status === "COMPLETED");
  const needsFeedback = completed.filter((b) => !b.review);
  const [tab, setTab] = useState<Tab>("Upcoming");
  const tabs = TABS.filter((t) => t !== "Awaiting payment" || pending.length > 0);
  const next = upcoming[0];

  return (
    <>
      <DashboardHero
        eyebrow={<><span>Student dashboard</span><span aria-hidden>·</span><span>{user?.timezone}</span></>}
        title={<>{greeting()}, <Mark>{user?.name.split(" ")[0]}</Mark></>}
        subtitle={next ? `Your next session is ${relative(next.startAt, now)}, with ${next.mentor.name}.` : "Find a mentor who has been where you're going, and book a 30-minute conversation."}
        actions={<><Button href="/mentors">Book a session</Button><Button href="/contact" variant="secondary">Get help</Button></>}
      >
        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Upcoming" value={loading ? "–" : upcoming.length} tone="sky" />
          <StatTile label="Completed" value={loading ? "–" : completed.length} tone="mint" delay={60} />
          <StatTile label="Mentors met" value={loading ? "–" : new Set(completed.map((b) => b.mentor.id)).size} tone="peach" delay={120} />
          <StatTile label="Feedback to give" value={loading ? "–" : needsFeedback.length} tone="lemon" delay={180} />
        </div>
      </DashboardHero>

      <Container className="py-10 sm:py-12">
        {user?.isMinor && !user.guardianConsent && <div className="mb-6 max-w-2xl"><Alert tone="info">Your parent or guardian still needs to confirm consent before you can book sessions. Contact support if they haven&rsquo;t received our email.</Alert></div>}
        {error && <div className="mb-6"><Alert>{error}</Alert></div>}

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-8">
            {next && <NextSession b={next} now={now} />}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-3xl text-ink">Your sessions</h2>
              <Tabs tabs={tabs} value={tabs.includes(tab) ? tab : "Upcoming"} onChange={setTab} counts={{ Upcoming: upcoming.length, "Awaiting payment": pending.length, Past: past.length }} />
            </div>

            <div className="space-y-3">
              {loading ? <><Skeleton className="h-28 rounded-3xl" /><Skeleton className="h-28 rounded-3xl" /></> : (
                <>
                  {tab === "Upcoming" && (upcoming.length === 0
                    ? <EmptyState title="No upcoming sessions" description="Book a mentor and your confirmed session will appear here, with a button to join the call." />
                    : upcoming.map((b, i) => <Reveal key={b.id} delay={i * 60}><UpcomingCard b={b} onChange={reload} /></Reveal>))}
                  {tab === "Awaiting payment" && pending.map((b) => <PendingCard key={b.id} b={b} onChange={reload} />)}
                  {tab === "Past" && (past.length === 0
                    ? <EmptyState title="No past sessions yet" description="Your completed sessions will appear here." />
                    : past.map((b, i) => <Reveal key={b.id} delay={i * 50}><PastCard b={b} onChange={reload} /></Reveal>))}
                </>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {needsFeedback.length > 0 && (
              <div className="rounded-3xl bg-mint p-6">
                <p className="font-display text-2xl text-ink">How did it go?</p>
                <p className="mt-2 text-sm text-ink/70">You have {needsFeedback.length} session{needsFeedback.length > 1 ? "s" : ""} waiting for feedback. It takes a minute and helps other students choose.</p>
                <Button size="sm" className="mt-4" onClick={() => setTab("Past")}>Leave feedback</Button>
              </div>
            )}
            <Panel title="Your account">
              <dl className="space-y-3 text-sm">
                <div><dt className="text-ink-soft">Name</dt><dd className="text-ink">{user?.name}</dd></div>
                <div><dt className="text-ink-soft">Email</dt><dd className="break-all text-ink">{user?.email}</dd></div>
                <div><dt className="text-ink-soft">Timezone</dt><dd className="text-ink">{user?.timezone}</dd></div>
              </dl>
            </Panel>
            <div className="rounded-3xl bg-paper-dim p-6">
              <p className="font-display text-2xl text-ink">Good to know</p>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                <li>The call room opens 10 minutes before the start.</li>
                <li>Need a different time? Reschedule up to 2 days before.</li>
                <li>We email a reminder 30 minutes ahead.</li>
              </ul>
              <Link href="/contact" className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-4">Contact support</Link>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}

/** Highlighted card for the soonest confirmed session. */
function NextSession({ b, now }: { b: Booking; now: number }) {
  const open = new Date(b.startAt).getTime() - now <= 10 * 60_000;
  return (
    <div className="animate-rise overflow-hidden rounded-[2rem] bg-ink p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-center gap-5">
        <DateTile iso={b.startAt} dark />
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white/20"><MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-full w-full" initialsClass="text-xl" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/60">Your next session · {relative(b.startAt, now)}</p>
          <p className="mt-1 font-display text-3xl leading-tight">{b.mentor.name}</p>
          <p className="text-sm text-white/70">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.sessionKind === "GROUP" ? "Group session" : "1:1 session"} · {b.agenda}</p>
        </div>
        {b.meetingLink && (
          <a href={b.meetingLink} target="_blank" rel="noreferrer" className={`rounded-full px-6 py-3 text-sm font-medium transition-colors ${open ? "bg-mint text-ink hover:bg-white" : "bg-white text-ink hover:bg-white/90"}`}>
            {open ? "Join now" : "Open session page"}
          </a>
        )}
      </div>
      {!open && <p className="mt-5 border-t border-white/10 pt-4 text-xs text-white/55">The call room opens 10 minutes before the start. You&rsquo;ll get an email reminder 30 minutes ahead.</p>}
    </div>
  );
}

function Who({ b }: { b: Booking }) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <DateTile iso={b.startAt} />
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full"><MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-full w-full" initialsClass="text-base" /></div>
      <div className="min-w-0">
        <Link href={`/mentors/${b.mentor.slug}`} className="font-display text-xl text-ink hover:underline">{b.mentor.name}</Link>
        <p className="text-sm text-ink-soft">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.agenda}</p>
        <p className="text-xs text-ink-soft">{b.sessionKind === "GROUP" ? "Group session" : "1:1 session"} · {b.reference}</p>
      </div>
    </div>
  );
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onDone(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function UpcomingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [moving, setMoving] = useState(false);
  const now = useNow();
  const soon = new Date(b.startAt).getTime() - now <= 10 * 60_000;
  const canMove = !!b.rescheduleBy && new Date(b.rescheduleBy).getTime() > now;
  const moved = useCallback(() => { setMoving(false); onChange(); }, [onChange]);
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line transition-shadow hover:shadow-[0_12px_32px_-20px_rgba(17,17,17,0.35)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} />
        <div className="flex flex-wrap items-center gap-2">
          {b.meetingLink && <a href={b.meetingLink} target="_blank" rel="noreferrer" className={`rounded-full px-5 py-2.5 text-sm font-medium ${soon ? "bg-forest text-white" : "bg-ink text-white"}`}>{soon ? "Join now" : "Session page"}</a>}
          {canMove && <Button size="sm" variant="secondary" onClick={() => setMoving(true)}>Reschedule</Button>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Badge tone="forest">Confirmed</Badge><Badge>{formatMoney(b.priceMinor, b.currency)} paid</Badge>{!!b.rescheduleCount && <Badge tone="brass">Rescheduled</Badge>}
        {b.rescheduleBy && (
          <span className="ml-auto text-xs text-ink-soft">
            {canMove ? <>Reschedule until {fmtDayShort(b.rescheduleBy)}, {fmtTime(b.rescheduleBy)}</> : "Rescheduling closed (less than 2 days to go)"}
          </span>
        )}
      </div>
      {moving && <RescheduleDialog b={b} onClose={() => setMoving(false)} onDone={moved} />}
    </div>
  );
}

function PendingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const { busy, error, run } = useAction(onChange);
  const [paying, setPaying] = useState(false);
  const paid = useCallback(() => { setPaying(false); onChange(); }, [onChange]);
  return (
    <div className="rounded-3xl border-l-4 border-brass bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => setPaying(true)}>Pay {formatMoney(b.priceMinor, b.currency)}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/bookings/${b.reference}/cancel`, { body: {} }))}>Release slot</Button>
        </div>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">Held until {b.holdExpiresAt ? fmtTime(b.holdExpiresAt) : "—"}. The slot is released if payment isn&rsquo;t completed.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {paying && <CheckoutDialog reference={b.reference} title={`Session with ${b.mentor.name}`} subtitle={`${fmtDay(b.startAt)} · ${fmtTime(b.startAt)}`} onClose={() => setPaying(false)} onPaid={paid} />}
    </div>
  );
}

function PastCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const { busy, error, run } = useAction(onChange);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const tone = b.status === "COMPLETED" ? "forest" : b.status === "CANCELLED" || b.status === "NO_SHOW" ? "rust" : "neutral";
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{STATUS_LABEL[b.status]}</Badge>
          {b.status === "COMPLETED" && !b.review && !reviewing && <Button size="sm" onClick={() => setReviewing(true)}>Leave feedback</Button>}
          <Button href={`/mentors/${b.mentor.slug}`} size="sm" variant="secondary">Book again</Button>
        </div>
      </div>
      {b.cancelReason && <p className="mt-3 text-xs text-ink-soft">{b.cancelReason}</p>}
      {b.review && (
        <div className="mt-4 rounded-2xl bg-paper-dim px-4 py-3 text-sm text-ink-soft">
          <span className="mr-2 text-brass">{"★".repeat(b.review.rating)}<span className="text-line">{"★".repeat(5 - b.review.rating)}</span></span>&ldquo;{b.review.comment}&rdquo;
        </div>
      )}
      {reviewing && (
        <div className="mt-4 space-y-3 rounded-2xl bg-paper-dim p-4">
          <p className="text-sm font-medium text-ink">How was your session with {b.mentor.name.split(" ")[0]}?</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className={`text-3xl leading-none transition-transform hover:scale-110 ${n <= rating ? "text-brass" : "text-line"}`}>★</button>)}
          </div>
          <textarea className="input min-h-24" maxLength={1000} placeholder="What was useful? What will you do next?" value={comment} onChange={(e) => setComment(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !rating || comment.trim().length < 5} onClick={() => run(() => api(`/bookings/${b.reference}/review`, { body: { rating, comment } }))}>{busy ? <Spinner /> : "Submit feedback"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setReviewing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
