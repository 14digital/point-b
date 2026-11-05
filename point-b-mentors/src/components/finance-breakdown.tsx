"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Panel } from "@/components/dashboard";
import { pastelFor } from "@/components/ui";
import { LEVEL_LABEL } from "@/lib/constants";
import { formatMoney, initials } from "@/lib/format";
import type { Currency, Level } from "@/lib/types";

interface Tally { sessions: number; grossMinor: number; feeMinor: number | null; payoutMinor: number | null }
export interface FinanceSummary {
  currency: Currency; grossMinor: number; sessions: number;
  refundedMinor: number; refundedCount: number; unpaidCancelledMinor: number; unpaidCancelledCount: number;
  platformRevenueMinor: number | null; mentorPayoutsMinor: number | null; listValueMinor: number; discountsMinor: number; repeatSessions: number;
  tiers: (Tally & { level: Level; currentPercent: number | null; rates: (Tally & { returning: boolean; percent: number | null })[] })[];
  kinds: (Tally & { kind: "ONE_TO_ONE" | "GROUP" })[];
  methods: (Tally & { method: string })[];
  mentors: (Tally & { id: string; name: string; level: Level })[];
}

type Section = "gross" | "revenue" | "payouts";

const METHOD_LABEL: Record<string, string> = { stripe: "Card", bank: "Bank app / QR", mock: "Demo checkout", unknown: "Not recorded" };
const CURRENCY_LABEL: Record<Currency, string> = { PKR: "Local · PKR", GBP: "International · GBP" };
const NOT_SET = "Not configured";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const percentOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const shortPercent = (n: number) => `${n.toFixed(1).replace(/\.0$/, "")}%`;

/** One currency's money for the period. Each main figure opens its own breakdown. */
export function FinanceBreakdown({ f, period, repeatPercent }: { f: FinanceSummary; period: string; repeatPercent: number }) {
  const [open, setOpen] = useState<Section | null>(null);
  const money = (v: number | null) => (v == null ? NOT_SET : formatMoney(v, f.currency));
  const share = f.platformRevenueMinor == null ? 0 : percentOf(f.platformRevenueMinor, f.grossMinor);
  return (
    <Panel className="flex flex-col">
      <span className={`self-start rounded-full px-3 py-1.5 text-xs font-medium text-ink ${f.currency === "PKR" ? "bg-mint" : "bg-sky"}`}>{CURRENCY_LABEL[f.currency]}</span>

      <button type="button" onClick={() => setOpen("gross")} className="group mt-6 flex items-end justify-between gap-4 rounded-2xl text-left">
        <span className="min-w-0">
          <span className="block text-sm text-ink-soft">Gross booking value</span>
          <span className="block font-display text-5xl leading-tight text-ink tabular-nums">{money(f.grossMinor)}</span>
          <span className="block text-xs text-ink-soft">{plural(f.sessions, "paid session")}</span>
        </span>
        <span className="mb-1 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-soft transition-colors group-hover:text-ink">View<Chevron /></span>
      </button>

      {f.platformRevenueMinor != null && f.grossMinor > 0 && (
        <div className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          <span className="h-full rounded-l-full bg-brass" style={{ width: `${share}%` }} />
          <span className="h-full flex-1 rounded-r-full bg-ink/15" />
        </div>
      )}

      <div className="mt-4 divide-y divide-line">
        <OpenRow label="Company revenue" dot="bg-brass" note={f.platformRevenueMinor != null && f.grossMinor > 0 ? `${shortPercent(share)} of gross` : undefined} value={money(f.platformRevenueMinor)} onClick={() => setOpen("revenue")} />
        <OpenRow label="Mentor payouts due" dot="bg-ink/25" note={f.mentors.length ? plural(f.mentors.length, "mentor") : undefined} value={money(f.mentorPayoutsMinor)} onClick={() => setOpen("payouts")} />
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm">
        <Stat label="Promo discounts" value={money(f.discountsMinor)} />
        <Stat label="Returning-student sessions" value={String(f.repeatSessions)} />
        <Stat label="Refunded after payment" value={money(f.refundedMinor)} note={plural(f.refundedCount, "booking")} />
        <Stat label="Cancelled before payment" value={money(f.unpaidCancelledMinor)} note={`${plural(f.unpaidCancelledCount, "booking")}, nothing received`} />
      </dl>

      {open === "gross" && <Modal f={f} period={period} title="Gross booking value" total={money(f.grossMinor)} totalNote={plural(f.sessions, "paid session")} onClose={() => setOpen(null)}><GrossDetail f={f} /></Modal>}
      {open === "revenue" && <Modal f={f} period={period} title="Company revenue" total={money(f.platformRevenueMinor)} totalNote={f.grossMinor > 0 && f.platformRevenueMinor != null ? `${shortPercent(share)} of ${money(f.grossMinor)} gross` : undefined} onClose={() => setOpen(null)}><RevenueDetail f={f} repeatPercent={repeatPercent} /></Modal>}
      {open === "payouts" && <Modal f={f} period={period} title="Mentor payouts due" total={money(f.mentorPayoutsMinor)} totalNote={f.mentors.length ? `Across ${plural(f.mentors.length, "mentor")}` : undefined} onClose={() => setOpen(null)}><PayoutDetail f={f} /></Modal>}
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

function Modal({ f, period, title, total, totalNote, onClose, children }: { f: FinanceSummary; period: string; title: string; total: string; totalNote?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        <header className="border-b border-line px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">{CURRENCY_LABEL[f.currency]} · {period}</p>
              <h2 className="mt-1.5 text-sm text-ink-soft">{title}</h2>
            </div>
            <button autoFocus onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft hover:bg-paper-dim hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
          <p className="font-display text-[2.75rem] leading-tight text-ink tabular-nums">{total}</p>
          {totalNote && <p className="text-sm text-ink-soft">{totalNote}</p>}
        </header>
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const SectionTitle = ({ children }: { children: ReactNode }) => <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{children}</h3>;
const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-2xl bg-paper px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;

/** A sum written out: each part, then the result. */
function Sum({ lines }: { lines: [string, string, boolean?][] }) {
  return (
    <dl className="rounded-2xl bg-paper px-4 py-2 text-sm">
      {lines.map(([label, value, total]) => (
        <div key={label} className={`flex justify-between gap-4 py-2 ${total ? "border-t border-line font-medium text-ink" : "text-ink-soft"}`}>
          <dt>{label}</dt><dd className="whitespace-nowrap tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

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

function PayoutDetail({ f }: { f: FinanceSummary }) {
  const money = (v: number | null) => (v == null ? NOT_SET : formatMoney(v, f.currency));
  if (!f.sessions) return <Empty>No payouts due for this period.</Empty>;
  return (
    <>
      <section>
        <SectionTitle>How it adds up</SectionTitle>
        <Sum lines={[["Gross booking value", money(f.grossMinor)], ["Company revenue", f.platformRevenueMinor == null ? NOT_SET : `− ${money(f.platformRevenueMinor)}`], ["Mentor payouts due", money(f.mentorPayoutsMinor), true]]} />
      </section>
      <section>
        <SectionTitle>By mentor</SectionTitle>
        <ul className="divide-y divide-line">
          {f.mentors.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium text-ink" style={{ backgroundColor: pastelFor(m.name) }}>{initials(m.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                <p className="truncate text-xs text-ink-soft">{LEVEL_LABEL[m.level]} · {plural(m.sessions, "session")} · {money(m.grossMinor)} gross</p>
              </div>
              <p className="whitespace-nowrap text-sm font-medium text-ink tabular-nums">{money(m.payoutMinor)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
