import { currencyLabel } from "@/lib/format";
import type { Currency } from "@/lib/types";

/** A quiet line saying prices are shown in the visitor's own currency. Nothing shows when no conversion was needed. */
export function PriceNote({ currency, from, className = "" }: { currency?: Currency | null; from?: "PKR" | "GBP" | null; className?: string }) {
  if (!currency || !from) return null;
  return (
    <p className={`flex items-center gap-1.5 text-xs text-ink-soft ${className}`}>
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5M10 2.5c-2 2.2-3 4.7-3 7.5s1 5.3 3 7.5" stroke="currentColor" strokeWidth="1.3" /></svg>
      Prices in {currencyLabel(currency).split(" · ")[0]}, converted at today&rsquo;s rate
    </p>
  );
}
