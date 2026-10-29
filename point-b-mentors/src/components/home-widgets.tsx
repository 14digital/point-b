"use client";

import Link from "next/link";
import { useRef } from "react";
import { MentorPhoto, Skeleton, pastelFor } from "./ui";
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
  if (!facets.data?.expertise.length) return null;
  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
      <span className="mr-2 shrink-0 text-sm text-white/75">Topics you can get help with:</span>
      {facets.data.expertise.slice(0, 6).map((x) => (
        <Link key={x} href={`/mentors?expertise=${encodeURIComponent(x)}`} className="shrink-0 rounded-full bg-white/15 px-4 py-2 text-sm text-white backdrop-blur-md transition-colors hover:bg-white/25">{x}</Link>
      ))}
      <Link href="/mentors" className="shrink-0 rounded-full bg-white/15 px-4 py-2 text-sm text-white backdrop-blur-md hover:bg-white/25">+ more</Link>
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

/** Two round portraits with sticker labels, for the "don't go it alone" section. */
export function MentorBubbles() {
  const { data } = useApi<{ items: MentorSummary[] }>("/mentors?limit=2&sort=rating");
  const people = data?.items ?? [];
  if (people.length < 2) return null;
  const [a, b] = people;
  return (
    <div className="relative mx-auto mt-16 grid max-w-4xl grid-cols-2 items-center gap-6 sm:gap-16">
      <div className="relative justify-self-end">
        <div className="animate-float h-44 w-44 overflow-hidden rounded-full sm:h-72 sm:w-72" style={{ backgroundColor: "var(--color-sky)" }}>
          <MentorPhoto name={a.name} photoUrl={a.photoUrl} className="h-full w-full" initialsClass="text-6xl sm:text-8xl" />
        </div>
        <span className="absolute -right-6 top-8 rotate-3 rounded-lg bg-peach px-3 py-1.5 text-sm font-medium text-ink shadow-sm sm:-right-10 sm:text-base">{a.expertise[0]}</span>
        <span className="absolute -right-2 top-20 -rotate-2 rounded-lg bg-white px-3 py-1.5 text-sm text-ink shadow-sm sm:top-24 sm:text-base">{a.title}</span>
      </div>
      <div className="relative justify-self-start sm:mt-24">
        <div className="animate-float h-44 w-44 overflow-hidden rounded-full sm:h-72 sm:w-72" style={{ backgroundColor: pastelFor(b.name), ["--float-delay" as string]: "-3s" }}>
          <MentorPhoto name={b.name} photoUrl={b.photoUrl} className="h-full w-full" initialsClass="text-6xl sm:text-8xl" />
        </div>
        <span className="absolute -left-4 bottom-10 -rotate-3 rounded-lg bg-sky px-3 py-1.5 text-sm font-medium text-ink shadow-sm sm:-left-10 sm:text-base">Top mentor</span>
      </div>
    </div>
  );
}
