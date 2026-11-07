"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Skeleton, Spinner } from "@/components/ui";
import { FinanceModal } from "@/components/finance-modal";
import { useToast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDay, fmtTime } from "@/lib/format";
import { SUPPORT_TOPICS } from "@/lib/support";
import { useApi } from "@/lib/use-api";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED";
interface Row { id: string; number: string; topic: string; status: Status; createdAt: string; updatedAt: string; preview: string; replied: boolean }
interface Thread {
  id: string; number: string; topic: string; status: Status; urgent: boolean; createdAt: string; message: string; name: string;
  events: { id: string; kind: "REPLY" | "MESSAGE" | "STATUS"; body: string; by: string; createdAt: string }[];
}

const when = (iso: string) => `${fmtDay(iso).replace(/^\w+, /, "")}, ${fmtTime(iso)}`;

function StatusBadge({ row }: { row: Pick<Row, "status" | "replied"> }) {
  const [label, tone] = row.status === "RESOLVED" ? ["Resolved", "bg-mint text-forest"]
    : row.replied ? ["New reply", "bg-ink text-white"]
    : row.status === "IN_PROGRESS" ? ["In progress", "bg-sky text-ink"] : ["Received", "bg-lemon text-ink"];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${tone}`}>{label}</span>;
}

/**
 * The signed-in student's or mentor's support requests: start a new one, follow each conversation with the POINT B
 * team and write back. `compact` is the sidebar card on the student dashboard; otherwise it fills a dashboard tab.
 */
export function MySupport({ compact = false, newRequest, onNewRequestClose }: { compact?: boolean; newRequest?: boolean; onNewRequestClose?: () => void }) {
  const list = useApi<Row[]>("/support/mine");
  const rows = list.data ?? [];
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("request")));
  const [composing, setComposing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const active = rows.filter((r) => r.status !== "RESOLVED").length;
  const shown = compact && !showAll ? rows.slice(0, 3) : rows;
  const writing = composing || !!newRequest;
  const closeNew = () => { setComposing(false); onNewRequestClose?.(); };

  function openThread(id: string | null) {
    setOpen(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("request", id); else url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
  }

  return (
    <section className={`rounded-3xl bg-white ring-1 ring-line ${compact ? "p-6" : "p-6 sm:p-7"}`} aria-labelledby="support-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="support-title" className="font-display text-2xl text-ink">{compact ? "Support" : "Your support requests"}</h2>
          <p className="mt-1 text-sm text-ink-soft">{list.loading ? " " : active ? `${active} open request${active === 1 ? "" : "s"}` : rows.length ? "Nothing open right now" : "Questions about a booking, payment or anything else."}</p>
        </div>
        <Button size="sm" className="shrink-0 whitespace-nowrap" variant={compact ? "secondary" : "primary"} onClick={() => setComposing(true)}>New request</Button>
      </div>

      <div className="mt-5">
        {list.loading ? <Skeleton className="h-24 rounded-2xl" /> : list.error ? <Alert>{list.error}</Alert> : !rows.length ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-7 text-center">
            <p className="text-sm font-medium text-ink">No requests yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">When you contact POINT B, your request and our replies appear here.</p>
          </div>
        ) : (
          <ul className="-mx-2 divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => openThread(r.id)} className="flex w-full items-start gap-3 rounded-2xl px-2 py-3.5 text-left transition-colors hover:bg-paper/70">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className={`truncate text-sm ${r.replied ? "font-semibold" : "font-medium"} text-ink`}>{r.topic}</span>
                      <StatusBadge row={r} />
                    </span>
                    <span className="mt-1 block truncate text-sm text-ink-soft">{r.preview}</span>
                    <span className="mt-1 block text-xs text-ink-soft"><span className="font-mono">{r.number}</span> · updated {when(r.updatedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {compact && rows.length > 3 && <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-medium text-ink underline-offset-4 hover:underline">{showAll ? "Show fewer" : `Show all ${rows.length}`}</button>}
      </div>

      {open && <ThreadModal id={open} onClose={() => openThread(null)} onChanged={list.reload} />}
      {writing && <NewRequestModal onClose={closeNew} onSent={(id) => { closeNew(); list.reload(); if (id) openThread(id); }} />}
    </section>
  );
}

function ThreadModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const t = useApi<Thread>(`/support/mine/${id}`);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const d = t.data;
  const thread = useRef<HTMLOListElement>(null);
  // Open on the newest message, and follow the conversation as it grows.
  const count = d?.events.length ?? 0;
  useEffect(() => { thread.current?.lastElementChild?.scrollIntoView({ block: "end" }); }, [count]);

  async function send() {
    setBusy(true);
    try {
      t.setData(await api<Thread>(`/support/mine/${id}/messages`, { body: { body: text.trim() } }));
      setText(""); onChanged();
      toast(d?.status === "RESOLVED" ? "Sent. We’ve reopened your request." : "Sent to the POINT B team.");
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }

  return (
    <FinanceModal label="Support request" eyebrow={d ? `Support · ${d.number}` : "Support"} onClose={onClose} wide
      title={d ? <span className="flex flex-wrap items-center gap-3"><span className="font-display text-2xl leading-tight text-ink">{d.topic}</span><StatusBadge row={{ status: d.status, replied: d.events.at(-1)?.kind === "REPLY" && d.status !== "RESOLVED" }} /></span> : "Loading…"}
      footer={d && (
        <div className="space-y-2">
          <textarea className="input min-h-24" value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} aria-label="Your reply"
            placeholder={d.status === "RESOLVED" ? "Still need help? Write here and we’ll reopen this request." : "Write to the POINT B team…"} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">We reply here and by email, usually within two working days.</p>
            <Button size="sm" className="ml-auto" disabled={busy || text.trim().length < 2} onClick={send}>{busy ? <Spinner /> : d.status === "RESOLVED" ? "Send and reopen" : "Send"}</Button>
          </div>
        </div>
      )}>
      {t.loading && !d ? <Skeleton className="h-48 rounded-2xl" /> : t.error || !d ? <Alert>{t.error ?? "Request not found"}</Alert> : (
        <ol ref={thread} className="space-y-4">
          <Message who="You" at={d.createdAt} mine>{d.message}</Message>
          {d.events.map((e) => e.kind === "STATUS"
            ? <li key={e.id} className="flex items-center gap-3 text-xs text-ink-soft"><span className="h-px flex-1 bg-line" />{e.body === "RESOLVED" ? "Marked resolved" : e.body === "OPEN" ? "Reopened" : "Our team is looking into it"} · {when(e.createdAt)}<span className="h-px flex-1 bg-line" /></li>
            : <Message key={e.id} who={e.kind === "MESSAGE" ? "You" : `${e.by}, POINT B`} at={e.createdAt} mine={e.kind === "MESSAGE"}>{e.body}</Message>)}
          {d.status !== "RESOLVED" && d.events.every((e) => e.kind !== "REPLY") && (
            <li className="rounded-2xl bg-paper px-4 py-3 text-sm text-ink-soft">{d.urgent ? "Safeguarding reports are treated as urgent. A member of the team will be in touch as soon as possible." : "Thanks, we’ve got your request. A member of the POINT B team will reply here and by email."}</li>
          )}
        </ol>
      )}
    </FinanceModal>
  );
}

function Message({ who, at, mine, children }: { who: string; at: string; mine?: boolean; children: string }) {
  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-paper text-ink ring-1 ring-line"}`}>
        <p className={`mb-1 text-[11px] ${mine ? "text-white/65" : "text-ink-soft"}`}>{who} · {when(at)}</p>
        <p className="whitespace-pre-line leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

function NewRequestModal({ onClose, onSent }: { onClose: () => void; onSent: (id: string | null) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const topics = SUPPORT_TOPICS.filter((t) => user?.role !== "MENTOR" || t.value !== "Becoming a mentor");
  const [topic, setTopic] = useState(topics[0].value);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user) return;
    setBusy(true);
    try {
      const res = await api<{ reference: string | null }>("/contact", { body: { name: user.name, email: user.email, topic, message: message.trim() } });
      toast(res.reference ? `Request ${res.reference} sent.` : "Request sent.");
      const mine = res.reference ? (await api<Row[]>("/support/mine")).find((r) => r.number === res.reference) : null;
      onSent(mine?.id ?? null);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <FinanceModal label="New support request" eyebrow="Support" title={<span className="font-display text-2xl leading-tight text-ink">How can we help?</span>} onClose={onClose}
      footer={<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-soft">We’ll reply here and to {user?.email}.</p><Button size="sm" className="ml-auto" disabled={busy || message.trim().length < 10} onClick={submit}>{busy ? <Spinner /> : "Send request"}</Button></div>}>
      <div>
        <p className="mb-2 text-sm font-medium text-ink">What is it about?</p>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <button key={t.value} type="button" aria-pressed={topic === t.value} onClick={() => { setTopic(t.value); setError(null); }}
              className={`inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors ${topic === t.value ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30 hover:bg-paper/60"}`}>{t.label}</button>
          ))}
        </div>
        {topic === "A safeguarding concern" && <p className="mt-3 rounded-2xl bg-rust-pale px-4 py-3 text-sm text-ink">Safeguarding reports go straight to the top of our queue. If someone is in immediate danger, contact the emergency services first.</p>}
      </div>
      <div>
        <label htmlFor="support-message" className="mb-2 block text-sm font-medium text-ink">Your message</label>
        <textarea id="support-message" className="input min-h-36" value={message} maxLength={3000} onChange={(e) => { setMessage(e.target.value); setError(null); }}
          placeholder="Tell us what happened. Include a booking reference (PBM-…) if it’s about a session." />
        <p className="mt-1 text-right text-xs text-ink-soft tabular-nums">{message.trim().length < 10 ? `${10 - message.trim().length} more characters` : `${message.length} / 3000`}</p>
      </div>
      {error && <Alert>{error}</Alert>}
    </FinanceModal>
  );
}
