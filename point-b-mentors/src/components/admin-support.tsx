"use client";

import { useMemo, useState } from "react";
import { Alert, Button, EmptyState, FilterChips, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { fmtDay, fmtTime, initials } from "@/lib/format";
import { useApi, useNow } from "@/lib/use-api";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED";
interface TicketRow { id: string; number: string; name: string; email: string; topic: string; preview: string; urgent: boolean; status: Status; assignedName: string | null; createdAt: string; updatedAt: string; events: number; newReply?: boolean }
interface Ticket {
  id: string; number: string; name: string; email: string; topic: string; message: string; urgent: boolean; status: Status; assignedTo: string | null; assignedName: string | null; createdAt: string;
  events: { id: string; kind: "NOTE" | "REPLY" | "STATUS" | "ASSIGN" | "MESSAGE"; body: string; byName: string; createdAt: string }[];
  staff: { id: string; name: string }[];
  account: { id: string; role: string; name: string } | null;
}

const STATUS_LABEL: Record<Status, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };
const STATUS_TONE: Record<Status, string> = { OPEN: "bg-lemon text-ink", IN_PROGRESS: "bg-sky text-ink", RESOLVED: "bg-mint text-forest" };
const VIEWS = [["active", "Open"], ["urgent", "Safeguarding"], ["RESOLVED", "Resolved"], ["all", "All"]] as const;
type View = (typeof VIEWS)[number][0];

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

/** Contact-form messages as a shared inbox: safeguarding first, an owner for each, notes the requester never sees, and replies by email. */
export function Support({ meId, onChanged }: { meId: string; onChanged?: () => void }) {
  const list = useApi<TicketRow[]>("/admin/support");
  const now = useNow();
  const [view, setView] = useState<View>("active");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("ticket")));
  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((t) => {
      if (term && !`${t.number} ${t.name} ${t.email} ${t.topic} ${t.preview}`.toLowerCase().includes(term)) return false;
      if (view === "active") return t.status !== "RESOLVED";
      if (view === "urgent") return t.urgent;
      if (view === "RESOLVED") return t.status === "RESOLVED";
      return true;
    }).sort((a, b) => Number(b.urgent && b.status !== "RESOLVED") - Number(a.urgent && a.status !== "RESOLVED") || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [all, q, view]);
  const urgentOpen = all.filter((t) => t.urgent && t.status !== "RESOLVED").length;
  const selected = openId ?? rows[0]?.id ?? null;

  return (
    <div className="space-y-6">
      {urgentOpen > 0 && (
        <div className="flex items-center gap-4 rounded-3xl bg-rust-pale px-5 py-4 ring-1 ring-rust/20">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-rust"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 3l8 14H2L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v4M10 14.5v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
          <p className="min-w-0 flex-1 text-sm text-ink"><span className="font-medium text-rust">{urgentOpen} safeguarding report{urgentOpen === 1 ? "" : "s"} open.</span> These come first. Follow your safeguarding procedure and record every step as a note.</p>
          <Button size="sm" variant="secondary" onClick={() => setView("urgent")}>Show</Button>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl bg-white ring-1 ring-line lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Phones show the list, or one open message with a way back; wider screens show both side by side. */}
        <aside className={`border-b border-line lg:block lg:border-b-0 lg:border-r ${openId ? "hidden" : ""}`}>
          <div className="space-y-3 border-b border-line p-4">
            <div className="flex items-center justify-between"><h2 className="font-display text-2xl text-ink">Support</h2><span className="text-xs text-ink-soft">{all.filter((t) => t.status !== "RESOLVED").length} open</span></div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or SUP-…" aria-label="Search messages" />
            <FilterChips options={VIEWS} value={view} onChange={setView} counts={{ urgent: urgentOpen }} label="Filter messages" />
          </div>
          {list.loading ? <div className="p-4"><Skeleton className="h-40 rounded-2xl" /></div> : list.error ? <div className="p-4"><Alert>{list.error}</Alert></div> : !rows.length ? <div className="p-6"><EmptyState title="Inbox zero" description="Messages from the contact form land here." /></div> : (
            <ul className="max-h-[70dvh] divide-y divide-line overflow-y-auto">{rows.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setOpenId(t.id)} aria-current={selected === t.id} className={`w-full px-4 py-3.5 text-left transition-colors ${selected === t.id ? "bg-paper" : "hover:bg-paper/60"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">{t.urgent && <span className="h-2 w-2 shrink-0 rounded-full bg-rust" aria-label="Safeguarding" />}<span className={`truncate text-sm ${t.status === "OPEN" ? "font-semibold text-ink" : "text-ink"}`}>{t.name}</span></span>
                    <span className="shrink-0 text-[11px] text-ink-soft">{ago(t.updatedAt, now)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-medium text-ink">{t.topic}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-soft">{t.preview}</span>
                  <span className="mt-2 flex items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>{t.newReply && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-white">New reply</span>}{t.assignedName && <span className="truncate text-[11px] text-ink-soft">· {t.assignedName}</span>}</span>
                </button>
              </li>
            ))}</ul>
          )}
        </aside>
        <section className={`min-w-0 lg:block ${openId ? "" : "hidden"}`}>
          {openId && <button type="button" onClick={() => setOpenId(null)} className="flex w-full items-center gap-2 border-b border-line px-5 py-3 text-sm text-ink-soft transition-colors hover:text-ink lg:hidden"><span aria-hidden>←</span> All messages</button>}
          {selected ? <TicketView key={selected} id={selected} meId={meId} onChanged={() => { list.reload(); onChanged?.(); }} /> : <div className="p-10"><EmptyState title="Choose a message" description="Pick a message from the list to read and reply." /></div>}
        </section>
      </div>
    </div>
  );
}

function TicketView({ id, meId, onChanged }: { id: string; meId: string; onChanged: () => void }) {
  const toast = useToast();
  const d = useApi<Ticket>(`/admin/support/${id}`);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const t = d.data;

  async function run(key: string, fn: () => Promise<Ticket>, msg: string) {
    setBusy(key);
    try { d.setData(await fn()); onChanged(); toast(msg); if (key.startsWith("send") || key === "note") setText(""); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }
  const patch = (body: unknown) => api<Ticket>(`/admin/support/${id}`, { method: "PATCH", body });

  if (d.loading && !t) return <div className="p-6"><Skeleton className="h-72 rounded-2xl" /></div>;
  if (d.error || !t) return <div className="p-6"><Alert>{d.error}</Alert></div>;
  const first = t.name.split(" ")[0];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs"><span className="font-mono text-ink-soft">{t.number}</span>{t.urgent && <span className="rounded-full bg-rust px-2 py-0.5 font-medium text-white">Safeguarding</span>}</p>
          <h3 className="mt-1 font-display text-2xl leading-tight text-ink">{t.topic}</h3>
          <p className="mt-1 text-sm text-ink-soft">{t.name} · <a href={`mailto:${t.email}`} className="underline-offset-4 hover:underline">{t.email}</a>{t.account ? <> · {t.account.role === "STUDENT" ? <a href={`/admin?tab=students`} className="underline-offset-4 hover:underline">Student account</a> : t.account.role === "MENTOR" ? "Mentor account" : "Team member"}</> : " · No account"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input py-2 text-sm" style={{ width: "auto" }} value={t.assignedTo ?? ""} onChange={(e) => run("assign", () => patch({ assignedTo: e.target.value || null }), "Owner updated.")} aria-label="Assigned to">
            <option value="">Unassigned</option>
            {t.staff.map((s) => <option key={s.id} value={s.id}>{s.id === meId ? `${s.name} (me)` : s.name}</option>)}
          </select>
          <select className="input py-2 text-sm" style={{ width: "auto" }} value={t.status} onChange={(e) => run("status", () => patch({ status: e.target.value }), "Status updated.")} aria-label="Status">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </header>

      <ol className="flex-1 space-y-4 overflow-y-auto bg-paper/40 p-5 sm:p-6">
        <Bubble who={t.name} at={t.createdAt} tone="them">{t.message}</Bubble>
        {t.events.map((e) => e.kind === "MESSAGE" ? <Bubble key={e.id} who={t.name} at={e.createdAt} tone="them">{e.body}</Bubble>
          : e.kind === "REPLY" ? <Bubble key={e.id} who={e.byName} at={e.createdAt} tone="us">{e.body}</Bubble>
          : e.kind === "NOTE" ? <Bubble key={e.id} who={e.byName} at={e.createdAt} tone="note">{e.body}</Bubble>
          : <li key={e.id} className="text-center text-xs text-ink-soft">{e.byName} {e.kind === "STATUS" ? `marked this ${STATUS_LABEL[e.body as Status]?.toLowerCase() ?? e.body}` : e.body === "Unassigned" ? "unassigned it" : `assigned it to ${e.body}`} · {fmtTime(e.createdAt)}, {fmtDay(e.createdAt).replace(/^\w+, /, "")}</li>)}
      </ol>

      <div className="border-t border-line p-4 sm:p-5">
        <div className="mb-2 flex gap-1 rounded-full bg-paper p-1 text-xs" role="tablist">
          {([["reply", `Reply to ${first}`], ["note", "Internal note"]] as const).map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${mode === k ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}>{label}</button>)}
        </div>
        <textarea className={`input min-h-28 ${mode === "note" ? "bg-lemon/30" : ""}`} value={text} maxLength={6000} onChange={(e) => setText(e.target.value)}
          placeholder={mode === "reply" ? `Write to ${first}. It's emailed from the support address${t.account && t.account.role !== "ADMIN" ? " and shown in their dashboard" : ""}.` : "Only the team sees notes. Record calls, decisions and safeguarding steps here."} />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {mode === "reply" ? <>
            <Button size="sm" variant="secondary" disabled={!!busy || text.trim().length < 2} onClick={() => run("send", () => api<Ticket>(`/admin/support/${id}/reply`, { body: { body: text, resolve: false } }), `Reply emailed to ${first}.`)}>{busy === "send" ? <Spinner /> : "Send"}</Button>
            <Button size="sm" disabled={!!busy || text.trim().length < 2} onClick={() => run("send-resolve", () => api<Ticket>(`/admin/support/${id}/reply`, { body: { body: text, resolve: true } }), `Reply emailed and marked resolved.`)}>{busy === "send-resolve" ? <Spinner /> : "Send and resolve"}</Button>
          </> : <Button size="sm" disabled={!!busy || text.trim().length < 2} onClick={() => run("note", () => api<Ticket>(`/admin/support/${id}/notes`, { body: { body: text } }), "Note added.")}>{busy === "note" ? <Spinner /> : "Add note"}</Button>}
        </div>
      </div>
    </div>
  );
}

function Bubble({ who, at, tone, children }: { who: string; at: string; tone: "them" | "us" | "note"; children: string }) {
  const style = tone === "them" ? "bg-white ring-1 ring-line" : tone === "us" ? "bg-ink text-white" : "bg-lemon/60 ring-1 ring-brass/20";
  return (
    <li className={`flex gap-3 ${tone === "us" ? "flex-row-reverse" : ""}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-ink" style={{ backgroundColor: pastelFor(who) }}>{initials(who)}</span>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${style}`}>
        <p className={`mb-1 text-[11px] ${tone === "us" ? "text-white/70" : "text-ink-soft"}`}>{tone === "note" ? `Note by ${who}` : who} · {fmtTime(at)}, {fmtDay(at).replace(/^\w+, /, "")}</p>
        <p className="whitespace-pre-line leading-relaxed">{children}</p>
      </div>
    </li>
  );
}
