"use client";

import { useState } from "react";
import { Panel } from "@/components/dashboard";
import { Empty, FinanceModal, SectionTitle, Sum, plural } from "@/components/finance-modal";
import { MentorPayoutsModal, type MentorDue } from "@/components/mentor-payouts";
import { LEVEL_LABEL } from "@/lib/constants";
import { formatMoney, currencyLabel } from "@/lib/format";
import type { Currency, Level } from "@/lib/types";

interface Tally { sessions: number; grossMinor: number; feeMinor: number | null; payoutMinor: number | null }
export interface FinanceSummary {
  currency: Currency; grossMinor: number; sessions: number;
  refundedMinor: number; refundedCount: number; unpaidCancelledMinor: number; unpaidCancelledCount: number;
  platformRevenueMinor: number | null; mentorPayoutsMinor: number | null; payoutsPaidMinor: number | null; payoutsDueMinor: number | null; listValueMinor: number; discountsMinor: number; repeatSessions: number;
  tiers: (Tally & { level: Level; currentPercent: number | null; rates: (Tally & { returning: boolean; percent: number | null })[] })[];
  kinds: (Tally & { kind: "ONE_TO_ONE" | "GROUP" })[];
  methods: (Tally & { method: string })[];
  mentors: MentorDue[];
  trend: { unit: "day" | "week" | "month"; points: { period: string; grossMinor: number; sessions: number }[] };
}

type Section = "gross" | "revenue" | "payouts";

const METHOD_LABEL: Record<string, string> = { stripe: "Card", bank: "Bank app / QR", mock: "Demo checkout", wallet: "POINT B balance", unknown: "Not recorded" };
const NOT_SET = "Not configured";
const percentOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const shortPercent = (n: number) => `${n.toFixed(1).replace(/\.0$/, "")}%`;

/** One currency's money for the period. Each main figure opens its own breakdown. */
export function FinanceBreakdown({ f, period, query, repeatPercent, onChanged, heldMinor }: { f: FinanceSummary; period: string; query: string; repeatPercent: number; onChanged: () => void; heldMinor: number }) {
  const [open, setOpen] = useState<Section | null>(null);
  const money = (v: number | null) => (v == null ? NOT_SET : formatMoney(v, f.currency));
  const share = f.platformRevenueMinor == null ? 0 : percentOf(f.platformRevenueMinor, f.grossMinor);
  return (
    <Panel className="flex flex-col">
      <span className={`self-start rounded-full px-3 py-1.5 text-xs font-medium text-ink ${f.currency === "PKR" ? "bg-mint" : f.currency === "GBP" ? "bg-sky" : "bg-lilac"}`}>{currencyLabel(f.currency)}</span>

      <button type="button" onClick={() => setOpen("gross")} className="group mt-6 flex items-end justify-between gap-4 rounded-2xl text-left">
        <span className="min-w-0">
          <span className="block text-sm text-ink-soft">Gross booking value</span>
          <span className="block font-display text-5xl leading-tight text-ink tabular-nums">{money(f.grossMinor)}</span>
          <span className="block text-xs text-ink-soft">{plural(f.sessions, "paid session")}</span>
        </span>
        <span className="mb-1 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-soft transition-colors group-hover:text-ink">View<Chevron /></span>
      </button>

      {f.trend.points.length > 1 && <Trend f={f} />}

      {f.platformRevenueMinor != null && f.grossMinor > 0 && (
        <div className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          <span className="h-full rounded-l-full bg-brass" style={{ width: `${share}%` }} />
          <span className="h-full flex-1 rounded-r-full bg-ink/15" />
        </div>
      )}

      <div className="mt-4 divide-y divide-line">
        <OpenRow label="Company revenue" dot="bg-brass" note={f.platformRevenueMinor != null && f.grossMinor > 0 ? `${shortPercent(share)} of gross` : undefined} value={money(f.platformRevenueMinor)} onClick={() => setOpen("revenue")} />
        <OpenRow label="Mentor payouts due" dot="bg-ink/25" note={f.payoutsPaidMinor ? `${money(f.payoutsPaidMinor)} already paid` : f.mentors.length ? plural(f.mentors.length, "mentor") : undefined} value={money(f.payoutsDueMinor)} onClick={() => setOpen("payouts")} />
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm">
        <Stat label="Promo discounts" value={money(f.discountsMinor)} />
        <Stat label="Returning-student sessions" value={String(f.repeatSessions)} />
        <Stat label="Credited to student balances" value={money(f.refundedMinor)} note={`${plural(f.refundedCount, "cancelled booking")}`} />
        <Stat label="Balances held, all students" value={money(heldMinor)} note="Owed as future sessions" />
        <Stat label="Cancelled before payment" value={money(f.unpaidCancelledMinor)} note={`${plural(f.unpaidCancelledCount, "booking")}, nothing received`} />
      </dl>

      {open === "gross" && <FinanceModal label="Gross booking value" eyebrow={`${currencyLabel(f.currency)} · ${period}`} title="Gross booking value" total={money(f.grossMinor)} totalNote={plural(f.sessions, "paid session")} onClose={() => setOpen(null)}><GrossDetail f={f} /></FinanceModal>}
      {open === "revenue" && <FinanceModal label="Company revenue" eyebrow={`${currencyLabel(f.currency)} · ${period}`} title="Company revenue" total={money(f.platformRevenueMinor)} totalNote={f.grossMinor > 0 && f.platformRevenueMinor != null ? `${shortPercent(share)} of ${money(f.grossMinor)} gross` : undefined} onClose={() => setOpen(null)}><RevenueDetail f={f} repeatPercent={repeatPercent} /></FinanceModal>}
      {open === "payouts" && <MentorPayoutsModal currency={f.currency} period={period} query={query} mentors={f.mentors} grossMinor={f.grossMinor} revenueMinor={f.platformRevenueMinor} payoutMinor={f.mentorPayoutsMinor} paidMinor={f.payoutsPaidMinor} dueMinor={f.payoutsDueMinor} onChanged={onChanged} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

const Chevron = () => <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function OpenRow({ label, note, value, dot, onClick }: { label: string; note?: string; value: string; dot: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-paper">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0 flex-1 text-sm text-ink">{label}{note && <span className="block text-xs text-ink-soft">{note}</span>}</span>
      <span className="whitespace-nowrap text-right font-medium text-ink tabular-nums">{value}</span>
      <span className="text-ink-soft transition-transform group-hover:translate-x-0.5"><Chevron /></span>
    </button>
  );
}

const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="min-w-0">
    <dt className="text-xs text-ink-soft">{label}</dt>
    <dd className="mt-0.5 text-ink tabular-nums">{value}</dd>
    {note && <dd className="text-xs text-ink-soft">{note}</dd>}
  </div>
);

function ShareList({ rows, total, currency }: { rows: { key: string; label: string; t: Tally }[]; total: number; currency: Currency }) {
  return (
    <ul className="space-y-4">
      {rows.map(({ key, label, t }) => (
        <li key={key} className={t.sessions ? "" : "text-ink-soft"}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className={t.sessions ? "text-ink" : ""}>{label}<span className="ml-2 text-xs text-ink-soft">{plural(t.sessions, "session")}</span></span>
            <span className="whitespace-nowrap tabular-nums">{formatMoney(t.grossMinor, currency)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-dim" aria-hidden><span className="block h-full rounded-full bg-ink/70" style={{ width: `${percentOf(t.grossMinor, total)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function GrossDetail({ f }: { f: FinanceSummary }) {
  const money = (v: number) => formatMoney(v, f.currency);
  if (!f.sessions) return <Empty>No paid sessions in this period.</Empty>;
  return (
    <>
      <section>
        <SectionTitle>How it adds up</SectionTitle>
        <Sum lines={[["Value before promo codes", money(f.listValueMinor)], ["Promo discounts", `− ${money(f.discountsMinor)}`], ["Gross booking value", money(f.grossMinor), true]]} />
      </section>
      <section>
        <SectionTitle>By session type</SectionTitle>
        <ShareList currency={f.currency} total={f.grossMinor} rows={f.kinds.map((k) => ({ key: k.kind, label: k.kind === "GROUP" ? "Group sessions" : "1:1 sessions", t: k }))} />
      </section>
      <section>
        <SectionTitle>By payment method</SectionTitle>
        <ShareList currency={f.currency} total={f.grossMinor} rows={f.methods.map((m) => ({ key: m.method, label: METHOD_LABEL[m.method] ?? m.method, t: m }))} />
      </section>
    </>
  );
}

function RevenueDetail({ f, repeatPercent }: { f: FinanceSummary; repeatPercent: number }) {
  const money = (v: number | null) => (v == null ? NOT_SET : formatMoney(v, f.currency));
  return (
    <section>
      <SectionTitle>By tier</SectionTitle>
      <ul className="space-y-3">
        {f.tiers.map((t) => (
          <li key={t.level} className="rounded-2xl border border-line p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{LEVEL_LABEL[t.level]}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{t.currentPercent == null ? "No commission set" : `${t.currentPercent}% commission`}{t.sessions ? ` · ${plural(t.sessions, "session")} · ${money(t.grossMinor)} gross` : " · No sessions"}</p>
              </div>
              <p className={`whitespace-nowrap font-display text-2xl leading-none tabular-nums ${t.sessions ? "text-ink" : "text-ink-soft"}`}>{money(t.feeMinor)}</p>
            </div>
            {t.rates.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-ink-soft">
                {t.rates.map((r) => (
                  <li key={`${r.returning}-${r.percent}`} className="flex justify-between gap-4">
                    <span>{r.returning ? "Returning students" : "Standard rate"} at {r.percent == null ? "no set rate" : `${r.percent}%`}, on {money(r.grossMinor)}</span>
                    <span className="whitespace-nowrap text-ink tabular-nums">{money(r.feeMinor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">Returning students are charged {repeatPercent}% on 1:1 sessions, unless their mentor&apos;s tier is already lower. A booking keeps the rate it was made at; bookings from before rates were saved use today&apos;s tier rate.</p>
    </section>
  );
}

/** Gross booked per day, week or month across the chosen dates. Hover or focus a bar for its figures. */
function Trend({ f }: { f: FinanceSummary }) {
  const [active, setActive] = useState<number | null>(null);
  const pts = f.trend.points;
  const max = Math.max(1, ...pts.map((p) => p.grossMinor));
  const label = (iso: string) => {
    const d = new Date(iso + "T12:00:00Z");
    return f.trend.unit === "month" ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : f.trend.unit === "week" ? `Week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  const shown = active != null ? pts[active] : null;
  const best = pts.reduce((b, p) => (p.grossMinor > b.grossMinor ? p : b), pts[0]);
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-soft">Gross by {f.trend.unit}</span>
        <span className="tabular-nums text-ink">{shown ? <>{label(shown.period)} · <span className="font-medium">{formatMoney(shown.grossMinor, f.currency)}</span> · {plural(shown.sessions, "session")}</> : best.grossMinor ? <span className="text-ink-soft">Best: {label(best.period)}, {formatMoney(best.grossMinor, f.currency)}</span> : <span className="text-ink-soft">No paid sessions yet</span>}</span>
      </div>
      <div className="mt-2 flex h-20 items-end gap-[2px] border-b border-line" role="img" aria-label={`Gross booking value by ${f.trend.unit}, highest ${formatMoney(best.grossMinor, f.currency)}`} onMouseLeave={() => setActive(null)}>
        {pts.map((p, i) => (
          <button key={p.period} type="button" tabIndex={-1} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} aria-label={`${label(p.period)}: ${formatMoney(p.grossMinor, f.currency)}`}
            className="group flex h-full min-w-0 flex-1 items-end">
            <span className={`block w-full rounded-t-[3px] transition-colors ${p.grossMinor ? (active === i ? "bg-ink" : "bg-ink/35 group-hover:bg-ink") : "bg-line"}`} style={{ height: p.grossMinor ? `${Math.max(6, (p.grossMinor / max) * 100)}%` : "2px" }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-soft"><span>{label(pts[0].period).replace(/^Week of /, "")}</span><span>{label(pts[pts.length - 1].period).replace(/^Week of /, "")}</span></div>
    </div>
  );
}
