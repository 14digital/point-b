import Link from "next/link";
import type { MentorSummary } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fmtDayShort, formatMoney } from "@/lib/format";
import { MentorPhoto } from "./ui";

/** Tall photo card: headshot with rating chips, name over a soft gradient, price and booking below. */
export function MentorCard({ mentor: m, className = "" }: { mentor: MentorSummary; className?: string }) {
  const top = m.rating !== null && m.rating >= 4.8 && m.reviewCount >= 1;
  return (
    <Link href={`/mentors/${m.slug}`} className={`group flex flex-col overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-line transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(17,17,17,0.35)] ${className}`}>
      <div className="relative aspect-[4/5] overflow-hidden">
        <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-ink">
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L10 1.5z" /></svg>
            {m.rating ? m.rating.toFixed(1) : "New"}
          </span>
          {top && <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-forest">Top mentor</span>}
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs text-ink">{CATEGORY_LABEL[m.category]}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-5 pt-20 text-white">
          <p className="flex items-center gap-1.5 font-display text-[1.7rem] leading-tight">
            {m.name}
            {m.verified && <svg width="16" height="16" viewBox="0 0 20 20" className="shrink-0 text-sky" aria-label="Verified"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="M6 10.3l2.6 2.6L14 7.6" stroke="#111" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </p>
          <p className="mt-1 line-clamp-1 text-sm text-white/80">{m.title} · {m.organization}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">{formatMoney(m.priceMinor, m.currency)} <span className="font-normal text-ink-soft">/ 30 min</span></p>
          <p className="truncate text-xs text-ink-soft">
            {m.nextAvailable ? `Next: ${fmtDayShort(m.nextAvailable)}` : "No open times"} · Group from {formatMoney(m.groupPriceMinor, m.currency)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-ink-soft">Book a call</span>
      </div>
      {m.isDemo && <p className="-mt-2 px-5 pb-3 text-[10px] uppercase tracking-wide text-ink-soft">Demo profile</p>}
    </Link>
  );
}
