"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Container, MentorPhoto } from "@/components/ui";
import { Sparkle } from "@/components/match-teaser";
import { Flag } from "@/components/flag";
import { api, errMsg } from "@/lib/api";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/lib/constants";
import { fmtDayShort, formatMoney } from "@/lib/format";
import type { MentorSummary } from "@/lib/types";

type Pick = MentorSummary & { reason: string };
interface Answer { reply: string; steps: string[]; focus: string | null; followUp: string | null; mentors: Pick[] }
type Turn = { role: "user"; content: string } | { role: "assistant"; content: string; answer: Answer };

const STORE = "pointb.match.v1";
const STARTERS = [
  "I'm a final-year student and not sure which career to choose.",
  "I want to move into product management. Where do I start?",
  "Should I study abroad or start working first?",
  "I have a business idea. How do I test it?",
  "Help me prepare for my first job interviews.",
  "I want to grow into a leadership role.",
];

/** What the model sees of an earlier answer, so follow-ups keep their context. */
const asText = (a: Answer) => [a.reply, ...a.steps.map((s) => `- ${s}`), a.mentors.length ? `Suggested: ${a.mentors.map((m) => m.name).join(", ")}` : "", a.followUp ?? ""].filter(Boolean).join("\n");

export default function MatchPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const loaded = useRef(false);

  // The chat survives a refresh or a visit to a mentor's profile and back, for this browser tab only.
  useEffect(() => {
    const t = setTimeout(() => {
      try { const saved = sessionStorage.getItem(STORE); if (saved) setTurns(JSON.parse(saved)); } catch { /* storage unavailable */ }
      loaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (loaded.current) { try { sessionStorage.setItem(STORE, JSON.stringify(turns)); } catch { /* storage unavailable */ } }
    if (turns.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next); setDraft(""); setBusy(true); setError(null);
    try {
      const answer = await api<Answer>("/match", { body: { messages: next.slice(-12).map((t) => ({ role: t.role, content: t.role === "assistant" ? asText(t.answer) : t.content })) } });
      setTurns([...next, { role: "assistant", content: answer.reply, answer }]);
    } catch (e) {
      setError(errMsg(e));
      setTurns(turns); setDraft(content);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  function reset() { setTurns([]); setError(null); setDraft(""); input.current?.focus(); }
  const empty = turns.length === 0;

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[440px] w-[440px] rounded-full bg-sky/50 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-[360px] h-[320px] w-[320px] rounded-full bg-lilac/40 blur-[120px]" />

      <Container className="relative flex w-full max-w-3xl flex-1 flex-col pb-4 pt-10 sm:pt-14">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky px-3.5 py-1.5 text-xs font-medium text-ink"><Sparkle className="h-3.5 w-3.5" />AI match</span>
          {!empty && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-soft ring-1 ring-line transition-colors hover:text-ink hover:ring-ink/30">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>New chat
            </button>
          )}
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col justify-center py-10">
            <h1 className="animate-rise font-display text-[2.8rem] leading-[1.02] text-ink sm:text-6xl">What are you stuck on?</h1>
            <p className="animate-rise mt-4 max-w-xl text-lg leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "60ms" }}>
              Describe your situation in your own words. You&rsquo;ll get a clear first step and the mentors best placed to help, in seconds.
            </p>
            <div className="animate-rise mt-8 grid gap-2.5 sm:grid-cols-2" style={{ ["--rise-delay" as string]: "120ms" }}>
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="group flex items-start gap-3 rounded-2xl bg-white/80 p-4 text-left text-sm text-ink ring-1 ring-ink/5 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(17,17,17,0.35)]">
                  <Sparkle className="mt-0.5 h-3.5 w-3.5 text-brass" />{s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-8 py-8" aria-live="polite">
            {turns.map((t, i) => t.role === "user"
              ? <div key={i} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-line rounded-3xl rounded-br-lg bg-ink px-5 py-3.5 text-[0.95rem] leading-relaxed text-white">{t.content}</p></div>
              : <AnswerView key={i} a={t.answer} onAsk={send} last={i === turns.length - 1} />)}
            {busy && (
              <div className="flex items-center gap-3 text-sm text-ink-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky text-ink"><Sparkle className="h-4 w-4 animate-pulse" /></span>
                Finding your best matches
                <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft/60" style={{ animationDelay: `${d * 150}ms` }} />)}</span>
              </div>
            )}
            <div ref={end} />
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-paper via-paper to-transparent px-4 pb-4 pt-6 sm:-mx-6 sm:px-6">
          {error && <p className="mb-3 rounded-2xl bg-rust-pale px-4 py-3 text-sm text-rust">{error} <Link href="/mentors" className="underline underline-offset-2">Browse mentors</Link></p>}
          <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex items-end gap-2 rounded-[1.75rem] bg-white p-2 pl-5 shadow-[0_18px_50px_-30px_rgba(17,17,17,0.45)] ring-1 ring-line focus-within:ring-ink/30">
            <textarea ref={input} rows={1} value={draft} maxLength={2000} disabled={busy}
              onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
              placeholder={empty ? "e.g. I studied finance but want to move into tech…" : "Add more detail, or ask a follow-up…"}
              aria-label="Describe what you need help with"
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[0.95rem] leading-relaxed text-ink outline-none placeholder:text-ink-soft/60" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-ink-soft disabled:bg-paper-dim disabled:text-ink-soft">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 16V4M5 9l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-ink-soft">Suggestions are a starting point, generated by AI. Always check a mentor&rsquo;s profile before you book.</p>
        </div>
      </Container>
    </div>
  );
}

function AnswerView({ a, onAsk, last }: { a: Answer; onAsk: (text: string) => void; last: boolean }) {
  return (
    <div className="animate-rise flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky text-ink"><Sparkle className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1 space-y-5">
        <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-ink">{a.reply}</p>
        {a.steps.length > 0 && (
          <ol className="space-y-2.5 rounded-3xl bg-white/80 p-5 ring-1 ring-ink/5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Your next steps</p>
            {a.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-white">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        )}
        {a.mentors.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Best matches for you{a.focus ? ` · ${a.focus}` : ""}</p>
            <div className="space-y-3">{a.mentors.map((m, i) => <MatchCard key={m.slug} m={m} top={i === 0} />)}</div>
          </div>
        )}
        {a.followUp && last && (
          <button type="button" onClick={() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus()} className="flex w-full items-start gap-2.5 rounded-2xl border border-dashed border-ink/20 px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:border-ink/40 hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden className="mt-0.5 shrink-0"><path d="M4 5h12v8H8l-4 3V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            <span><span className="font-medium text-ink">To sharpen your match: </span>{a.followUp}</span>
          </button>
        )}
        {a.mentors.length === 0 && !a.followUp && last && (
          <button type="button" onClick={() => onAsk("Which mentors would you suggest for this?")} className="text-sm font-medium text-ink underline underline-offset-4">Suggest mentors for this</button>
        )}
      </div>
    </div>
  );
}

function MatchCard({ m, top }: { m: Pick; top: boolean }) {
  return (
    <div className={`overflow-hidden rounded-3xl bg-white ring-1 transition-shadow hover:shadow-[0_18px_40px_-26px_rgba(17,17,17,0.4)] ${top ? "ring-ink/20" : "ring-line"}`}>
      <div className="flex gap-4 p-4 sm:p-5">
        <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24" initialsClass="text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-display text-xl leading-tight text-ink">{m.name}</p>
            {top && <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-medium text-forest">Best match</span>}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-soft">{m.title} · {m.organization}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1">{m.category === "INTERNATIONAL" && <Flag country={m.country} className="h-3 w-[18px]" />}{CATEGORY_LABEL[m.category]}</span>
            <span aria-hidden>·</span><span>{LEVEL_LABEL[m.level]}</span>
            <span aria-hidden>·</span><span>{m.rating ? `★ ${m.rating.toFixed(1)}` : "New"}</span>
          </p>
        </div>
      </div>
      <p className="mx-4 mb-4 flex gap-2 rounded-2xl bg-paper px-4 py-3 text-sm leading-relaxed text-ink sm:mx-5"><Sparkle className="mt-0.5 h-3.5 w-3.5 text-brass" />{m.reason}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-sm"><span className="font-medium text-ink">{formatMoney(m.priceMinor, m.currency)}</span> <span className="text-ink-soft">/ 30 min · {m.nextAvailable ? `next ${fmtDayShort(m.nextAvailable)}` : "no open times"}</span></p>
        <Link href={`/mentors/${m.slug}`} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-soft">View &amp; book</Link>
      </div>
    </div>
  );
}
