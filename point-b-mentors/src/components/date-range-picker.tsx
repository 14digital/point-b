"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Calendar days as "YYYY-MM-DD" in the viewer's timezone. `to` is the last day included. */
export interface DateRange { preset: PresetKey | "custom"; from: string | null; to: string | null }
type PresetKey = "this-week" | "this-month" | "last-month" | "this-year" | "all-time";

const PRESETS: [PresetKey, string][] = [["this-week", "This week"], ["this-month", "This month"], ["last-month", "Last month"], ["this-year", "This year"], ["all-time", "All time"]];
const DEFAULT_PRESET: PresetKey = "this-month";
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const validDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDay(parseDay(s)) === s;

function presetRange(preset: PresetKey): DateRange {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (preset === "all-time") return { preset, from: null, to: null };
  if (preset === "this-year") return { preset, from: toDay(new Date(y, 0, 1)), to: toDay(new Date(y, 11, 31)) };
  if (preset === "last-month") return { preset, from: toDay(new Date(y, m - 1, 1)), to: toDay(new Date(y, m, 0)) };
  if (preset === "this-week") {
    const monday = now.getDate() - ((now.getDay() + 6) % 7);
    return { preset, from: toDay(new Date(y, m, monday)), to: toDay(new Date(y, m, monday + 6)) };
  }
  return { preset, from: toDay(new Date(y, m, 1)), to: toDay(new Date(y, m + 1, 0)) };
}

/** The query string for a range: whole local days, with an exclusive end so the last day is fully included. */
export function rangeQuery(r: DateRange) {
  if (!r.from || !r.to) return "";
  const end = parseDay(r.to);
  end.setDate(end.getDate() + 1);
  return `from=${encodeURIComponent(parseDay(r.from).toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
}

/** "1 – 30 November 2026", dropping whatever the two ends share. */
export function rangeLabel(r: DateRange) {
  if (!r.from || !r.to) return "All time";
  const a = parseDay(r.from), b = parseDay(r.to);
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", o);
  if (r.from === r.to) return fmt(a, { day: "numeric", month: "long", year: "numeric" });
  if (a.getFullYear() !== b.getFullYear()) return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  if (a.getMonth() !== b.getMonth()) return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${a.getDate()} – ${fmt(b, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** The chosen range, kept in the URL so a refresh or a shared link shows the same period. */
export function useUrlDateRange(): [DateRange, (r: DateRange) => void] {
  const [range, setRange] = useState<DateRange>(() => {
    if (typeof window === "undefined") return presetRange(DEFAULT_PRESET);
    const q = new URLSearchParams(window.location.search);
    const from = q.get("from"), to = q.get("to");
    if (validDay(from) && validDay(to) && from <= to) return { preset: "custom", from, to };
    const known = PRESETS.find(([k]) => k === q.get("period"));
    return presetRange(known?.[0] ?? DEFAULT_PRESET);
  });
  const set = useCallback((r: DateRange) => {
    setRange(r);
    const url = new URL(window.location.href);
    url.searchParams.delete("period"); url.searchParams.delete("from"); url.searchParams.delete("to");
    if (r.preset === "custom") { url.searchParams.set("from", r.from!); url.searchParams.set("to", r.to!); }
    else if (r.preset !== DEFAULT_PRESET) url.searchParams.set("period", r.preset);
    window.history.replaceState(null, "", url);
  }, []);
  return [range, set];
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pill = (active: boolean) => `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${active ? "bg-ink font-medium text-white" : "text-ink-soft hover:text-ink"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-line" role="group" aria-label="Date range">
        {PRESETS.map(([k, label]) => <button key={k} type="button" aria-pressed={value.preset === k} onClick={() => { onChange(presetRange(k)); setOpen(false); }} className={pill(value.preset === k)}>{label}</button>)}
      </div>
      <div ref={box} className="relative">
        <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm ring-1 transition-colors ${value.preset === "custom" ? "bg-ink font-medium text-white ring-ink" : "bg-white text-ink ring-line hover:ring-ink/40"}`}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="3" y="4.5" width="14" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          {value.preset === "custom" ? rangeLabel(value) : "Custom dates"}
        </button>
        {open && <RangeCalendar value={value} onApply={(from, to) => { onChange({ preset: "custom", from, to }); setOpen(false); }} onCancel={() => setOpen(false)} />}
      </div>
    </div>
  );
}

function RangeCalendar({ value, onApply, onCancel }: { value: DateRange; onApply: (from: string, to: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState<string | null>(value.from);
  const [end, setEnd] = useState<string | null>(value.to);
  const [hover, setHover] = useState<string | null>(null);
  // The left-hand month; the right-hand one shows on wider screens.
  const [month, setMonth] = useState(() => { const d = value.from ? parseDay(value.from) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = toDay(new Date());

  function pick(day: string) {
    setHover(null);
    if (!start || end) { setStart(day); setEnd(null); return; }
    if (day < start) { setEnd(start); setStart(day); } else setEnd(day);
  }
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  // While choosing the end, preview the range under the pointer.
  const previewEnd = end ?? hover;
  const lo = start && previewEnd && previewEnd < start ? previewEnd : start;
  const hi = start && previewEnd && previewEnd < start ? start : previewEnd;

  const renderMonth = (first: Date, className = "") => {
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return (
      <div className={className}>
        <p className="mb-2 text-center text-sm font-medium text-ink">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <div className="grid grid-cols-7 text-center text-[0.7rem] text-ink-soft">{WEEKDAYS.map((d, i) => <span key={i} className="py-1">{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const day = toDay(new Date(first.getFullYear(), first.getMonth(), i + 1));
            const isEnd = day === lo || day === hi;
            const between = !!lo && !!hi && day > lo && day < hi;
            return (
              <span key={day} className={`${between || (isEnd && lo !== hi) ? "bg-paper-dim" : ""} ${day === lo && lo !== hi ? "rounded-l-full" : ""} ${day === hi && lo !== hi ? "rounded-r-full" : ""}`}>
                <button type="button" aria-label={parseDay(day).toLocaleDateString("en-GB", { dateStyle: "long" })} aria-pressed={isEnd} onClick={() => pick(day)} onMouseEnter={() => { if (start && !end) setHover(day); }}
                  className={`mx-auto block h-9 w-9 rounded-full text-sm tabular-nums transition-colors ${isEnd ? "bg-ink font-medium text-white" : `text-ink hover:bg-line ${day === today ? "ring-1 ring-ink/30" : ""}`}`}>{i + 1}</button>
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const arrow = (label: string, path: string, n: number) => (
    <button type="button" aria-label={label} onClick={() => shift(n)} className="grid h-8 w-8 place-items-center rounded-full text-ink ring-1 ring-line hover:ring-ink/40">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );

  return (
    <div role="dialog" aria-label="Choose a date range" className="absolute right-0 top-full z-30 mt-2 w-[min(19.5rem,calc(100vw-2.5rem))] rounded-3xl bg-white p-4 shadow-xl ring-1 ring-line sm:w-[37rem] sm:p-5 max-sm:left-0 max-sm:right-auto">
      <div className="mb-2 flex items-center justify-between">
        {arrow("Previous month", "M12.5 4.5 7 10l5.5 5.5", -1)}
        <p className="text-xs text-ink-soft">{!start ? "Choose the first day" : !end ? "Now choose the last day" : rangeLabel({ preset: "custom", from: start, to: end })}</p>
        {arrow("Next month", "M7.5 4.5 13 10l-5.5 5.5", 1)}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {renderMonth(month)}
        {renderMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1), "hidden sm:block")}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-1.5 text-sm text-ink ring-1 ring-line hover:ring-ink/40">Cancel</button>
        <button type="button" disabled={!start || !end} onClick={() => onApply(start!, end!)} className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
      </div>
    </div>
  );
}
