"use client";

import type { ReactNode } from "react";
import { Container } from "./ui";

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

/** Top band of a dashboard: eyebrow, large greeting, subtitle and actions. */
export function DashboardHero({ eyebrow, title, subtitle, actions, children }: { eyebrow: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-line bg-white">
      <Container className="py-10 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="animate-rise">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">{eyebrow}</div>
            <h1 className="mt-3 font-display text-5xl leading-[1.02] text-ink sm:text-6xl">{title}</h1>
            {subtitle && <p className="mt-3 max-w-xl text-ink-soft">{subtitle}</p>}
          </div>
          {actions && <div className="animate-rise flex flex-wrap gap-2" style={{ ["--rise-delay" as string]: "120ms" }}>{actions}</div>}
        </div>
        {children}
      </Container>
    </section>
  );
}

const TONES = { peach: "bg-peach", sky: "bg-sky", mint: "bg-mint", lemon: "bg-lemon", lilac: "bg-lilac", white: "bg-paper-dim" } as const;

export function StatTile({ label, value, note, tone = "white", delay = 0 }: { label: string; value: ReactNode; note?: ReactNode; tone?: keyof typeof TONES; delay?: number }) {
  return (
    <div className={`animate-rise rounded-3xl p-5 sm:p-6 ${TONES[tone]}`} style={{ ["--rise-delay" as string]: `${delay}ms` }}>
      <p className="text-sm text-ink/70">{label}</p>
      <p className="mt-2 font-display text-4xl leading-none text-ink sm:text-[2.75rem]">{value}</p>
      {note && <p className="mt-2 text-xs leading-relaxed text-ink/60">{note}</p>}
    </div>
  );
}

/** Calendar-style date block: month, day number, weekday. */
export function DateTile({ iso, dark = false }: { iso: string; dark?: boolean }) {
  const d = new Date(iso);
  return (
    <div className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded-2xl py-2.5 ${dark ? "bg-white/10 text-white" : "bg-paper-dim text-ink"}`}>
      <span className="text-[11px] font-medium uppercase tracking-wider opacity-70">{d.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="font-display text-3xl leading-tight">{d.getDate()}</span>
      <span className="text-[11px] opacity-70">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
    </div>
  );
}

/** Pill-style tab switcher with optional counts. */
export function Tabs<T extends string>({ tabs, value, onChange, counts = {} }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-paper-dim p-1" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={value === t} onClick={() => onChange(t)}
          className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${value === t ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
          {t}
          {counts[t] !== undefined && <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${value === t ? "bg-ink text-white" : "bg-white/70 text-ink-soft"}`}>{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}

/** White rounded card with an optional title row. */
export function Panel({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-white p-6 ring-1 ring-line sm:p-7 ${className}`}>
      {(title || action) && <div className="mb-5 flex items-center justify-between gap-4">{title && <h2 className="font-display text-2xl text-ink">{title}</h2>}{action}</div>}
      {children}
    </div>
  );
}

/** "in 3 days", "in 2 h", "in 12 min", "now". */
export function relative(iso: string, now: number) {
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m <= 0) return "now";
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  if (h < 36) return `in ${h} h`;
  return `in ${Math.round(h / 24)} days`;
}
