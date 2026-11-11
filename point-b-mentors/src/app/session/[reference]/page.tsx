"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Container, Skeleton } from "@/components/ui";
import { CallFrame } from "@/components/call-frame";
import { FeedbackForm, SubmittedFeedback } from "@/components/feedback";
import type { Booking } from "@/lib/types";
import { api, errMsg } from "@/lib/api";
import { useAuth, HOME_BY_ROLE } from "@/lib/auth";
import { fmtDay, fmtTime } from "@/lib/format";
import { ReportMissing } from "@/components/report-missing";

type CallState = "not_confirmed" | "ended" | "too_early" | "waiting_for_host" | "ready";
interface CallInfo {
  state: CallState; reference: string; mentorName: string; startAt: string; endAt: string; sessionKind: "ONE_TO_ONE" | "GROUP";
  url?: string; token?: string; isHost?: boolean; canReportMissing?: boolean; mentorReport?: string | null;
}

export default function SessionPage() {
  const { reference } = useParams<{ reference: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(`/session/${reference}`)}`);
  }, [loading, user, reference, router]);

  if (loading || !user) return <Container className="py-12"><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-72 w-full" /></Container>;
  return <Room reference={reference} home={HOME_BY_ROLE[user.role]} isStudent={user.role === "STUDENT"} />;
}

function Room({ reference, home, isStudent }: { reference: string; home: string; isStudent: boolean }) {
  const [info, setInfo] = useState<CallInfo | null>(null);
  const [left, setLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = info?.state === "ready";

  const check = useCallback(async () => {
    try {
      const next = await api<CallInfo>(`/bookings/${reference}/call`);
      // Every "ready" response carries a fresh single-use token; keep the first so the call is never rebuilt.
      setInfo((cur) => (cur?.state === "ready" ? cur : next));
      setError(null);
    } catch (e) { setError(errMsg(e)); }
  }, [reference]);

  // Re-check while waiting: for the session window to open, or for the mentor to arrive.
  useEffect(() => {
    if (ready) return;
    check();
    const t = setInterval(() => { if (!document.hidden) check(); }, 5000);
    return () => clearInterval(t);
  }, [check, ready]);

  if (error && !info) return <Shell home={home}><Alert>{error}</Alert></Shell>;
  if (!info) return <Shell home={home}><Skeleton className="h-72 w-full" /></Shell>;

  if (left && isStudent) return <Shell home={home}><FeedbackPanel reference={reference} mentorName={info.mentorName} home={home} /></Shell>;
  if (info.state === "ready" && info.url && info.token) {
    return <CallFrame url={info.url} token={info.token} title={<><span className="font-medium">{info.sessionKind === "GROUP" ? "Group session" : "1:1 session"}</span> with {info.mentorName} · {fmtTime(info.startAt)}–{fmtTime(info.endAt)}</>} note={info.isHost ? "You're the host: you can mute, remove and end the call." : "Your mentor is in the room."} onLeave={() => { if (isStudent) setLeft(true); else window.location.href = home; }} />;
  }

  const when = `${fmtDay(info.startAt)} · ${fmtTime(info.startAt)}–${fmtTime(info.endAt)}`;
  const copy: Record<Exclude<CallState, "ready">, { title: string; body: string }> = {
    too_early: { title: "Your session hasn't opened yet", body: "The room opens 10 minutes before the start time. This page checks automatically, so you can leave it open." },
    waiting_for_host: { title: `Waiting for ${info.mentorName.split(" ")[0]} to join`, body: "You'll be let in as soon as your mentor arrives. This page checks automatically." },
    ended: { title: "This session has ended", body: "The room is closed. You can find your session and leave a rating on your dashboard." },
    not_confirmed: { title: "This booking isn't confirmed", body: "A call is only available for paid, confirmed sessions." },
  };
  const c = copy[info.state as Exclude<CallState, "ready">];
  return (
    <Shell home={home}>
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-8 text-center">
        {(info.state === "too_early" || info.state === "waiting_for_host") && <span className="mx-auto mb-5 block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
        <h1 className="font-display text-2xl text-ink">{c.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{info.mentorName} · {when}</p>
        <p className="mt-4 text-sm text-ink-soft">{c.body}</p>
        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        {isStudent && info.canReportMissing && (
          <div className="mt-5 flex justify-center border-t border-line pt-5">
            <ReportMissing reference={reference} mentorName={info.mentorName} onDone={check} label={`${info.mentorName.split(" ")[0]} hasn't joined`} />
          </div>
        )}
        {isStudent && info.mentorReport === "PENDING" && <p className="mt-5 rounded-2xl bg-lemon/60 px-4 py-3 text-sm text-ink">Thanks, we&rsquo;ve received your report and will email you the outcome.{info.state === "waiting_for_host" ? ` You can stay on this page in case ${info.mentorName.split(" ")[0]} arrives.` : ""}</p>}
        <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>
      </div>
      {info.state === "ended" && isStudent && <div className="mx-auto mt-6 max-w-lg"><FeedbackPanel reference={reference} mentorName={info.mentorName} home={home} bare /></div>}
    </Shell>
  );
}

/** Shown to the student the moment the call ends: rate the session while it is fresh. */
function FeedbackPanel({ reference, mentorName, home, bare }: { reference: string; mentorName: string; home: string; bare?: boolean }) {
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [tick, setTick] = useState(0);
  const load = () => setTick((n) => n + 1);
  useEffect(() => {
    let alive = true;
    api<Booking>(`/bookings/${reference}`).then((r) => { if (alive) setB(r); }).catch((e) => { if (alive) setError(errMsg(e)); });
    return () => { alive = false; };
  }, [reference, tick]);
  const body = error ? <Alert>{error}</Alert> : !b ? <Skeleton className="h-40 w-full" /> : b.review ? (
    <div className="space-y-3">
      {sent && <p className="text-sm text-ink">Thank you, your feedback is in.</p>}
      <SubmittedFeedback review={b.review} />
    </div>
  ) : b.canReview ? <FeedbackForm b={b} onDone={() => { setSent(true); load(); }} /> : <p className="text-sm text-ink-soft">Feedback opens once your session has finished.</p>;
  if (bare) return <div className="rounded-3xl border border-line bg-white p-6 sm:p-8"><h2 className="font-display text-xl text-ink">Leave feedback</h2><div className="mt-4">{body}</div></div>;
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-6 sm:p-8">
      <h1 className="font-display text-3xl text-ink">How did it go?</h1>
      <p className="mt-2 text-sm text-ink-soft">Your session with {mentorName} has finished. A minute of feedback helps your mentor, and others choosing who to talk to.</p>
      <div className="mt-5">{body}</div>
      <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>
    </div>
  );
}

function Shell({ home, children }: { home: string; children: React.ReactNode }) {
  return <Container className="py-12 sm:py-16"><p className="mb-6 text-sm"><Link href={home} className="text-ink-soft underline underline-offset-4">← Dashboard</Link></p>{children}</Container>;
}
