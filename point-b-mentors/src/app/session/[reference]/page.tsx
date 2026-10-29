"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Container, Skeleton } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useAuth, HOME_BY_ROLE } from "@/lib/auth";
import { fmtDay, fmtTime } from "@/lib/format";

type CallState = "not_confirmed" | "ended" | "too_early" | "waiting_for_host" | "ready";
interface CallInfo {
  state: CallState; reference: string; mentorName: string; startAt: string; endAt: string; sessionKind: "ONE_TO_ONE" | "GROUP";
  url?: string; token?: string; isHost?: boolean;
}

export default function SessionPage() {
  const { reference } = useParams<{ reference: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(`/session/${reference}`)}`);
  }, [loading, user, reference, router]);

  if (loading || !user) return <Container className="py-12"><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-72 w-full" /></Container>;
  return <Room reference={reference} home={HOME_BY_ROLE[user.role]} />;
}

function Room({ reference, home }: { reference: string; home: string }) {
  const [info, setInfo] = useState<CallInfo | null>(null);
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

  if (info.state === "ready" && info.url && info.token) {
    return <CallFrame info={info} onLeave={() => { window.location.href = home; }} />;
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
        <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>
      </div>
    </Shell>
  );
}

function CallFrame({ info, onLeave }: { info: CallInfo; onLeave: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const leave = useRef(onLeave);
  leave.current = onLeave;

  useEffect(() => {
    let frame: import("@daily-co/daily-js").DailyCall | null = null;
    let cancelled = false;
    (async () => {
      try {
        const Daily = (await import("@daily-co/daily-js")).default;
        if (cancelled || !box.current) return;
        // Dev StrictMode mounts twice and Daily allows one call object per page: clear any leftover first.
        const stale = Daily.getCallInstance();
        if (stale) await stale.destroy();
        if (cancelled || !box.current) return;
        frame = Daily.createFrame(box.current, {
          iframeStyle: { width: "100%", height: "100%", border: "0", borderRadius: "16px" },
          showLeaveButton: true,
          showFullscreenButton: true,
        });
        let failed = false;
        // A failed join also emits left-meeting; only a deliberate leave should return to the dashboard.
        frame.on("left-meeting", () => { if (!cancelled && !failed) leave.current(); });
        frame.on("error", (e) => { failed = true; console.error("[daily]", e); setError(callError(e?.errorMsg)); });
        await frame.join({ url: info.url!, token: info.token! });
      } catch (e) {
        if (!cancelled) setError(callError((e as { errorMsg?: string })?.errorMsg) );
      }
    })();
    return () => {
      // Flag first so tearing the frame down is not mistaken for the user leaving.
      cancelled = true;
      frame?.destroy().catch(() => undefined);
    };
    // The join credentials are fixed for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-ink/95 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-paper">
        <p className="text-sm"><span className="font-medium">{info.sessionKind === "GROUP" ? "Group session" : "1:1 session"}</span> with {info.mentorName} · {fmtTime(info.startAt)}–{fmtTime(info.endAt)}</p>
        <p className="text-xs text-paper/60">{info.isHost ? "You're the host: you can mute, remove and end the call." : "Your mentor is in the room."}</p>
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div ref={box} className="min-h-0 flex-1" />
    </div>
  );
}

function callError(code?: string) {
  if (code === "account-missing-payment-method") return "Video calling isn't available yet: the platform's video account needs a payment method added. Please contact support.";
  return code ? `The call could not start (${code}). Please try again or contact support.` : "The call hit a problem. Please try again.";
}

function Shell({ home, children }: { home: string; children: React.ReactNode }) {
  return <Container className="py-12 sm:py-16"><p className="mb-6 text-sm"><Link href={home} className="text-ink-soft underline underline-offset-4">← Dashboard</Link></p>{children}</Container>;
}
