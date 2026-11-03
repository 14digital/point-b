"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CallFrame } from "@/components/call-frame";
import { Alert, Button, Container, Skeleton } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useAuth, HOME_BY_ROLE } from "@/lib/auth";
import { fmtDay, fmtTime } from "@/lib/format";

type State = "not_scheduled" | "too_early" | "waiting_for_host" | "ended" | "ready";
interface Info { state: State; applicantName?: string; startAt?: string; endAt?: string; isHost?: boolean; url?: string; token?: string }

export default function InterviewPage() {
  return <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full" /></Container>}><Room /></Suspense>;
}

function Room() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("t");
  const { user, loading } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const ready = info?.state === "ready";
  const home = user ? HOME_BY_ROLE[user.role] : "/";
  // Admins and signed-in applicants are identified by their session; everyone else needs the private link.
  const canAsk = !loading && (!!token || !!user);

  const check = useCallback(async () => {
    try {
      const next = await api<Info>(`/applications/${id}/interview-call${token ? `?token=${encodeURIComponent(token)}` : ""}`);
      // A "ready" response carries a fresh single-use token; keep the first so the call is never rebuilt.
      setInfo((cur) => (cur?.state === "ready" ? cur : next));
      setError(null);
    } catch (e) { setError(errMsg(e)); }
  }, [id, token]);

  useEffect(() => {
    if (!canAsk || ready) return;
    const first = setTimeout(check, 0);
    const t = setInterval(() => { if (!document.hidden) check(); }, 5000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [check, canAsk, ready]);

  if (loading) return <Container className="py-12"><Skeleton className="h-72 w-full" /></Container>;
  if (!token && !user) return <Wrap home={home}><Alert tone="info">Open the interview link from your email, or <Link href={`/sign-in?next=${encodeURIComponent(`/interview/${id}`)}`} className="underline">sign in</Link>.</Alert></Wrap>;
  if (error && !info) return <Wrap home={home}><Alert>{error}</Alert></Wrap>;
  if (!info) return <Wrap home={home}><Skeleton className="h-72 w-full" /></Wrap>;

  if (left) return <Wrap home={home}><Box title="Thank you" body="The interview has finished. Our team will be in touch about next steps." home={home} user={!!user} /></Wrap>;
  if (info.state === "ready" && info.url && info.token) {
    return <CallFrame url={info.url} token={info.token} title={<><span className="font-medium">POINT B mentor interview</span> · {info.applicantName} · {fmtTime(info.startAt!)}–{fmtTime(info.endAt!)}</>} note={info.isHost ? "You're the host: you can mute, remove and end the call." : "Our team will be with you shortly."} onLeave={() => setLeft(true)} />;
  }

  const when = info.startAt ? `${fmtDay(info.startAt)} · ${fmtTime(info.startAt)}–${fmtTime(info.endAt!)}` : "";
  const copy: Record<Exclude<State, "ready">, { title: string; body: string }> = {
    too_early: { title: "Your interview hasn't opened yet", body: "The room opens 10 minutes before the start time. This page checks automatically, so you can leave it open." },
    waiting_for_host: { title: "Waiting for the POINT B team", body: "You'll be let in as soon as your interviewer arrives. This page checks automatically." },
    ended: { title: "This interview has ended", body: "The room is closed. If you missed it, reply to your interview email and we will arrange another time." },
    not_scheduled: { title: "No interview is scheduled", body: "This interview was cancelled or moved. Check your latest email for the new link." },
  };
  const c = copy[info.state as Exclude<State, "ready">];
  const waiting = info.state === "too_early" || info.state === "waiting_for_host";
  return <Wrap home={home}><Box title={c.title} body={c.body} sub={info.applicantName ? `${info.applicantName} · ${when}` : undefined} spin={waiting} home={home} user={!!user} />{error && <div className="mx-auto mt-4 max-w-lg"><Alert>{error}</Alert></div>}</Wrap>;
}

function Box({ title, body, sub, spin, home, user }: { title: string; body: string; sub?: string; spin?: boolean; home: string; user: boolean }) {
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-8 text-center">
      {spin && <span className="mx-auto mb-5 block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
      <h1 className="font-display text-2xl text-ink">{title}</h1>
      {sub && <p className="mt-2 text-sm text-ink-soft">{sub}</p>}
      <p className="mt-4 text-sm text-ink-soft">{body}</p>
      {user && <Link href={home}><Button variant="secondary" className="mt-6">Back to dashboard</Button></Link>}
    </div>
  );
}

function Wrap({ home, children }: { home: string; children: React.ReactNode }) {
  return <Container className="py-12 sm:py-16">{home !== "/" && <p className="mb-6 text-sm"><Link href={home} className="text-ink-soft underline underline-offset-4">← Dashboard</Link></p>}{children}</Container>;
}
