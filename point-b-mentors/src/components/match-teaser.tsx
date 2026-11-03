"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MentorPhoto } from "./ui";
import { useApi } from "@/lib/use-api";
import type { MentorSummary } from "@/lib/types";

export const Sparkle = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={`shrink-0 ${className}`}>
    <path d="M10 2.5l1.6 4.9a3 3 0 001.9 1.9l4.9 1.6-4.9 1.6a3 3 0 00-1.9 1.9L10 19.3l-1.6-4.9a3 3 0 00-1.9-1.9L1.6 10.9l4.9-1.6a3 3 0 001.9-1.9L10 2.5z" />
    <path d="M19 1l.7 2.1a1.3 1.3 0 00.8.8L22.6 4.6l-2.1.7a1.3 1.3 0 00-.8.8L19 8.2l-.7-2.1a1.3 1.3 0 00-.8-.8L15.4 4.6l2.1-.7a1.3 1.3 0 00.8-.8L19 1z" />
  </svg>
);

const EXAMPLES = [
  ["“I’m a CS student and want to get into product management.”", "Start by shipping one small product end to end, so you can talk about decisions and trade-offs, not just features."],
  ["“Should I do a master’s abroad or start working first?”", "Compare the two by the job you want in five years: which path gets you there faster, and at what cost?"],
  ["“I have a startup idea but no idea how to test it.”", "Talk to ten potential customers before building anything, and ask about the last time they had the problem."],
];

/** "Not sure where to start?" panel that leads to the AI matching chat. */
/** `compact` is the shorter version that sits above lists, such as the mentor directory. */
export function MatchTeaser({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { data } = useApi<{ total: number; items: MentorSummary[] }>("/mentors?limit=3&sort=rating");
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), 5000);
    return () => clearInterval(t);
  }, []);
  const cards = data?.items ?? [];
  const lead = cards[0];

  return (
    <section className={`overflow-hidden rounded-[2rem] bg-paper-dim/80 ring-1 ring-ink/5 ${className}`}>
      <div className={`grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] ${compact ? "lg:gap-6 lg:px-10 lg:py-8" : "lg:gap-10 lg:p-12"}`}>
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky px-3.5 py-1.5 text-xs font-medium text-ink"><Sparkle className="h-3.5 w-3.5" />AI-powered match</span>
          <h2 className={`mt-5 font-display leading-[1.05] text-ink ${compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"}`}>Not sure where to start?</h2>
          <p className="mt-3 max-w-lg text-[1.05rem] leading-relaxed text-ink-soft">Tell us what you&rsquo;re stuck on. You&rsquo;ll get a clear first step and the mentors best placed to help.</p>
          <div key={i} className={`mt-6 max-w-lg animate-rise ${compact ? "hidden sm:block" : ""} rounded-2xl bg-white/80 p-4 ring-1 ring-ink/5 sm:p-5`} aria-live="polite">
            <p className="text-sm font-medium text-ink">{EXAMPLES[i][0]}</p>
            <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink-soft"><Sparkle className="mt-0.5 h-3.5 w-3.5 text-brass" />{EXAMPLES[i][1]}</p>
          </div>
          <Link href="/match" className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[0.95rem] font-medium text-white transition-colors hover:bg-ink-soft">
            <Sparkle />Find my match
          </Link>
        </div>

        <Link href="/match" aria-label="Find my match" className={`relative mx-auto block w-full max-w-sm ${compact ? "hidden h-[17rem] sm:block lg:h-[18rem]" : "h-[19rem] sm:h-[22rem]"}`}>
          {cards.slice(0, 3).reverse().map((m, idx, arr) => {
            const depth = arr.length - 1 - idx;
            return (
              <div key={m.slug} className={`absolute top-0 overflow-hidden rounded-[1.6rem] bg-white shadow-[0_24px_50px_-28px_rgba(17,17,17,0.45)] ring-4 ring-white transition-transform duration-500 ${compact ? "h-[14rem] w-[11rem] lg:h-[15rem] lg:w-[11.5rem]" : "h-[15.5rem] w-[12rem] sm:h-[18.5rem] sm:w-[14rem]"}`}
                style={{ left: `${depth * 22}%`, transform: `rotate(${depth * 5}deg) translateY(${depth * 14}px)`, zIndex: 10 - depth }}>
                <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-full w-full" initialsClass="text-6xl" />
              </div>
            );
          })}
          {lead && (
            <span className="absolute bottom-10 left-4 z-20 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-md sm:bottom-6">
              {lead.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0]}
              {lead.verified && <svg width="14" height="14" viewBox="0 0 20 20" className="text-sky" aria-label="Verified"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="M6 10.3l2.6 2.6L14 7.6" stroke="#111" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              {data && data.total > 1 && <span className="text-xs font-normal text-ink-soft">+{data.total - 1} more</span>}
            </span>
          )}
        </Link>
      </div>
    </section>
  );
}
