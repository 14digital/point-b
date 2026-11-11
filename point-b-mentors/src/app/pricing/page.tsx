"use client";

import type { ReactNode } from "react";
import { Alert, Badge, Button, Container, Mark, Skeleton } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useApi } from "@/lib/use-api";
import { LEVEL_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { PriceNote } from "@/components/price-note";
import type { Currency, Level } from "@/lib/types";
import { NoticeText } from "@/lib/policy";

interface Tier { level: Level; currency: Currency; priceMinor: number; minMinor: number; maxMinor: number }
interface LocalTier { level: Level; from: "PKR" | "GBP"; currency: Currency; minMinor: number; maxMinor: number }
interface Pricing { tiers: Tier[]; groupPercent: number; local: { country: string | null; currency: Currency; tiers: LocalTier[] } | null }

const TIERS: { level: Level; tone: string; who: string; good: string }[] = [
  { level: "PROFESSIONAL", tone: "bg-sky", who: "Established in their field", good: "Career starts, first moves and practical day-to-day advice." },
  { level: "SENIOR_SPECIALIST", tone: "bg-mint", who: "Deep expertise, often leading others", good: "Specialist questions, stepping up and leading a team." },
  { level: "EXECUTIVE", tone: "bg-lilac", who: "Senior leadership experience", good: "Big decisions, senior roles and how an industry really works." },
];

const INCLUDED = [
  "The full 30 minutes with your chosen mentor",
  "A private video call on POINT B, no download needed",
  "Your preparation notes shared with the mentor beforehand",
  "Cancel for a full refund, or reschedule free, up to {notice} before",
];

/** "Rs 1,000 – 2,000" or "£25 – 35"; a single price when the range is one value. */
function range(min: number, max: number, c: Currency) {
  if (min === max) return formatMoney(min, c);
  return `${formatMoney(min, c)} – ${formatMoney(max, c).replace(/^[^\d]+/, "")}`;
}

export default function PricingPage() {
  const { data, loading, error } = useApi<Pricing>("/pricing");
  const tier = (l: Level, c: Currency) => data?.tiers.find((t) => t.level === l && t.currency === c);
  const group = data?.groupPercent;

  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-mint/50 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-[460px] h-[360px] w-[360px] rounded-full bg-lilac/40 blur-[120px]" />

      {/* Hero */}
      <Container className="relative pb-14 pt-16 sm:pt-24">
        <p className="animate-rise text-sm font-medium text-brass-dark">Pricing</p>
        <h1 className="animate-rise mt-4 max-w-4xl font-display text-[3.2rem] leading-[1] text-ink sm:text-7xl lg:text-[5.5rem]" style={{ ["--rise-delay" as string]: "60ms" }}>
          Fair prices, <Mark color="mint">set by experience</Mark>
        </h1>
        <p className="animate-rise mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "120ms" }}>
          Every session is 30 minutes. Mentors are grouped into three tiers by experience, and each tier has its own price. Prices are shown in your own currency, and you always see a mentor&rsquo;s exact price before you book.
        </p>

        <dl className="animate-rise mt-14 grid grid-cols-2 overflow-hidden rounded-3xl bg-white/80 ring-1 ring-ink/5 backdrop-blur sm:grid-cols-4" style={{ ["--rise-delay" as string]: "180ms" }}>
          {[["30 min", "every session"], ["3 tiers", "priced by experience"], [data?.local ? data.local.currency : "PKR · GBP", data?.local ? "in your currency" : "local and international"], [group ? `${100 - group}% less` : "Lower", "per seat in a group"]].map(([v, l], i) => (
            <div key={l} className={`px-6 py-5 ${i ? "sm:border-l" : ""} ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t sm:border-t-0" : ""} border-line`}>
              <dt className="sr-only">{l}</dt>
              <dd className="whitespace-nowrap text-xl font-semibold tracking-[-0.02em] text-ink tabular-nums sm:text-2xl">{v}</dd>
              <dd className="mt-1 text-xs text-ink-soft">{l}</dd>
            </div>
          ))}
        </dl>
      </Container>

      {/* Tiers */}
      <Container className="relative pb-20 sm:pb-24">
        {error && <div className="mb-6"><Alert>{error}</Alert></div>}
        <div className="grid gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <Reveal key={t.level} delay={i * 70} className="flex h-full flex-col rounded-[1.75rem] bg-white p-7 ring-1 ring-ink/[0.06] shadow-[0_1px_2px_rgba(17,17,17,0.04)] transition-shadow hover:shadow-[0_24px_60px_-36px_rgba(17,17,17,0.35)] sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full ${t.tone} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/80`}>Tier {i + 1}</span>
                <span className="text-xs font-medium text-ink-soft">30-min session</span>
              </div>
              <h2 className="mt-6 font-display text-[2rem] font-normal leading-[1.1] tracking-[-0.02em] text-ink">{LEVEL_LABEL[t.level]}</h2>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-soft">{t.who}</p>

              <dl className="mt-7 divide-y divide-line overflow-hidden rounded-2xl bg-paper/70 ring-1 ring-ink/[0.04]">
                {(["PKR", "GBP"] as const).map((c) => {
                  const r = tier(t.level, c);
                  const own = data?.local?.tiers.find((x) => x.level === t.level && x.from === c);
                  const shown = own ? own.currency : c;
                  return (
                    <div key={c} className="px-5 py-4">
                      <dt className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-ink-soft">{c === "PKR" ? "Local mentor" : "International mentor"}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 font-medium text-ink-soft ring-1 ring-ink/[0.06]">{shown}</span>
                      </dt>
                      <dd className="mt-2">
                        {loading || !r ? <Skeleton className="h-7 w-36" /> : (
                          <span className="whitespace-nowrap text-[clamp(1.2rem,1.9vw,1.6rem)] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums">{own ? range(own.minMinor, own.maxMinor, shown) : range(r.minMinor, r.maxMinor, c)}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <div className="mt-7 flex-1 border-t border-line pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Good for</p>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{t.good}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <PriceNote currency={data?.local?.currency} from={data?.local ? "GBP" : null} className="mt-5" />
        <p className="mt-2 text-sm text-ink-soft">Each mentor&rsquo;s exact price is shown on their profile. There are no hidden fees: any tax or processing fee is shown before you pay.</p>
      </Container>

      {/* How prices work + group */}
      <Container className="relative pb-20 sm:pb-24">
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal className="flex h-full flex-col rounded-[2rem] bg-white p-8 ring-1 ring-ink/5 sm:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">What&rsquo;s included</p>
            <p className="mt-4 font-display text-4xl text-ink">Every session, every tier</p>
            <ul className="mt-6 space-y-3 text-sm text-ink">
              {INCLUDED.map((x) => <Check key={x}><NoticeText text={x} /></Check>)}
            </ul>
          </Reveal>
          <Reveal delay={80} className="flex h-full flex-col rounded-[2rem] bg-lilac p-8 sm:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Group sessions</p>
            <p className="mt-4 font-display text-4xl text-ink">Share the call, pay less</p>
            <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-ink/70">
              Some mentors also offer small group sessions. A seat costs {group ? <span className="font-medium text-ink">{group}% of that mentor&rsquo;s 1:1 price</span> : "less than a 1:1 session"}, and you still get the same attention and hear other students&rsquo; questions too.
            </p>
            {group && !data?.local && <p className="mt-6 rounded-2xl bg-white/60 px-5 py-4 text-sm text-ink">Example: a Rs 2,000 mentor&rsquo;s group seat is {formatMoney(Math.max(100, Math.round((200_000 * group) / 100 / 100) * 100), "PKR")}.</p>}
          </Reveal>
        </div>
      </Container>

      {/* Coming later */}
      <Container className="relative pb-20 sm:pb-24">
        <Reveal className="flex flex-wrap items-start justify-between gap-6 rounded-[2rem] bg-paper-dim/70 p-8 ring-1 ring-ink/5 sm:p-10">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3"><p className="font-display text-3xl text-ink">Bundles and credits</p><Badge tone="brass">Coming later</Badge></div>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">Multi-session bundles, promotional codes and prepaid credits are planned for a later release. For now each session is booked and paid for on its own.</p>
          </div>
        </Reveal>
      </Container>

      {/* Closing CTA */}
      <Container className="relative pb-8">
        <Reveal className="rounded-[2.25rem] bg-ink px-8 py-16 text-center text-white sm:px-16 sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-5xl leading-[1.02] sm:text-6xl">Find a mentor in your budget</h2>
          <p className="mx-auto mt-5 max-w-lg text-white/65">Filter by price, level and expertise, and see each mentor&rsquo;s exact price before you book.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button href="/mentors" variant="light" size="lg">Browse mentors</Button>
            <Button href="/how-it-works" variant="glass" size="lg">How it works</Button>
          </div>
        </Reveal>
      </Container>
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {children}
    </li>
  );
}
