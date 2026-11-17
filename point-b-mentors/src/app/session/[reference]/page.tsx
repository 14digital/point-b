"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  course?: { title: string; classNumber: number; sessionsCount: number } | null;
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

  if (left && isStudent) {
    return (
      <Shell home={home}>
        <FeedbackPanel
          reference={reference}
          mentorName={info.mentorName}
          home={home}
          callCourse={info.course}
          leftMidCall
        />
      </Shell>
    );
  }
  if (info.state === "ready" && info.url && info.token) {
    const title = info.course
      ? <><span className="font-medium">{info.course.title}</span> · Class {info.course.classNumber} of {info.course.sessionsCount} · {fmtTime(info.startAt)}–{fmtTime(info.endAt)}</>
      : <><span className="font-medium">{info.sessionKind === "GROUP" ? "Group session" : "1:1 session"}</span> with {info.mentorName} · {fmtTime(info.startAt)}–{fmtTime(info.endAt)}</>;
    return <CallFrame url={info.url} token={info.token} title={title} note={info.isHost ? "You're the host: you can mute, remove and end the call." : "Your mentor is in the room."} onLeave={() => { if (isStudent) setLeft(true); else window.location.href = home; }} />;
  }

  const when = `${fmtDay(info.startAt)} · ${fmtTime(info.startAt)}–${fmtTime(info.endAt)}`;
  const copy: Record<Exclude<CallState, "ready">, { title: string; body: string }> = {
    too_early: { title: "Your session hasn't opened yet", body: "The room opens 10 minutes before the start time. This page checks automatically, so you can leave it open." },
    waiting_for_host: { title: `Waiting for ${info.mentorName.split(" ")[0]} to join`, body: "You'll be let in as soon as your mentor arrives. This page checks automatically." },
    ended: { title: info.course ? "This class has ended" : "This session has ended", body: info.course ? "The room is closed. If this was the final class, you can leave feedback below." : "The room is closed. You can leave a rating below." },
    not_confirmed: { title: "This booking isn't confirmed", body: "A call is only available for paid, confirmed sessions." },
  };
  const c = copy[info.state as Exclude<CallState, "ready">];
  return (
    <Shell home={home}>
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-8 text-center shadow-[0_24px_60px_-48px_rgba(17,17,17,0.45)]">
        {(info.state === "too_early" || info.state === "waiting_for_host") && <span className="mx-auto mb-5 block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
        <h1 className="font-display text-2xl text-ink">{c.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{info.course ? `${info.course.title} · Class ${info.course.classNumber} of ${info.course.sessionsCount}` : info.mentorName} · {when}</p>
        <p className="mt-4 text-sm text-ink-soft">{c.body}</p>
        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        {isStudent && info.canReportMissing && (
          <div className="mt-5 flex justify-center border-t border-line pt-5">
            <ReportMissing reference={reference} mentorName={info.mentorName} onDone={check} label={`${info.mentorName.split(" ")[0]} hasn't joined`} />
          </div>
        )}
        {isStudent && info.mentorReport === "PENDING" && <p className="mt-5 rounded-2xl bg-lemon/60 px-4 py-3 text-sm text-ink">Thanks, we&rsquo;ve received your report and will email you the outcome.{info.state === "waiting_for_host" ? ` You can stay on this page in case ${info.mentorName.split(" ")[0]} arrives.` : ""}</p>}
        {info.state !== "ended" && <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>}
      </div>
      {info.state === "ended" && isStudent && (
        <div className="mx-auto mt-6 max-w-lg">
          <FeedbackPanel reference={reference} mentorName={info.mentorName} home={home} callCourse={info.course} bare />
        </div>
      )}
    </Shell>
  );
}

/** Shown to the student after leaving or when a class/session has ended. Form only when eligible. */
function FeedbackPanel({ reference, mentorName, home, bare, callCourse, leftMidCall }: {
  reference: string; mentorName: string; home: string; bare?: boolean;
  callCourse?: CallInfo["course"]; leftMidCall?: boolean;
}) {
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

  const course = b?.course;
  const midCourse = !!course && !b?.canReview && b.status !== "COMPLETED" && !!(course.nextClass || (course.liveClass && course.classes.some((k) => !k.completedAt && new Date(k.endAt).getTime() > Date.now())));
  const finalDone = !!b && (b.canReview || b.status === "COMPLETED" || (!!course && new Date(course.endsAt).getTime() <= Date.now()));
  const classLabel = callCourse
    ? `Class ${callCourse.classNumber} of ${callCourse.sessionsCount}`
    : course?.liveClass
      ? `Class ${course.liveClass.number} of ${course.sessionsCount}`
      : null;

  let headline = "How did it go?";
  let lead = `Your session with ${mentorName} has finished. A minute of feedback helps your mentor, and others choosing who to talk to.`;
  if (course) {
    if (b?.canReview || (finalDone && !midCourse)) {
      headline = "How was the course?";
      lead = `Your course with ${mentorName} has finished. One short review helps us plan the next season.`;
    } else if (midCourse || leftMidCall) {
      headline = "Thanks for joining";
      const next = course.nextClass;
      lead = next
        ? `${classLabel ? `${classLabel} is done for today. ` : ""}Feedback opens after the final class on ${fmtDay(course.endsAt)}. Next up: ${fmtDay(next.startAt)} at ${fmtTime(next.startAt)}.`
        : `${classLabel ? `${classLabel} wrapped up. ` : ""}Feedback opens once the final class has finished.`;
    } else {
      headline = "Leave feedback";
      lead = `When the final class has finished, you can rate ${course.title} here.`;
    }
  }

  const body = error ? <Alert>{error}</Alert> : !b ? <Skeleton className="h-40 w-full" /> : b.review ? (
    <div className="space-y-3">
      {sent && <p className="text-sm font-medium text-ink">Thank you — your feedback is in.</p>}
      <SubmittedFeedback review={b.review} />
    </div>
  ) : b.canReview ? (
    <FeedbackForm b={b} onDone={() => { setSent(true); load(); }} />
  ) : (
    <div className="rounded-2xl bg-paper-dim px-4 py-4 text-sm text-ink-soft ring-1 ring-line/70">
      <p className="font-medium text-ink">{course ? "Feedback isn’t open yet" : "Feedback isn’t open yet"}</p>
      <p className="mt-1">
        {course
          ? `End-of-course feedback opens after the final class${course.endsAt ? ` (${fmtDay(course.endsAt)})` : ""}. You’ll find the form here and on your dashboard.`
          : "Feedback opens once your session has finished."}
      </p>
    </div>
  );

  if (bare) {
    return (
      <div className="rounded-3xl border border-line bg-white p-6 shadow-[0_24px_60px_-48px_rgba(17,17,17,0.4)] sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">Feedback</p>
        <h2 className="mt-2 font-display text-2xl text-ink">{headline}</h2>
        <p className="mt-2 text-sm text-ink-soft">{lead}</p>
        <div className="mt-5">{body}</div>
        <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-line bg-white shadow-[0_24px_60px_-48px_rgba(17,17,17,0.4)]">
      <div className="bg-gradient-to-br from-mint/50 via-white to-sky/30 px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">Feedback</p>
        <h1 className="mt-2 font-display text-3xl text-ink">{headline}</h1>
        <p className="mt-2 text-sm text-ink-soft">{lead}</p>
      </div>
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="mt-1">{body}</div>
        <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>
      </div>
    </div>
  );
}

function Shell({ home, children }: { home: string; children: React.ReactNode }) {
  return <Container className="py-12 sm:py-16"><p className="mb-6 text-sm"><Link href={home} className="text-ink-soft underline underline-offset-4">← Dashboard</Link></p>{children}</Container>;
}
