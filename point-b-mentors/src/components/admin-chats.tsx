"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, EmptyState, FilterChips, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { countryFlag, countryName, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { playChime, setSoundMuted, soundMuted } from "@/lib/sound";

interface ChatSummary {
  id: string; userId: string | null; name: string | null; email: string | null; role: string | null; page: string | null;
  country: string | null; city: string | null; agentName: string | null; agentUntil: string | null; unreadByTeam: number;
  lastMessage: string | null; lastMessageAt: string; createdAt: string; messageCount: number; mode: "ai" | "agent";
}
interface ChatMessage { id: string; role: "user" | "assistant" | "agent"; content: string; agentName: string | null; createdAt: string }
type ChatDetail = ChatSummary & { messages: ChatMessage[] };

const FILTERS = [["all", "All"], ["unread", "Unread"], ["agent", "Team replying"], ["signed", "Signed in"]] as const;
type Filter = (typeof FILTERS)[number][0];

const WA_HEADER = "#008069";

const who = (c: Pick<ChatSummary, "name" | "city" | "country">) => c.name ?? `Visitor${c.city ? ` from ${c.city}` : c.country ? ` from ${countryName(c.country)}` : ""}`;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
const day = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

/**
 * Every conversation from the website chat bubble. The AI answers by default; anyone on the team can step in and
 * reply as POINT B. While they're replying the AI stays quiet, and it picks the chat up again 15 minutes after
 * their last message, or straight away when they hand it back.
 */
export function LiveChats({ onChanged }: { onChanged?: () => void }) {
  const list = useApi<ChatSummary[]>("/admin/chats");
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  // The inbox refreshes on its own, so new chats and replies appear as they happen.
  const { reload } = list;
  useEffect(() => { const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((c) => (filter === "unread" ? c.unreadByTeam > 0 : filter === "agent" ? c.mode === "agent" : filter === "signed" ? !!c.userId : true))
      .filter((c) => !term || [c.name, c.email, c.city, c.country && countryName(c.country), c.lastMessage].some((v) => v?.toLowerCase().includes(term)));
  }, [all, filter, q]);
  const unread = all.filter((c) => c.unreadByTeam > 0).length;

  // A chime when someone writes in a chat you don't have open (the open one chimes on its own).
  const seen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!list.data) return;
    const before = seen.current;
    seen.current = new Map(list.data.map((c) => [c.id, c.unreadByTeam]));
    if (before && list.data.some((c) => c.id !== openId && c.unreadByTeam > (before.get(c.id) ?? 0))) playChime();
  }, [list.data, openId]);
  const [muted, setMuted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMuted(soundMuted()), 0); return () => clearTimeout(t); }, []);
  const today = all.filter((c) => new Date(c.lastMessageAt).toDateString() === new Date().toDateString()).length;
  const selected = openId ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Unread", String(unread), unread ? "bg-lemon/70" : "bg-white ring-1 ring-line"], ["Active today", String(today), "bg-sky/60"], ["Team replying", String(all.filter((c) => c.mode === "agent").length), "bg-mint/60"], ["All conversations", String(all.length), "bg-white ring-1 ring-line"]] as const).map(([k, v, tone]) => (
          <div key={k} className={`rounded-3xl p-5 ${tone}`}><p className="text-sm text-ink/70">{k}</p><p className="mt-2 font-display text-4xl leading-none text-ink">{v}</p></div>
        ))}
      </div>

      <div className="grid overflow-hidden rounded-3xl bg-white ring-1 ring-line lg:h-[min(760px,calc(100dvh-10rem))] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Inbox */}
        <aside className={`flex min-h-0 flex-col border-line lg:border-r ${selected ? "max-lg:hidden" : ""}`}>
          <div className="space-y-3 border-b border-line p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">Live chat</h2>
              <span className="flex items-center gap-3 text-xs text-ink-soft">
                <button type="button" onClick={() => { const next = !muted; setSoundMuted(next); setMuted(next); if (!next) playChime(); }} aria-label={muted ? "Turn message sounds on" : "Mute message sounds"} title={muted ? "Sounds off" : "Sounds on"}
                  className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 transition-colors ${muted ? "text-ink-soft ring-line hover:text-ink" : "bg-mint/50 text-forest ring-forest/15"}`}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />{muted ? <path d="M13.5 7.5l4 5M17.5 7.5l-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /> : <path d="M13.5 7.2a4 4 0 010 5.6M15.6 5.2a7 7 0 010 9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}</svg>
                </button>
                <span className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest/50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-forest" /></span>Live</span></span>
            </div>
            <label className="relative block">
              <span className="sr-only">Search chats</span>
              <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <input className="input bg-paper/60 !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, place or message" />
            </label>
            <FilterChips options={FILTERS} value={filter} onChange={setFilter} counts={{ unread }} highlight="unread" label="Filter chats" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[70vh]">
            {list.loading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
              : list.error ? <div className="p-4"><Alert>{list.error}</Alert></div>
              : !rows.length ? <div className="p-6"><EmptyState title={all.length ? "No chats match" : "No chats yet"} description={all.length ? "Try another filter or search." : "Conversations from the chat bubble on the website appear here as they happen."} /></div>
              : (
                <ul>
                  {rows.map((c) => {
                    const on = c.id === selected;
                    const name = who(c);
                    return (
                      <li key={c.id}>
                        <button type="button" onClick={() => setOpenId(c.id)}
                          className={`flex w-full items-start gap-3 border-b border-line/70 px-4 py-3.5 text-left transition-colors ${on ? "bg-brass-pale/50" : "hover:bg-paper/60"}`}>
                          <span className="relative shrink-0">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium text-ink" style={{ backgroundColor: pastelFor(name) }}>{c.name ? initials(c.name) : <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.5" /><path d="M4 17c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}</span>
                            {c.country && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white px-0.5 text-[13px] leading-none shadow-sm" title={countryName(c.country)}>{countryFlag(c.country)}</span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`truncate text-sm text-ink ${c.unreadByTeam ? "font-semibold" : "font-medium"}`}>{name}</span>
                              <span className={`shrink-0 text-[11px] ${c.unreadByTeam ? "font-medium text-forest" : "text-ink-soft"}`}>{ago(c.lastMessageAt)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-2">
                              <span className={`line-clamp-1 flex-1 text-xs ${c.unreadByTeam ? "text-ink" : "text-ink-soft"}`}>{c.lastMessage}</span>
                              {c.unreadByTeam > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-forest px-1.5 text-[10px] font-semibold text-white">{c.unreadByTeam}</span>}
                            </span>
                            <span className="mt-1.5 flex items-center gap-1.5">
                              <ModeChip mode={c.mode} name={c.agentName} />
                              {c.role && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-medium text-ink-soft">{c.role === "MENTOR" ? "Mentor" : "Student"}</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </aside>

        {/* Conversation */}
        <section className={`min-h-0 ${selected ? "" : "max-lg:hidden"}`}>
          {selected ? <Conversation key={selected} id={selected} onBack={() => setOpenId(null)} onChanged={() => { reload(); onChanged?.(); }} />
            : (
              <div className="chat-wallpaper flex h-full min-h-[420px] flex-col items-center justify-center p-10 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm"><Image src="/brand/pointb-mark.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" /></span>
                <p className="mt-5 font-display text-2xl text-ink">Pick a conversation</p>
                <p className="mt-2 max-w-sm text-sm text-ink-soft">Read what visitors, students and mentors are asking. Reply yourself whenever you like: the AI steps back while you&rsquo;re in the chat.</p>
              </div>
            )}
        </section>
      </div>
    </div>
  );
}

function ModeChip({ mode, name }: { mode: "ai" | "agent"; name?: string | null }) {
  return mode === "agent"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[10px] font-medium text-forest"><span className="h-1.5 w-1.5 rounded-full bg-forest" />{name ? name.split(" ")[0] : "Team"} replying</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-lilac/70 px-2 py-0.5 text-[10px] font-medium text-ink"><svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 1l2.2 6.3L18.5 9l-6.3 2.2L10 17.5l-2.2-6.3L1.5 9l6.3-1.7z" /></svg>AI replying</span>;
}

function Conversation({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const chat = useApi<ChatDetail>(`/admin/chats/${id}`);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const { reload, setData } = chat;
  const c = chat.data;
  const count = c?.messages.length ?? 0;
  const fromThem = c?.messages.filter((m) => m.role === "user").length;
  const heard = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (fromThem === undefined) return;
    if (heard.current !== undefined && fromThem > heard.current) playChime();
    heard.current = fromThem;
  }, [fromThem]);

  useEffect(() => { const t = setInterval(reload, 3000); return () => clearInterval(t); }, [reload]);
  useEffect(() => { onChanged(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- once, to clear the unread count in the inbox
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [count]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      setData(await api<ChatDetail>(`/admin/chats/${id}/messages`, { method: "POST", body: { content: text } }));
      setDraft("");
      playChime("sent");
      if (box.current) box.current.style.height = "auto";
      onChanged();
    } catch (e) { toast(errMsg(e), "error"); }
    setSending(false);
    box.current?.focus();
  }

  async function mode(next: "ai" | "agent") {
    setSwitching(true);
    try {
      setData(await api<ChatDetail>(`/admin/chats/${id}/mode`, { method: "PATCH", body: { mode: next } }));
      toast(next === "agent" ? "You have the chat. The AI will stay quiet." : "Handed back. The AI will answer new messages.");
      onChanged();
      if (next === "agent") box.current?.focus();
    } catch (e) { toast(errMsg(e), "error"); }
    setSwitching(false);
  }

  if (chat.error) return <div className="p-6"><Alert>{chat.error}</Alert></div>;
  if (!c) return <div className="space-y-3 p-6"><Skeleton className="h-14 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  const name = who(c);
  const until = c.agentUntil ? new Date(c.agentUntil) : null;

  return (
    <div className="flex h-full min-h-[70vh] flex-col lg:min-h-0">
      <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: WA_HEADER }}>
        <button type="button" onClick={onBack} aria-label="Back to chats" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 lg:hidden">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-ink" style={{ backgroundColor: pastelFor(name) }}>{c.name ? initials(c.name) : "?"}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-semibold">{name}</span>
          <span className="block truncate text-xs text-white/80">
            {[c.email, c.country && `${countryFlag(c.country)} ${c.city ? `${c.city}, ` : ""}${countryName(c.country)}`, c.page && `on ${c.page}`].filter(Boolean).join(" · ") || "Visitor"}
          </span>
        </span>
        <div className="flex shrink-0 rounded-full bg-black/15 p-0.5 text-xs font-medium" role="radiogroup" aria-label="Who replies">
          {([["ai", "AI"], ["agent", "Me"]] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={c.mode === v} disabled={switching || c.mode === v} onClick={() => mode(v)}
              className={`rounded-full px-3 py-1.5 transition-colors ${c.mode === v ? "bg-white text-[#0b4f43] shadow-sm" : "text-white/85 hover:text-white"}`}>{label}</button>
          ))}
        </div>
      </header>

      <div className={`flex items-center gap-2 px-4 py-2 text-xs ${c.mode === "agent" ? "bg-mint/60 text-forest" : "bg-lilac/50 text-ink"}`}>
        {c.mode === "agent"
          ? <><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-forest" /><span><strong className="font-medium">{c.agentName ?? "The team"}</strong> is replying. The AI is quiet{until ? ` until ${clock(until.toISOString())}, or until you hand back` : ""}.</span></>
          : <><svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden className="shrink-0"><path d="M10 1l2.2 6.3L18.5 9l-6.3 2.2L10 17.5l-2.2-6.3L1.5 9l6.3-1.7z" /></svg><span>The AI is answering. Send a message to step in; the visitor sees every reply as POINT B.</span></>}
      </div>

      <div ref={scroller} className="chat-wallpaper min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6">
        {c.messages.map((m, i) => {
          const prev = c.messages[i - 1];
          const newDay = !prev || day(prev.createdAt) !== day(m.createdAt);
          const mine = m.role !== "user";
          const start = !prev || newDay || prev.role !== m.role;
          return (
            <div key={m.id}>
              {newDay && <div className="my-3 flex justify-center"><span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-soft shadow-sm">{day(m.createdAt)}</span></div>}
              <div className={`flex ${mine ? "justify-end" : "justify-start"} ${start ? "pt-2" : ""}`}>
                <div className={`relative max-w-[78%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14px] leading-[1.38] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${m.role === "user" ? "bg-white" : m.role === "agent" ? "bg-[#d9fdd3]" : "bg-[#eef3ff]"} ${start ? (mine ? "chat-tail-out rounded-tr-none" : "chat-tail-in rounded-tl-none") : ""}`}>
                  {mine && start && <span className={`mb-0.5 block text-[11px] font-semibold ${m.role === "agent" ? "text-forest" : "text-[#5b5bd6]"}`}>{m.role === "agent" ? m.agentName ?? "Team" : "AI assistant"}</span>}
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  <span className="float-right ml-3 mt-1.5 translate-y-1 text-[10.5px] leading-none text-[#667781]">{clock(m.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-line bg-[#f0f2f5] px-3 py-3">
        <label className="flex min-h-[44px] flex-1 items-end rounded-3xl bg-white px-4 py-2.5 shadow-sm">
          <span className="sr-only">Reply</span>
          <textarea ref={box} rows={1} value={draft} maxLength={2000} placeholder={c.mode === "agent" ? "Reply as POINT B" : "Reply as POINT B (the AI will step back)"}
            onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            className="max-h-[140px] w-full resize-none bg-transparent text-[15px] leading-6 text-ink outline-none placeholder:text-[#8696a0] focus-visible:outline-none" />
        </label>
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send reply"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all enabled:hover:brightness-95 disabled:opacity-50" style={{ backgroundColor: WA_HEADER }}>
          {sending ? <Spinner /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>}
        </button>
      </form>
    </div>
  );
}
