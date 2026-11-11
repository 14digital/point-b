"use client";

import { useState } from "react";
import { Alert, Button, EmptyState, Field, Skeleton, Spinner } from "@/components/ui";
import { DateTile, Panel } from "@/components/dashboard";
import { api, errMsg } from "@/lib/api";
import { dayKey, fmtDay, fmtDayShort, fmtTime, groupByDay, localTz } from "@/lib/format";
import { useNow } from "@/lib/use-api";

export interface MySlot { id: string; startAt: string; endAt: string; isBooked: boolean; kind: Kind; capacity: number; seatsTaken: number; bookings: { reference: string; status: string }[] }
type Kind = "ONE_TO_ONE" | "GROUP";
type Tone = { tone: "success" | "error"; text: string };

const MAX_AT_ONCE = 1000;
const DAYS_SHOWN = 10;
const WEEK = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;
const LENGTHS = [["1", "1 month"], ["2", "2 months"], ["3", "3 months"]] as const;
type Length = (typeof LENGTHS)[number][0];

const TIMES = Array.from({ length: 48 }, (_, i) => ({ h: Math.floor(i / 2), m: (i % 2) * 30 }));
const PERIODS = [["Night", 0, 6], ["Morning", 6, 12], ["Afternoon", 12, 17], ["Evening", 17, 24]] as const;
const timeKey = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const timeLabel = (h: number, m: number) => `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The moment a clock time happens on a date, in the mentor's timezone (correct across daylight saving changes). */
const at = (day: Date, time: string) => { const [h, m] = time.split(":").map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m); };
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `months` calendar months after a date, stopping at the end of a shorter month (31 Jan + 1 month is 28 Feb, not 3 Mar). */
function addMonths(d: Date, months: number) {
  const last = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + months, Math.min(d.getDate(), last));
}

/** Every date from today, for the given number of months, that falls on one of the chosen weekdays. */
function matchingDates(days: number[], months: number) {
  const start = midnight(new Date());
  const end = addMonths(start, months);
  const out: Date[] = [];
  for (let d = start, i = 0; d < end; i++, d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)) if (days.includes(d.getDay())) out.push(d);
  return out;
}

/** "on Thu 12 Nov" for one day, "from Thu 12 Nov to Thu 10 Dec" for several. */
function span(times: Date[]) {
  const first = fmtDayShort(times[0].toISOString()), last = fmtDayShort(times[times.length - 1].toISOString());
  return first === last ? `on ${first}` : `from ${first} to ${last}`;
}

const publish = (times: Date[], kind: Kind, capacity: number) =>
  api<{ created: number }>("/mentors/me/slots", { body: { startTimes: times.map((t) => t.toISOString()), kind, ...(kind === "GROUP" ? { capacity } : {}) } });

/** How far ahead to repeat. Three equal buttons, so all of them stay visible on a phone. */
function LengthPicker({ value, onChange }: { value: Length; onChange: (l: Length) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="How long to repeat">
      {LENGTHS.map(([k, label]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={`h-9 whitespace-nowrap rounded-full border text-sm transition-colors ${value === k ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"}`}>{label}</button>)}
    </div>
  );
}

/** Half-hour times grouped by part of the day, so a whole evening is one tap. */
function TimeGrid({ picked, onChange, blocked }: { picked: string[]; onChange: (next: string[]) => void; blocked?: (time: string) => boolean }) {
  return (
    <div className="space-y-3">
      {PERIODS.map(([name, from, to]) => {
        const times = TIMES.filter(({ h }) => h >= from && h < to).map(({ h, m }) => ({ key: timeKey(h, m), label: timeLabel(h, m) }));
        const free = times.filter((t) => !blocked?.(t.key)).map((t) => t.key);
        const all = free.length > 0 && free.every((t) => picked.includes(t));
        return (
          <div key={name}>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs text-ink-soft">{name}</p>
              {free.length > 0 && <button type="button" onClick={() => onChange(all ? picked.filter((t) => !free.includes(t)) : [...new Set([...picked, ...free])])} className="text-xs font-medium text-ink underline-offset-4 hover:underline">{all ? "Clear" : "Select all"}</button>}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {times.map((t) => {
                const on = picked.includes(t.key);
                const off = !!blocked?.(t.key);
                return <button key={t.key} type="button" disabled={off} aria-pressed={on} onClick={() => onChange(on ? picked.filter((x) => x !== t.key) : [...picked, t.key])} className={`whitespace-nowrap rounded-full py-1.5 text-xs transition-colors ${on ? "bg-ink text-white" : off ? "cursor-not-allowed bg-paper text-ink-soft/40 line-through" : "bg-paper-dim text-ink hover:bg-line"}`}>{t.label}</button>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddAvailability({ existing, reload }: { existing: Set<number>; reload: () => unknown }) {
  const [mode, setMode] = useState<"weekly" | "date">("weekly");
  const [days, setDays] = useState<number[]>([]);
  const [length, setLength] = useState<Length>("1");
  const [date, setDate] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("ONE_TO_ONE");
  const [capacity, setCapacity] = useState(4);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Tone | null>(null);
  const today = dayKey(new Date().toISOString());
  const now = useNow();

  const chosenDay = date ? new Date(`${date}T12:00:00`) : null;
  const isFree = (t: Date) => t.getTime() > now && !existing.has(t.getTime());
  const dates = mode === "weekly" ? matchingDates(days, Number(length)) : chosenDay ? [chosenDay] : [];
  const times = dates.flatMap((d) => picked.map((t) => at(d, t))).filter(isFree).sort((a, b) => a.getTime() - b.getTime());
  const tooMany = times.length > MAX_AT_ONCE;
  const toggleDay = (d: number) => setDays((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d]);
  const setDayGroup = (group: number[]) => setDays(group);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      // The page may have been open a while: a time that has since passed would be refused.
      const future = times.filter((t) => t.getTime() > Date.now());
      const r = await publish(future, kind, capacity);
      setMsg({ tone: "success", text: `${plural(r.created, "slot")} published ${span(future)}.` });
      setPicked([]); setDays([]); await reload();
    } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }

  const ready = picked.length > 0 && dates.length > 0;
  return (
    <Panel title="Add availability">
      <p className="-mt-3 mb-5 text-xs text-ink-soft">Times are in your timezone ({localTz()}). Each slot is 30 minutes.</p>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-paper-dim p-1" role="group" aria-label="How to add times">
        {([["weekly", "Weekly schedule"], ["date", "One date"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => { setMode(k); setPicked([]); setMsg(null); }} className={`rounded-full py-2 text-sm font-medium transition-colors ${mode === k ? "bg-ink text-white" : "text-ink hover:bg-line"}`}>{label}</button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {([["ONE_TO_ONE", "1:1 session", "Private, full price"], ["GROUP", "Group session", "Lower price per mentee"]] as const).map(([k, label, hint]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-2xl border px-4 py-3 text-left text-xs transition-colors ${kind === k ? "border-ink bg-white ring-1 ring-ink" : "border-line bg-white hover:border-ink/30"}`}>
            <span className="block text-sm font-medium text-ink">{label}</span><span className="text-ink-soft">{hint}</span>
          </button>
        ))}
      </div>
      {kind === "GROUP" && <div className="mt-4"><Field label="Seats per group session" hint="2 to 10 mentees"><input type="number" className="input" min={2} max={10} value={capacity} onChange={(e) => setCapacity(Math.min(10, Math.max(2, Number(e.target.value) || 2)))} /></Field></div>}

      {mode === "weekly" ? (
        <>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Every</p>
              <div className="flex gap-3 text-xs font-medium text-ink">
                <button type="button" onClick={() => setDayGroup([1, 2, 3, 4, 5])} className="underline-offset-4 hover:underline">Weekdays</button>
                <button type="button" onClick={() => setDayGroup([6, 0])} className="underline-offset-4 hover:underline">Weekends</button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEK.map(([d, label]) => <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={`rounded-full border py-2 text-xs transition-colors ${days.includes(d) ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"}`}>{label}</button>)}
            </div>
          </div>
          <div className="mt-5"><p className="mb-2 text-sm font-medium text-ink">At these times</p><TimeGrid picked={picked} onChange={setPicked} /></div>
          <div className="mt-5"><p className="mb-2 text-sm font-medium text-ink">For the next</p><LengthPicker value={length} onChange={setLength} /></div>
        </>
      ) : (
        <>
          <div className="mt-5"><Field label="Date"><input type="date" className="input" min={today} value={date} onChange={(e) => { setDate(e.target.value); setPicked([]); }} /></Field></div>
          {chosenDay && <div className="mt-4"><TimeGrid picked={picked} onChange={setPicked} blocked={(t) => !isFree(at(chosenDay, t))} /></div>}
        </>
      )}

      {ready && (
        <p className="mt-5 rounded-2xl bg-paper px-4 py-3 text-xs leading-relaxed text-ink-soft">
          {times.length === 0 ? "All of these times are already published." : tooMany ? `That's ${times.length.toLocaleString("en-GB")} slots. Please publish up to ${MAX_AT_ONCE.toLocaleString("en-GB")} at a time: choose fewer days or a shorter period.` : <>Adds <span className="font-medium text-ink">{plural(times.length, "new slot")}</span> {span(times)}. Times you&rsquo;ve already published stay as they are.</>}
        </p>
      )}
      {msg && <div className="mt-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Button className="mt-5 w-full" disabled={busy || times.length === 0 || tooMany} onClick={submit}>{busy ? <Spinner /> : times.length && !tooMany ? `Publish ${plural(times.length, "slot")}` : "Publish slots"}</Button>
    </Panel>
  );
}

/** One day of published slots, with quick ways to repeat it weekly or clear it. */
function DayCard({ iso, slots, existing, reload, onNotice }: { iso: string; slots: MySlot[]; existing: Set<number>; reload: () => unknown; onNotice: (n: Tone) => void }) {
  const [panel, setPanel] = useState<null | "copy" | "clear">(null);
  const [length, setLength] = useState<Length>("1");
  const [busy, setBusy] = useState(false);
  const day = new Date(iso);
  const weekday = day.toLocaleDateString("en-GB", { weekday: "long" });
  const open = slots.filter((s) => !s.isBooked && s.seatsTaken === 0);

  // The same clock times on the same weekday in the following weeks, skipping any already published.
  const end = addMonths(midnight(day), Number(length));
  const weeks: Date[] = [];
  for (let i = 1; ; i++) { const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 7 * i); if (d >= end) break; weeks.push(d); }
  const copies = weeks.flatMap((d) => slots.map((s) => { const o = new Date(s.startAt); return { slot: s, at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), o.getHours(), o.getMinutes()) }; })).filter((c) => !existing.has(c.at.getTime()));

  async function run(work: () => Promise<Tone>) {
    setBusy(true);
    try { onNotice(await work()); setPanel(null); await reload(); } catch (e) { onNotice({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }
  const copy = () => run(async () => {
    // A day can mix 1:1 and group slots; each kind and size is published separately.
    const sets = new Map<string, typeof copies>();
    for (const c of copies) { const k = `${c.slot.kind}|${c.slot.capacity}`; sets.set(k, [...(sets.get(k) ?? []), c]); }
    let created = 0;
    for (const set of sets.values()) created += (await publish(set.map((c) => c.at), set[0].slot.kind, set[0].slot.capacity)).created;
    return { tone: "success", text: `${plural(created, "slot")} copied to every ${weekday}, up to ${fmtDayShort(weeks[weeks.length - 1].toISOString())}.` };
  });
  const clear = () => run(async () => {
    const r = await api<{ removed: number }>("/mentors/me/slots/remove", { body: { ids: open.map((s) => s.id) } });
    return { tone: "success", text: `${plural(r.removed, "open slot")} removed from ${fmtDayShort(iso)}.` };
  });
  async function remove(id: string) {
    try { await api(`/mentors/me/slots/${id}`, { method: "DELETE" }); await reload(); } catch (e) { onNotice({ tone: "error", text: errMsg(e) }); }
  }

  const action = "text-xs font-medium underline-offset-4 hover:underline";
  return (
    <div className="rounded-3xl bg-white p-4 ring-1 ring-line sm:p-5">
      <div className="flex gap-4">
        <div className="shrink-0 self-start"><DateTile iso={iso} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-ink">{fmtDay(iso)}</p>
          <div className="flex gap-4">
            <button type="button" aria-expanded={panel === "copy"} onClick={() => setPanel(panel === "copy" ? null : "copy")} className={`${action} text-ink`}>Repeat weekly</button>
            {open.length > 0 && <button type="button" aria-expanded={panel === "clear"} onClick={() => setPanel(panel === "clear" ? null : "clear")} className={`${action} text-ink-soft hover:text-rust`}>Clear day</button>}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {slots.map((s) => {
            const label = s.kind === "GROUP" ? ` · group ${s.seatsTaken}/${s.capacity}` : "";
            return s.isBooked
              ? <span key={s.id} className="rounded-full bg-mint px-3 py-1.5 text-xs text-forest" title="Fully booked">{fmtTime(s.startAt)}{label || " · booked"}</span>
              : s.seatsTaken > 0
              ? <span key={s.id} className="rounded-full bg-lemon px-3 py-1.5 text-xs text-ink" title="Has bookings">{fmtTime(s.startAt)}{label}</span>
              : <button key={s.id} onClick={() => remove(s.id)} className="group rounded-full bg-paper-dim px-3 py-1.5 text-xs text-ink transition-colors hover:bg-rust-pale hover:text-rust" title="Remove slot">{fmtTime(s.startAt)}{label} <span className="ml-1 opacity-40 group-hover:opacity-100">×</span></button>;
          })}
        </div>
      </div>
      </div>
        {panel === "copy" && (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="mb-2 text-sm text-ink">Copy these times to every {weekday} for the next</p>
            <LengthPicker value={length} onChange={setLength} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-soft">{copies.length ? `Adds ${plural(copies.length, "new slot")}, up to ${fmtDayShort(weeks[weeks.length - 1].toISOString())}.` : weeks.length ? "These times are already published for this period." : "Nothing to copy in this period."}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPanel(null)}>Cancel</Button>
                <Button size="sm" disabled={busy || !copies.length} onClick={copy}>{busy ? <Spinner /> : "Copy slots"}</Button>
              </div>
            </div>
          </div>
        )}
        {panel === "clear" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper p-4">
            <p className="text-sm text-ink">Remove {plural(open.length, "open slot")} from this day?{open.length < slots.length ? " Booked times stay." : ""}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPanel(null)}>Keep</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={clear}>{busy ? <Spinner /> : "Remove"}</Button>
            </div>
          </div>
        )}
    </div>
  );
}

export function Availability({ slots, loading, reload }: { slots: MySlot[] | null; loading: boolean; reload: () => unknown }) {
  const [notice, setNotice] = useState<Tone | null>(null);
  const [showAll, setShowAll] = useState(false);
  const all = slots ?? [];
  const byId = new Map(all.map((s) => [s.id, s]));
  const existing = new Set(all.map((s) => new Date(s.startAt).getTime()));
  const grouped = groupByDay(all.map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt })));
  const shown = showAll ? grouped : grouped.slice(0, DAYS_SHOWN);

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="min-w-0"><AddAvailability existing={existing} reload={reload} /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl text-ink">Your upcoming slots</h2>
          <div className="flex flex-wrap gap-3 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-paper-dim ring-1 ring-line" />Open</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-lemon" />Some seats taken</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-mint" />Booked</span>
          </div>
        </div>
        {notice && <div className="mt-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
        {loading && !slots ? <Skeleton className="mt-5 h-40 rounded-3xl" /> : grouped.length === 0 ? (
          <div className="mt-5"><EmptyState title="No slots published" description="Mentees can only book times you publish here." /></div>
        ) : (
          <div className="mt-5 space-y-3">
            {shown.map((g) => <DayCard key={g.key} iso={g.iso} slots={g.slots.map((s) => byId.get(s.id)!)} existing={existing} reload={reload} onNotice={setNotice} />)}
            {grouped.length > DAYS_SHOWN && <button type="button" onClick={() => setShowAll(!showAll)} className="w-full rounded-full border border-line bg-white py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30">{showAll ? "Show fewer days" : `Show all ${grouped.length} days`}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
