"use client";

import { Alert, Container, SectionHeading, Button, Badge, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/use-api";
import { LEVEL_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import type { Currency, Level } from "@/lib/types";

interface Rule { level: Level; currency: Currency; priceMinor: number }

export default function PricingPage() {
  const { data, loading, error } = useApi<Rule[]>("/pricing");
  const levels = Object.keys(LEVEL_LABEL) as Level[];
  const price = (l: Level, c: Currency) => data?.find((r) => r.level === l && r.currency === c)?.priceMinor;

  return (
    <Container className="py-14">
      <SectionHeading eyebrow="Pricing" title="One clear price for every session"
        description="Every session is 30 minutes. Local mentors are priced in Pakistani Rupees; international mentors in British Pounds. A mentor's profile always shows the exact price before you book." />
      {error && <div className="mt-8"><Alert>{error}</Alert></div>}
      <div className="mt-12 grid gap-5 sm:grid-cols-3">
        {levels.map((l) => (
          <div key={l} className="rounded-3xl border border-line bg-white p-6">
            <p className="font-display text-lg text-ink">{LEVEL_LABEL[l]}</p>
            <div className="mt-4 space-y-2 text-sm">
              {(["PKR", "GBP"] as const).map((c) => (
                <div key={c} className="flex items-center justify-between rounded-lg bg-paper-dim px-3 py-2">
                  <span className="text-ink-soft">{c === "PKR" ? "Local mentor" : "International mentor"}</span>
                  {loading ? <Skeleton className="h-4 w-16" /> : <span className="font-medium text-ink">{price(l, c) != null ? formatMoney(price(l, c)!, c) : "—"}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-12 rounded-2xl border border-line bg-paper-dim/60 p-8">
        <div className="flex items-center gap-2"><p className="font-display text-lg text-ink">Bundles and credits</p><Badge tone="brass">Coming later</Badge></div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">Multi-session bundles, promotional codes and prepaid credits are planned for a later release. For now each session is booked and paid for individually, with taxes and processing fees shown before you confirm.</p>
      </div>
      <ul className="mt-10 grid gap-2.5 sm:grid-cols-2">
        {["The full 30-minute session with your chosen mentor", "A private meeting link on your dashboard", "Your preparation notes shared with the mentor ahead of the call", "Free rescheduling up to 2 days before the session"].map((i) => (
          <li key={i} className="flex gap-2.5 text-sm text-ink-soft"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brass" />{i}</li>
        ))}
      </ul>
      <Button href="/mentors" className="mt-10">Find a mentor</Button>
    </Container>
  );
}
