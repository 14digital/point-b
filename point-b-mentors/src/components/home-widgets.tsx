"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MentorPhoto, Skeleton } from "./ui";
import { MentorCard } from "./mentor-card";
import { Reveal } from "./motion";
import { useApi } from "@/lib/use-api";
import type { MentorSummary } from "@/lib/types";

/** Social proof line above the hero headline: a few faces and the live mentor count. */
export function HeroBadge() {
  const { data } = useApi<{ total: number; items: MentorSummary[] }>("/mentors?limit=3&sort=rating");
  if (!data?.total) return null;
  return (
    <div className="flex items-center gap-3 text-sm text-white/90">
      <span className="flex -space-x-2">
        {data.items.map((m) => <span key={m.id} className="h-7 w-7 overflow-hidden rounded-full ring-2 ring-white/60"><MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-full w-full" initialsClass="text-[11px]" /></span>)}
      </span>
      {data.total} screened mentors from Pakistan and abroad
    </div>
  );
}

/** "Topics you can get help with" chips along the bottom of the hero. */
export function HeroTopics() {
  const facets = useApi<{ expertise: string[] }>("/mentors/facets");
  const all = facets.data?.expertise ?? [];
  const row = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLAnchorElement>(null);
  const [fit, setFit] = useState(all.length);

  // Show only the chips that fit on one line, then "+N more" right after them (no scrolling).
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || !all.length) return;
    const GAP = 8;
    const measure = () => {
      const widths = [...el.querySelectorAll<HTMLElement>("[data-chip]")].map((c) => c.offsetWidth);
      const count = (limit: number) => { let used = 0, n = 0; for (const w of widths) { used += (n ? GAP : 0) + w; if (used > limit) break; n++; } return n; };
      const total = el.clientWidth;
      const n = count(total);
      setFit(n === widths.length ? n : count(total - GAP - (more.current?.offsetWidth ?? 96)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [all.length]);

  if (!all.length) return null;
  const hidden = all.length - fit;
  const chip = "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm text-white backdrop-blur-md transition-colors";
  return (
    <div className="flex items-center gap-2">
      <span className="mr-2 hidden shrink-0 text-sm text-white/75 sm:inline">Topics you can get help with:</span>
      <div ref={row} className="flex min-w-0 flex-1 gap-2 overflow-hidden">
        {all.map((x, i) => (
          // Chips that don't fit stay in the DOM (invisible, ordered last) so they can be measured on resize.
          <Link key={x} data-chip href={`/mentors?expertise=${encodeURIComponent(x)}`} aria-hidden={i >= fit || undefined} tabIndex={i >= fit ? -1 : undefined}
            className={`${chip} bg-white/15 hover:bg-white/25 ${i >= fit ? "invisible order-2" : ""}`}>{x}</Link>
        ))}
        <Link ref={more} href="/mentors" className={`${chip} order-1 bg-white/30 font-medium hover:bg-white/40 ${hidden > 0 ? "" : "invisible order-3"}`}>+{Math.max(hidden, 1)} more</Link>
      </div>
    </div>
  );
}

function Arrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const cls = "flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink ring-1 ring-line transition-colors hover:bg-ink hover:text-white";
  return (
    <div className="flex gap-2">
      <button onClick={onPrev} className={cls} aria-label="Previous"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      <button onClick={onNext} className={cls} aria-label="Next"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    </div>
  );
}

/** Horizontal carousel of photo cards, scrolled with arrows or by swiping. */
export function MentorCarousel() {
  const { data, loading } = useApi<{ items: MentorSummary[] }>("/mentors?limit=12&sort=rating");
  const row = useRef<HTMLDivElement>(null);
  const move = (dir: number) => row.current?.scrollBy({ left: dir * (row.current.clientWidth * 0.8), behavior: "smooth" });

  if (loading) return <div className="mt-12 flex gap-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[30rem] w-[19rem] shrink-0 rounded-[1.75rem]" />)}</div>;
  if (!data?.items.length) return <p className="mt-12 text-sm text-ink-soft">Mentor profiles will appear here as applications are approved.</p>;
  return (
    <>
      <div ref={row} className="no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8">
        {data.items.map((m) => <MentorCard key={m.id} mentor={m} className="w-[17.5rem] shrink-0 snap-start sm:w-[19rem]" />)}
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-ink-soft">{data.items.some((m) => m.isDemo) ? "Profiles marked “Demo profile” are sample content used to preview the product." : ""}</p>
        <Arrows onPrev={() => move(-1)} onNext={() => move(1)} />
      </div>
    </>
  );
}

const ICONS = [
  <path key="a" d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 3.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM10 9.2v1.6" />,
  <path key="b" d="M3 15l4.5-4.5 3 3L17 7M12.5 7H17v4.5" />,
  <path key="c" d="M10 16.5s-6-3.6-6-8a3.4 3.4 0 016-2.2A3.4 3.4 0 0116 8.5c0 4.4-6 8-6 8z" />,
  <path key="d" d="M4 6.5h12v9H4zM7.5 6.5V4.5h5v2M4 10.5h12" />,
  <path key="e" d="M7 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM13.5 9a2 2 0 100-4 2 2 0 000 4zM2.5 16c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M12 11.6c2.6-.4 5 1.4 5 4.4" />,
  <path key="f" d="M3.5 16.5V9M8.5 16.5V5M13.5 16.5v-5M17 16.5H3" />,
];

/** Topic tiles built from the expertise areas mentors actually offer. */
export function TopicTiles() {
  const { data, loading } = useApi<{ expertise: string[] }>("/mentors/facets");
  if (loading) return <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-3xl" />)}</div>;
  const topics = data?.expertise.slice(0, 12) ?? [];
  if (!topics.length) return null;
  return (
    <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {topics.map((t, i) => (
        <Reveal key={t} delay={(i % 6) * 70}><Link href={`/mentors?expertise=${encodeURIComponent(t)}`} className="group flex aspect-square flex-col justify-between rounded-3xl bg-paper-dim p-5 transition-colors hover:bg-ink hover:text-white">
          <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[i % ICONS.length]}</svg>
          <span className="text-[0.95rem] leading-snug">{t}</span>
        </Link></Reveal>
      ))}
    </div>
  );
}

const LEVEL_LABEL: Record<string, string> = { PROFESSIONAL: "Professional", SENIOR_SPECIALIST: "Senior specialist", EXECUTIVE: "Executive" };

/**
 * A fanned deck of three real mentors for the "don't go it alone" section. The cards gather in a stack and spread
 * open as the section scrolls into view; hovering one lifts it to the front. Floating labels say what every session is.
 */
export function MentorBubbles() {
  const { data } = useApi<{ items: MentorSummary[] }>("/mentors?limit=12&sort=rating");
  const people = (data?.items ?? []).filter((m) => m.photoUrl).slice(0, 3);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  // How far the side cards fan out: wider on big screens so every name shows, tighter on phones.
  const [reach, setReach] = useState(80);
  useEffect(() => {
    const fit = () => setReach(window.innerWidth < 640 ? 50 : window.innerWidth < 1024 ? 80 : 96);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOpen(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [people.length]);

  if (people.length < 3) return null;
  // Left, centre (front), right.
  const order = [people[1], people[0], people[2]];
  const spread = [
    { x: `-${reach}%`, r: -6, y: "22px", z: 10 },
    { x: "0%", r: 0, y: "0px", z: 30 },
    { x: `${reach}%`, r: 6, y: "22px", z: 10 },
  ];

  return (
    <div ref={box} className="relative mx-auto mt-16 max-w-5xl sm:mt-20">
      {/* Soft colour behind the deck */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-[70%] max-w-3xl -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-mint),transparent)] opacity-70 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute left-[18%] top-[8%] h-40 w-40 rounded-full bg-peach/60 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-[16%] bottom-[6%] h-44 w-44 rounded-full bg-sky/70 blur-3xl" />

      <div className="relative mx-auto h-[18.5rem] w-full sm:h-[30rem]" onMouseLeave={() => setHover(null)}>
        {order.map((m, i) => {
          const p = spread[i];
          const front = hover === i;
          const dim = hover !== null && !front;
          const transform = open
            ? `translateX(calc(-50% + ${p.x})) translateY(${front ? "-14px" : p.y}) rotate(${front ? 0 : p.r}deg) scale(${front ? 1.04 : i === 1 ? 1 : 0.94})`
            : `translateX(-50%) translateY(40px) rotate(${(i - 1) * 2}deg) scale(0.9)`;
          return (
            <Link key={m.id} href={`/mentors/${m.slug}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
              aria-label={`${m.name}, ${m.title} at ${m.organization}`}
              className="group absolute left-1/2 top-0 block w-[11.5rem] overflow-hidden rounded-[1.75rem] bg-ink shadow-[0_30px_60px_-28px_rgba(17,17,17,0.55)] ring-1 ring-black/5 sm:w-[17rem]"
              style={{ transform, zIndex: front ? 40 : p.z, opacity: open ? (dim ? 0.82 : 1) : 0, transition: `transform 900ms cubic-bezier(.2,.9,.25,1) ${open && hover === null ? i * 90 : 0}ms, opacity 700ms ease ${open && hover === null ? i * 90 : 0}ms, box-shadow 300ms` }}>
              <div className="relative aspect-[3/4] w-full">
                <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.04]" initialsClass="text-7xl" />
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0)_42%,rgba(17,17,17,0.82)_100%)]" />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink shadow-sm backdrop-blur sm:text-xs">
                  {m.verified && <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden><circle cx="10" cy="10" r="9" fill="var(--color-brass)" /><path d="M6 10.3l2.6 2.6L14 7.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  {LEVEL_LABEL[m.level] ?? "Mentor"}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-4 text-left text-white sm:p-5">
                  <p className="font-display text-xl leading-tight sm:text-[1.65rem]">{m.name}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-white/80 sm:text-sm">{m.title}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/70 sm:text-xs">
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 17.5s5.5-5 5.5-9.5a5.5 5.5 0 10-11 0c0 4.5 5.5 9.5 5.5 9.5z" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="8" r="1.8" fill="currentColor" /></svg>
                    <span className="truncate">{m.organization} · {m.country}</span>
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

        {/* Floating labels */}
        <FloatChip open={open} delay={350} className="-top-3 left-[2%] lg:left-0" float="0s">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint text-forest"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          Screened &amp; interviewed
        </FloatChip>
        <FloatChip open={open} delay={480} className="right-0 top-[58%] lg:-right-2" float="-2s">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-peach text-ink"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="2.5" y="5.5" width="10.5" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M13 9l4.5-2.5v7L13 11" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></span>
          30-minute video call
        </FloatChip>
        <FloatChip open={open} delay={610} className="bottom-[2%] left-[6%] lg:left-[10%]" float="-4s">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky text-ink"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></span>
          Mentors in {new Set(people.map((m) => m.country)).size > 1 ? "the UK, Gulf & beyond" : people[0].country}
        </FloatChip>
      </div>

      <Link href="/mentors" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5">
        Meet all the mentors <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function FloatChip({ open, delay, className, float, children }: { open: boolean; delay: number; className: string; float: string; children: ReactNode }) {
  return (
    <div className={`pointer-events-none absolute z-50 hidden sm:block ${className}`}
      style={{ opacity: open ? 1 : 0, transform: open ? "none" : "translateY(14px) scale(0.92)", transition: `opacity 600ms ease ${delay}ms, transform 700ms cubic-bezier(.2,.9,.3,1.2) ${delay}ms` }}>
      <span className="animate-float inline-flex items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3.5 text-sm font-medium text-ink shadow-[0_14px_30px_-16px_rgba(17,17,17,0.45)] ring-1 ring-black/5 backdrop-blur" style={{ ["--float-delay" as string]: float }}>
        {children}
      </span>
    </div>
  );
}
