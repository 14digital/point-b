"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";
import { playChime, setSoundMuted, soundMuted } from "@/lib/sound";

type Msg = { id?: string; role: "user" | "assistant"; content: string; at: number; failed?: boolean };
type ServerMsg = { id: string; role: "user" | "assistant"; content: string; at: string };

const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const STORE = "pointb.chat";
const KEY = "pointb.chat.key";
const SEEN = "pointb.chat.seen";
const HIDDEN_ON = ["/admin", "/session", "/interview"];

const WA = "#25D366";
const HEADER = "#008069";

const read = (k: string, s: Storage | undefined = undefined) => { try { return (s ?? localStorage).getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

/** This browser's private key for its conversation, kept so the chat carries on across pages and visits. */
function chatKey(create: boolean) {
  let k = read(KEY);
  if (!k && create) { k = crypto.randomUUID(); write(KEY, k); }
  return k;
}

/** Adds messages from the server, matching them to replies already on screen so nothing shows twice. */
function merge(local: Msg[], incoming: ServerMsg[], onNewReply?: () => void): Msg[] {
  const out = [...local];
  for (const m of incoming) {
    if (out.some((x) => x.id === m.id)) continue;
    const twin = out.findIndex((x) => !x.id && !x.failed && x.role === m.role && x.content.trim() === m.content.trim());
    const msg: Msg = { id: m.id, role: m.role, content: m.content, at: new Date(m.at).getTime() };
    if (twin >= 0) out[twin] = msg; else { out.push(msg); if (m.role === "assistant") onNewReply?.(); }
  }
  return out;
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The live help chat, styled like a messaging app: a button at the bottom right that opens a conversation. */
export function ChatWidget() {
  const pathname = usePathname() ?? "/";
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const busyRef = useRef(false);
  const openRef = useRef(false);
  useEffect(() => { busyRef.current = busy; openRef.current = open; }, [busy, open]);

  /** New messages from the server since the last one we have: team replies, or the AI's reply once saved. */
  const pull = useCallback(async (full = false) => {
    const key = chatKey(false);
    if (!key || busyRef.current) return;
    try {
      const res = await fetch(`${BASE}/assistant/chat/${key}`, { cache: "no-store" });
      if (!res.ok) return;
      const { messages } = (await res.json()) as { messages: ServerMsg[] };
      if (busyRef.current) return;
      setMsgs((cur) => {
        // A reply that arrived since we last looked (from the team, say) gets a chime; loading the chat doesn't.
        const next = merge(full ? cur.filter((m) => !m.id) : cur, messages, full ? undefined : () => playChime());
        if (!openRef.current) {
          const seen = Number(read(SEEN) ?? 0);
          setUnread(next.filter((m) => m.role === "assistant" && m.at > seen).length);
        }
        return next;
      });
    } catch { /* offline: try again on the next tick */ }
  }, []);

  // While open, check for replies every few seconds; while closed, now and then, to show a badge.
  useEffect(() => {
    if (!chatKey(false)) return;
    const t = setInterval(() => pull(), open ? 4000 : 20000);
    return () => clearInterval(t);
  }, [open, pull]);

  // A gentle hello a few seconds after arriving, once per tab, never on top of an open chat.
  useEffect(() => {
    if (read(`${STORE}.hello`, sessionStorage) === "1" || chatKey(false)) return;
    const t = setTimeout(() => setTeaser(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const openChat = (next: boolean) => {
    if (next && !loaded.current) { loaded.current = true; pull(true); }
    if (next) { setUnread(0); write(SEEN, String(Date.now())); }
    setOpen(next);
  };
  const dismissTeaser = () => { setTeaser(false); try { sessionStorage.setItem(`${STORE}.hello`, "1"); } catch { /* ignore */ } };

  useEffect(() => {
    if (!open) return;
    write(SEEN, String(Date.now()));
    const t = setTimeout(() => input.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, msgs.length]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [msgs, busy, open, streaming]);

  const send = useCallback(async (text: string, history?: Msg[]) => {
    const content = text.trim();
    if (!content || busy) return;
    const base = (history ?? msgs).filter((m) => !m.failed);
    const next: Msg[] = [...base, { role: "user", content, at: Date.now() }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    playChime("sent");
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const token = getToken();
    let reloadSoon = false;
    try {
      const res = await fetch(`${BASE}/assistant/chat`, {
        method: "POST", signal: ctrl.signal, cache: "no-store",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ key: chatKey(true), message: content, page: pathname, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(res.status === 429 ? "You've sent a lot of messages. Please wait a little and try again." : data?.message ?? "I couldn't reply just now.");
      }
      reloadSoon = true;
      // Someone from the team is in this chat: their reply arrives with the next check.
      if (res.headers.get("content-type")?.includes("application/json")) return;
      // A short, human pause before the words start to appear.
      await new Promise((r) => setTimeout(r, 450));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      const at = Date.now();
      setStreaming(true);
      let chimed = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!chimed) { chimed = true; playChime(); }
        reply += decoder.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: reply, at }]);
      }
      if (!reply.trim()) throw new Error("I couldn't reply just now.");
      setMsgs([...next, { role: "assistant", content: reply.trim(), at }]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const message = e instanceof TypeError ? "We couldn't reach the server. Check your connection and try again." : (e as Error).message;
      setMsgs([...next, { role: "assistant", content: message, at: Date.now(), failed: true }]);
    } finally {
      setBusy(false);
      busyRef.current = false;
      setStreaming(false);
      if (reloadSoon) setTimeout(() => pull(), 800);
    }
  }, [busy, msgs, pathname, pull]);

  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = msgs.lastIndexOf(lastUser);
    send(lastUser.content, msgs.slice(0, idx));
  };

  // A fresh conversation: a new key, so the old one stays with the team but no longer shows here.
  const reset = () => { abort.current?.abort(); setMsgs([]); setBusy(false); setStreaming(false); setMenu(false); write(KEY, null); };

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const first = user?.name.split(" ")[0];
  const greeting = `Hi${first ? ` ${first}` : ""}! Welcome to POINT B. Ask us anything about finding a mentor, booking, payments or your sessions.`;
  const quick = user?.role === "MENTOR"
    ? ["When is my next session?", "How do payouts work?", "How do I add availability?", "A student didn't join"]
    : user
      ? ["When is my next session?", "Can I cancel or reschedule?", "My payment is pending", "Help me find a mentor"]
      : ["How does booking work?", "How much does a session cost?", "Help me find a mentor", "How do I become a mentor?"];
  const typing = busy && !streaming;

  return (
    <div className="chat-widget">
      {/* Teaser bubble */}
      {teaser && !open && (
        <div className="fixed bottom-[5.6rem] right-4 z-[70] w-[min(17rem,calc(100vw-2rem))] animate-[chat-pop_.35s_cubic-bezier(.2,.9,.3,1.2)_both] sm:right-6">
          <div className="relative rounded-2xl rounded-br-md bg-white p-3.5 pr-8 text-sm text-ink shadow-[0_18px_40px_-18px_rgba(17,17,17,0.45)] ring-1 ring-ink/5">
            <button type="button" onClick={dismissTeaser} aria-label="Dismiss" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-ink-soft hover:bg-paper">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
            <button type="button" onClick={() => { dismissTeaser(); openChat(true); }} className="text-left">
              <span className="block font-medium">Hi{first ? ` ${first}` : ""} 👋</span>
              <span className="mt-0.5 block text-ink-soft">Questions about mentors or booking? Chat with us, we reply instantly.</span>
            </button>
          </div>
        </div>
      )}

      {/* Launcher */}
      <button type="button" onClick={() => { dismissTeaser(); openChat(!open); }} aria-label={open ? "Close chat" : "Chat with POINT B"} aria-expanded={open}
        className={`fixed bottom-4 right-4 z-[70] flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-full text-white shadow-[0_14px_34px_-10px_rgba(37,211,102,0.75)] transition-transform duration-300 hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6 ${open ? "max-sm:hidden" : ""}`}
        style={{ backgroundColor: WA }}>
        {!open && <span aria-hidden className="absolute inset-0 animate-[chat-ring_2.6s_ease-out_infinite] rounded-full" style={{ backgroundColor: WA }} />}
        <span className={`relative transition-all duration-300 ${open ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`}><WhatsAppGlyph /></span>
        <svg className={`absolute transition-all duration-300 ${open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        {(teaser || unread > 0) && !open && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rust px-1 text-[11px] font-semibold ring-2 ring-white">{unread || 1}</span>}
      </button>

      {/* Conversation */}
      <section role="dialog" aria-label="Chat with POINT B" aria-hidden={!open}
        className={`fixed z-[71] flex flex-col overflow-hidden bg-[#efeae2] shadow-[0_30px_80px_-24px_rgba(17,17,17,0.55)] transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1)] max-sm:inset-0 sm:bottom-[6.4rem] sm:right-6 sm:h-[min(640px,calc(100dvh-8.5rem))] sm:w-[390px] sm:origin-bottom-right sm:rounded-[1.6rem] sm:ring-1 sm:ring-black/5 ${open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-95 opacity-0"}`}>
        <header className="relative flex items-center gap-3 px-3 py-2.5 text-white sm:px-4" style={{ backgroundColor: HEADER }}>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 sm:hidden">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="relative shrink-0">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#111] ring-2 ring-white/15">
              <Image src="/brand/pointb-mark-light.png" alt="" width={40} height={40} className="h-6 w-6 object-contain" />
            </span>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2" style={{ backgroundColor: WA, ["--tw-ring-color" as string]: HEADER }} />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5 text-[15px] font-semibold">POINT B
              <svg width="15" height="15" viewBox="0 0 24 24" aria-label="Verified" className="shrink-0"><path fill="#fff" fillOpacity=".95" d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3L2.6 15.8l1-3-1-3L5.2 7.9l1-3 3.2.1z" /><path d="M8 12.2l2.6 2.6L16.2 9" stroke={HEADER} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="block truncate text-xs text-white/80" aria-live="polite">{typing ? "typing…" : "online · replies instantly"}</span>
          </span>
          <div className="relative">
            <button type="button" onClick={() => { setMuted(soundMuted()); setMenu((m) => !m); }} aria-label="Chat options" aria-expanded={menu} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden><circle cx="10" cy="4.5" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="10" cy="15.5" r="1.6" /></svg>
            </button>
            {menu && (
              <>
                <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-0 cursor-default" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-10 z-10 w-52 overflow-hidden rounded-xl bg-white py-1.5 text-sm text-ink shadow-[0_16px_40px_-16px_rgba(17,17,17,0.45)] ring-1 ring-ink/5">
                  <button type="button" onClick={() => { const next = !soundMuted(); setSoundMuted(next); setMuted(next); setMenu(false); if (!next) playChime(); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-paper">
                    {muted ? "Turn sounds on" : "Mute sounds"}
                    <SpeakerIcon off={muted} />
                  </button>
                  <button type="button" onClick={reset} className="block w-full px-4 py-2.5 text-left hover:bg-paper">Start a new chat</button>
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 sm:flex">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div ref={scroller} className="chat-wallpaper flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
          <div className="mb-3 flex justify-center"><span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-soft shadow-sm">Today</span></div>
          <div className="mx-auto mb-4 max-w-[85%] rounded-lg bg-[#ffeecd] px-3 py-2 text-center text-[11.5px] leading-snug text-[#54656f] shadow-sm">
            Chat with the POINT B team. We usually reply within seconds.
          </div>

          <Bubble role="assistant" at={msgs[0]?.at} tail><Rich text={greeting} onNavigate={() => setOpen(false)} /></Bubble>
          {!msgs.length && (
            <div className="flex flex-wrap justify-end gap-1.5 pt-3">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} className="rounded-full bg-white px-3.5 py-2 text-[13px] font-medium shadow-sm ring-1 ring-black/5 transition-colors hover:bg-[#f0f9f4]" style={{ color: HEADER }}>{q}</button>
              ))}
            </div>
          )}

          {msgs.map((m, i) => {
            const parts = m.role === "assistant" ? m.content.split(/\n\s*\n/).filter((p) => p.trim()) : [m.content];
            const prev = msgs[i - 1];
            return (
              <Fragment key={i}>
                {parts.map((p, j) => (
                  <Bubble key={j} role={m.role} at={m.at} tail={j === 0 && prev?.role !== m.role} gap={j === 0 && prev?.role !== m.role}
                    read={m.role === "user" && (i < msgs.length - 1 || busy)} failed={m.failed}>
                    {m.role === "assistant" ? <Rich text={p} onNavigate={() => setOpen(false)} /> : p}
                  </Bubble>
                ))}
                {m.failed && i === msgs.length - 1 && (
                  <div className="flex gap-1.5 pl-2 pt-1">
                    <button type="button" onClick={retry} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-black/5 hover:bg-[#f0f9f4]" style={{ color: HEADER }}>Try again</button>
                  </div>
                )}
              </Fragment>
            );
          })}

          {typing && (
            <div className="flex pt-2">
              <div className="chat-tail-in relative flex items-center gap-1 rounded-lg rounded-tl-none bg-white px-4 py-3 shadow-sm" aria-label="POINT B is typing">
                {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-[chat-dot_1.2s_ease-in-out_infinite] rounded-full bg-[#8696a0]" style={{ animationDelay: `${d * 0.16}s` }} />)}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex items-end gap-2 bg-[#f0f2f5] px-2.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <label className="flex min-h-[44px] flex-1 items-end rounded-3xl bg-white px-4 py-2.5 shadow-sm">
            <span className="sr-only">Message</span>
            <textarea ref={input} rows={1} value={draft} maxLength={2000} placeholder="Type a message"
              onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }}
              className="max-h-[120px] w-full resize-none bg-transparent text-[15px] leading-6 text-ink outline-none placeholder:text-[#8696a0] focus-visible:outline-none" />
          </label>
          <button type="submit" disabled={!draft.trim() || busy} aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all enabled:hover:brightness-95 disabled:opacity-50" style={{ backgroundColor: HEADER }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
          </button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ role, at, children, tail, gap = true, read, failed }: { role: Msg["role"]; at?: number; children: ReactNode; tail?: boolean; gap?: boolean; read?: boolean; failed?: boolean }) {
  const mine = role === "user";
  return (
    <div className={`flex animate-[chat-in_.22s_ease-out_both] ${mine ? "justify-end" : "justify-start"} ${gap ? "pt-2" : ""}`}>
      <div className={`relative max-w-[82%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.38] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${mine ? "bg-[#d9fdd3]" : failed ? "bg-[#fdecea]" : "bg-white"} ${tail ? (mine ? "chat-tail-out rounded-tr-none" : "chat-tail-in rounded-tl-none") : ""}`}>
        <span className="whitespace-pre-wrap break-words">{children}</span>
        <span className="float-right ml-3 mt-1.5 flex translate-y-1 items-center gap-0.5 text-[10.5px] leading-none text-[#667781]">
          {at ? time(at) : null}
          {mine && <svg width="16" height="11" viewBox="0 0 16 11" fill="none" aria-label={read ? "Read" : "Sent"}><path d="M11.07 1.25L4.6 7.72 1.93 5.05M14.57 1.25L8.1 7.72l-.95-.95" stroke={read ? "#53bdeb" : "#8696a0"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
      </div>
    </div>
  );
}

/** Plain text with site links: [label](/path), bare /paths and https links become tappable. */
function Rich({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const clean = text.replace(/\(\[(\/[^\]\s]+)\]\)/g, "$1").replace(/\[(\/[^\]\s]+)\](?!\()/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
  const re = /\[([^\]]+)\]\(((?:\/|https?:\/\/)[^\s)]+)\)|(https?:\/\/[^\s)]+)|(^|[\s(])(\/(?:[a-z0-9-]+\/?)+(?:\?[\w=&-]+)?)/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(clean))) {
    const lead = m[4] ?? "";
    const start = m.index + lead.length;
    out.push(clean.slice(last, start));
    const href = (m[2] ?? m[3] ?? m[5]).replace(/[.,]$/, "");
    const trailing = (m[2] ?? m[3] ?? m[5]).slice(href.length);
    const label = m[1] && !m[1].startsWith("/") ? m[1] : href.startsWith("/") ? prettyPath(href) : href.replace(/^https?:\/\//, "");
    out.push(href.startsWith("/")
      ? <Link key={k++} href={href} onClick={onNavigate} className="font-medium text-[#027eb5] underline-offset-2 hover:underline">{label}</Link>
      : <a key={k++} href={href} target="_blank" rel="noreferrer" className="font-medium text-[#027eb5] underline-offset-2 hover:underline">{label}</a>);
    if (trailing) out.push(trailing);
    last = re.lastIndex;
  }
  out.push(clean.slice(last));
  return <>{out}</>;
}

const PATH_NAMES: Record<string, string> = {
  "/mentors": "Browse mentors", "/match": "Find my match", "/contact": "Contact us", "/pricing": "Pricing", "/how-it-works": "How it works",
  "/become-a-mentor": "Become a mentor", "/become-a-mentor/apply": "Apply to mentor", "/dashboard/student": "Your dashboard", "/dashboard/mentor": "Your dashboard",
  "/account": "Account settings", "/sign-in": "Sign in",
};
const prettyPath = (p: string) => PATH_NAMES[p.replace(/\/$/, "")] ?? (p.startsWith("/mentors/") ? "View profile" : p);

function WhatsAppGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <path d="M16.04 3C9.03 3 3.33 8.7 3.33 15.7c0 2.24.59 4.43 1.7 6.36L3.2 29l7.13-1.87a12.66 12.66 0 005.7 1.37h.01c7 0 12.7-5.7 12.7-12.7 0-3.39-1.32-6.58-3.72-8.98A12.62 12.62 0 0016.04 3zm0 23.35h-.01a10.55 10.55 0 01-5.37-1.47l-.39-.23-4.23 1.11 1.13-4.12-.25-.42a10.52 10.52 0 01-1.62-5.62c0-5.82 4.74-10.56 10.57-10.56 2.82 0 5.47 1.1 7.47 3.1a10.5 10.5 0 013.09 7.47c0 5.82-4.74 10.56-10.56 10.56zm5.79-7.91c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.88-1.76-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.29c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.88-.77 2.14-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37z" />
    </svg>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden className="text-ink-soft">
      <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {off ? <path d="M13.5 7.5l4 5M17.5 7.5l-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        : <path d="M13.5 7.2a4 4 0 010 5.6M15.6 5.2a7 7 0 010 9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}
