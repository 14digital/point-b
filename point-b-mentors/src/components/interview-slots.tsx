"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Skeleton, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/use-api";

interface Slot { time: string; startAt: string; state: "open" | "taken" | "current"; takenBy?: string }
interface SlotCalendar { timezone: string; configured: boolean; days: { date: string; slots: Slot[] }[] }
interface SlotSettings { timezone: string; weekly: string[][] }

const PAGE_DAYS = 7;
/** Sunday is index 0 in the saved settings; the week reads Monday first. */
const WEEK = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const PERIODS = [["Morning", "06:00", "12:00"], ["Afternoon", "12:00", "17:00"], ["Evening", "17:00", "22:00"], ["Night", "22:00", "06:00"]] as const;
const inPeriod = (t: string, from: string, to: string) => (from < to ? t >= from && t < to : t >= from || t < to);

const clock = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return { text: `${h % 12 || 12}:${String(m).padStart(2, "0")}`, ampm: h < 12 ? "AM" : "PM" };
};
const plusHalfHour = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  const end = (h * 60 + m + 30) % 1440;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
};
/** "1:00 – 1:30 PM", or "11:30 AM – 12:00 PM" across noon. */
export function slotLabel(time: string) {
  const a = clock(time), b = clock(plusHalfHour(time));
  return a.ampm === b.ampm ? `${a.text} – ${b.text} ${b.ampm}` : `${a.text} ${a.ampm} – ${b.text} ${b.ampm}`;
}
const dayPart = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Pick a half-hour slot. Occupied slots stay visible but can't be chosen. */
export function InterviewSlotPicker({ applicationId, value, onChange }: { applicationId: string; value: string; onChange: (startAt: string) => void }) {
  const [from, setFrom] = useState<string | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const cal = useApi<SlotCalendar>(`/admin/interview-slots?days=${PAGE_DAYS}&applicationId=${applicationId}${from ? `&from=${from}` : ""}`);
  const days = useMemo(() => cal.data?.days ?? [], [cal.data]);
  const firstDate = days[0]?.date;
  const firstOpen = days.find((d) => d.slots.some((s) => s.state === "open"))?.date;
  const day = days.find((d) => d.date === chosenDay) ?? days.find((d) => d.date === firstOpen) ?? days[0];
  const selected = days.flatMap((d) => d.slots.map((s) => ({ date: d.date, time: s.time, startAt: s.startAt }))).find((s) => s.startAt === value);

  // The chosen slot may have been taken or removed since it was picked.
  useEffect(() => {
    if (value && cal.data && !days.some((d) => d.slots.some((s) => s.startAt === value && s.state === "open"))) onChange("");
  }, [cal.data, days, value, onChange]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Choose a slot <span className="font-normal text-ink-soft">· 30 minutes · {cal.data?.timezone.replaceAll("_", " ")} time</span></p>
        <button type="button" onClick={() => setCustomizing(!customizing)} aria-expanded={customizing} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40">{customizing ? "Close slot settings" : "Customize slots"}</button>
      </div>

      {customizing && <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5"><InterviewSlotEditor onSaved={() => cal.reload()} /></div>}
      {cal.error && <div className="mt-3"><Alert>{cal.error}</Alert></div>}
      {cal.loading && !cal.data && <Skeleton className="mt-3 h-48 rounded-2xl" />}

      {cal.data && !cal.data.configured && !customizing && (
        <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-ink-soft">No slots are set up yet. Use Customize slots to choose which ones to offer.</p>
      )}

      {cal.data?.configured && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <PageButton label="Earlier days" disabled={!from} onClick={() => { const prev = addDays(firstDate!, -PAGE_DAYS); setFrom(prev <= new Date().toISOString().slice(0, 10) ? null : prev); setChosenDay(null); onChange(""); }} path="M12.5 4.5 7 10l5.5 5.5" />
            <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5 sm:grid-cols-7">
              {days.map((d) => {
                const open = d.slots.filter((s) => s.state === "open").length;
                const active = d.date === day?.date;
                return (
                  <button key={d.date} type="button" aria-pressed={active} onClick={() => setChosenDay(d.date)} className={`rounded-xl px-1 py-2 text-center transition-colors ${active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-line hover:ring-ink/40"}`}>
                    <span className={`block text-[0.7rem] uppercase tracking-wide ${active ? "text-white/70" : "text-ink-soft"}`}>{dayPart(d.date, { weekday: "short" })}</span>
                    <span className="block font-display text-xl leading-tight">{dayPart(d.date, { day: "numeric" })}</span>
                    <span className={`block text-[0.7rem] ${active ? "text-white/70" : open ? "text-forest" : "text-ink-soft"}`}>{open ? `${open} open` : "None"}</span>
                  </button>
                );
              })}
            </div>
            <PageButton label="Later days" onClick={() => { setFrom(addDays(firstDate!, PAGE_DAYS)); setChosenDay(null); onChange(""); }} path="M7.5 4.5 13 10l-5.5 5.5" />
          </div>

          {day && (
            <div className="mt-4">
              <p className="text-sm text-ink-soft">{dayPart(day.date, { weekday: "long", day: "numeric", month: "long" })}</p>
              {day.slots.length === 0 ? (
                <p className="mt-2 rounded-xl bg-white px-4 py-3 text-sm text-ink-soft">No slots left on this day.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {day.slots.map((s) => {
                    const isChosen = s.startAt === value;
                    const pickable = s.state === "open";
                    return (
                      <button key={s.startAt} type="button" disabled={!pickable} aria-pressed={isChosen} onClick={() => onChange(isChosen ? "" : s.startAt)}
                        className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${isChosen ? "bg-ink font-medium text-white" : pickable ? "bg-white text-ink ring-1 ring-line hover:ring-ink/50" : s.state === "current" ? "cursor-not-allowed bg-lemon/70 text-ink" : "cursor-not-allowed bg-paper-dim text-ink-soft"}`}>
                        <span className={`block ${s.state === "taken" ? "line-through" : ""}`}>{slotLabel(s.time)}</span>
                        {s.state === "taken" && <span className="block truncate text-xs">Taken · {s.takenBy}</span>}
                        {s.state === "current" && <span className="block text-xs text-ink-soft">Current time</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {selected && <p className="mt-3 text-sm font-medium text-ink">Selected: {dayPart(selected.date, { weekday: "short", day: "numeric", month: "short" })}, {slotLabel(selected.time)}</p>}
        </>
      )}
    </div>
  );
}

function PageButton({ label, path, disabled, onClick }: { label: string; path: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink ring-1 ring-line hover:ring-ink/40 disabled:cursor-not-allowed disabled:opacity-40">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

/** Which half-hour slots are offered on each day of the week. */
export function InterviewSlotEditor({ onSaved }: { onSaved?: () => void }) {
  const saved = useApi<SlotSettings>("/admin/interview-slots/settings");
  const [draft, setDraft] = useState<SlotSettings | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const timezones = useMemo(() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return []; } }, []);

  if (saved.loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (saved.error || !saved.data) return <Alert>{saved.error}</Alert>;

  const s = draft ?? saved.data;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved.data);
  const times = s.weekly[weekday];
  const dayName = WEEK.find(([d]) => d === weekday)![1];
  const update = (next: Partial<SlotSettings>) => { setDraft({ ...s, ...next }); setMsg(null); };
  const setDays = (targets: number[], value: string[]) => update({ weekly: s.weekly.map((t, i) => (targets.includes(i) ? value : t)) });
  const toggle = (t: string) => setDays([weekday], times.includes(t) ? times.filter((x) => x !== t) : [...times, t].sort());

  async function save() {
    setBusy(true); setMsg(null);
    try {
      saved.setData(await api<SlotSettings>("/admin/interview-slots/settings", { method: "PUT", body: s }));
      setDraft(null);
      setMsg({ tone: "success", text: "Interview slots saved." });
      onSaved?.();
    } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Day of the week">
        {WEEK.map(([d, name]) => (
          <button key={d} type="button" aria-pressed={d === weekday} onClick={() => setWeekday(d)} className={`rounded-xl py-2 text-center text-xs font-medium transition-colors ${d === weekday ? "bg-ink text-white" : "bg-paper text-ink hover:bg-paper-dim"}`}>
            {name}
            <span className={`block text-[0.7rem] font-normal ${d === weekday ? "text-white/70" : "text-ink-soft"}`}>{s.weekly[d].length || "Off"}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {PERIODS.map(([name, from, to]) => (
          <div key={name}>
            <p className="text-xs font-medium text-ink-soft">{name}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
              {[...ALL_TIMES.filter((t) => t >= from), ...ALL_TIMES.filter((t) => t < from)].filter((t) => inPeriod(t, from, to)).map((t) => {
                const on = times.includes(t);
                return <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)} className={`rounded-lg px-2 py-1.5 text-xs transition-colors ${on ? "bg-ink font-medium text-white" : "bg-white text-ink-soft ring-1 ring-line hover:text-ink hover:ring-ink/40"}`}>{slotLabel(t)}</button>;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setDays(WEEKDAYS, times)}>Copy {dayName} to Mon–Fri</Button>
        <Button size="sm" variant="secondary" onClick={() => setDays(WEEK.map(([d]) => d), times)}>Copy {dayName} to all days</Button>
        <Button size="sm" variant="secondary" disabled={!times.length} onClick={() => setDays([weekday], [])}>Clear {dayName}</Button>
      </div>

      <label className="mt-5 block max-w-sm text-sm font-medium text-ink">
        Timezone for these slots
        <select className="input mt-1.5 font-normal" value={s.timezone} onChange={(e) => update({ timezone: e.target.value })}>
          {(timezones.includes(s.timezone) ? timezones : [s.timezone, ...timezones]).map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}
        </select>
      </label>

      <p className="mt-3 text-xs text-ink-soft">These slots repeat every week. Removing one does not cancel an interview already booked in it.</p>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {dirty && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setDraft(null); setMsg(null); }}>Discard changes</Button>}
        <Button size="sm" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : "Save slots"}</Button>
      </div>
    </div>
  );
}
