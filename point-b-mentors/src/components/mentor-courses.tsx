"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Button, EmptyState, Field, Skeleton, Spinner } from "./ui";
import { classesLabel, courseAccent } from "./course-card";
import { api, errMsg } from "@/lib/api";
import { useApi, useNow } from "@/lib/use-api";
import { fmtDay, fmtDayShort, fmtTime, formatMoney, TZ_LABEL } from "@/lib/format";
import { ClassSessionAction, classWindow } from "@/components/class-session-action";
import type { Currency, CourseClassDetail, CourseStatus, OwnCourse } from "@/lib/types";

export type MyCourse = OwnCourse & { roomReference: string | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FEE_CURRENCIES: Currency[] = ["PKR", "USD", "GBP", "EUR", "AED"];
const LENGTHS = [45, 60, 90, 120, 180];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const timeLabel = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };

export const STATUS: Record<CourseStatus, { label: string; tone: "forest" | "brass" | "rust" | "neutral" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "With the POINT B team", tone: "brass" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "rust" },
  LIVE: { label: "Live", tone: "forest" },
  CLOSED: { label: "Enrolment closed", tone: "neutral" },
  REJECTED: { label: "Not going ahead", tone: "neutral" },
};

interface Draft { title: string; summary: string; topics: string[]; classOutlines: string[]; audience: string; startDate: string; weekdays: number[]; startTime: string; sessionsCount: number; sessionMinutes: number; fee: string; mentorFeeCurrency: Currency }

/** Same rule as the API: each chosen weekday from the first class date, until there are enough classes. Pakistan time. */
function previewDates(d: Pick<Draft, "startDate" | "weekdays" | "startTime" | "sessionsCount" | "sessionMinutes">) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate) || !d.weekdays.length) return [];
  const first = new Date(`${d.startDate}T${d.startTime}:00+05:00`);
  if (Number.isNaN(first.getTime())) return [];
  const out: { startAt: string; endAt: string }[] = [];
  for (let i = 0; out.length < d.sessionsCount && i < 420; i++) {
    const t = new Date(first.getTime() + i * 86400_000);
    if (d.weekdays.includes(new Date(t.getTime() + 5 * 3600_000).getUTCDay())) out.push({ startAt: t.toISOString(), endAt: new Date(t.getTime() + d.sessionMinutes * 60_000).toISOString() });
  }
  return out;
}

const blank = (): Draft => {
  const d = new Date(Date.now() + 14 * 86400_000);
  return { title: "", summary: "", topics: [""], classOutlines: ["", "", "", ""], audience: "", startDate: d.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }), weekdays: [6], startTime: "14:00", sessionsCount: 4, sessionMinutes: 90, fee: "", mentorFeeCurrency: "USD" };
};
const fromCourse = (c: OwnCourse): Draft => ({
  title: c.title, summary: c.summary, topics: c.topics.length ? c.topics : [""],
  classOutlines: Array.from({ length: c.sessionsCount }, (_, i) => c.classOutlines?.[i] ?? c.classes[i]?.outline ?? ""),
  audience: c.audience, startDate: c.startDate, weekdays: c.weekdays, startTime: c.startTime,
  sessionsCount: c.sessionsCount, sessionMinutes: c.sessionMinutes, fee: String(c.mentorFeeMinor / 100), mentorFeeCurrency: c.mentorFeeCurrency,
});

/** The mentor's courses: write one, send it for approval, and see who has enrolled once it is live. */
export function MentorCourses({ courses, loading, reload, live }: { courses: MyCourse[] | null; loading: boolean; reload: () => Promise<void> | void; live: boolean }) {
  const [editing, setEditing] = useState<MyCourse | "new" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (loading) return <Skeleton className="h-64 rounded-3xl" />;
  const list = courses ?? [];

  if (editing) {
    return <CourseEditor course={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={async (text) => { setEditing(null); setMsg(text); await reload(); }} />;
  }
  return (
    <div className="space-y-6">
      {msg && <Alert tone="success">{msg}</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-ink">Your courses</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">Plan a course, set the dates and the fee you&rsquo;d like for teaching it, and send it to the POINT B team. Once approved, it goes on the site and anyone can enrol.</p>
        </div>
        <Button onClick={() => { setMsg(null); setEditing("new"); }}>New course</Button>
      </div>
      {!live && <Alert tone="info">You can plan and send courses now. They go on the site once your profile is live.</Alert>}
      {list.length === 0 ? <EmptyState title="No courses yet" description="Start with the subject you know best. Suggest from my profile can draft one for you from your experience." />
        : <div className="space-y-4">{list.map((c) => <CourseRow key={c.id} c={c} onEdit={() => { setMsg(null); setEditing(c); }} reload={reload} />)}</div>}
    </div>
  );
}

const accentOf = courseAccent;
export const STATUS_DOT: Record<CourseStatus, string> = { DRAFT: "bg-ink/30", SUBMITTED: "bg-amber", CHANGES_REQUESTED: "bg-rust", LIVE: "bg-forest", CLOSED: "bg-ink/40", REJECTED: "bg-ink/30" };

const mi = (d: React.ReactNode) => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const ICONS = {
  calendar: mi(<><rect x="3" y="4.5" width="14" height="12.5" rx="2.5" /><path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" /></>),
  classes: mi(<><path d="M3 5.5c2.5-1 4.8-1 7 .5 2.2-1.5 4.5-1.5 7-.5v10c-2.5-1-4.8-1-7 .5-2.2-1.5-4.5-1.5-7-.5z" /><path d="M10 6v10" /></>),
  start: mi(<><circle cx="10" cy="10" r="7" /><path d="M8.5 7l4 3-4 3z" /></>),
  fee: mi(<><rect x="2.5" y="5" width="15" height="11" rx="2.5" /><path d="M2.5 8.5h15M6 13h3" /></>),
  tag: mi(<><path d="M3 10.5V4a1 1 0 011-1h6.5l6.5 6.5-7 7z" /><circle cx="7" cy="7" r="1.2" /></>),
  people: mi(<><circle cx="7.5" cy="7" r="2.6" /><circle cx="13.8" cy="7.8" r="2.1" /><path d="M2.5 16.5c.6-2.8 2.6-4.4 5-4.4s4.4 1.6 5 4.4M12.6 12.2c2.4-.3 4.3 1.1 4.9 4" /></>),
  clock: mi(<><circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 2" /></>),
};

function CourseRow({ c, onEdit, reload }: { c: MyCourse; onEdit: () => void; reload: () => Promise<void> | void }) {
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [showClasses, setShowClasses] = useState(false);
  const st = STATUS[c.status];
  const a = accentOf(c.slug);
  const editable = c.status === "DRAFT" || c.status === "CHANGES_REQUESTED";
  const published = c.status === "LIVE" || c.status === "CLOSED";
  const focusClass = c.classes.find((k) => !k.completedAt && classWindow(k.startAt, k.endAt, now).joinable)
    ?? c.nextClass
    ?? c.classes.find((k) => !k.completedAt && new Date(k.endAt).getTime() > now)
    ?? null;
  const held = c.classes.filter((k) => !!k.completedAt || new Date(k.endAt).getTime() <= now).length;
  const pendingComplete = c.classes.find((k) => !k.completedAt && (new Date(k.endAt).getTime() <= now || !!k.hostStartedAt || new Date(k.startAt).getTime() <= now));
  const until = c.nextClass ? relativeShort(c.nextClass.startAt, c.nextClass.endAt, now) : null;

  async function act(path: string, method = "POST") {
    setBusy(path); setError(null);
    try { await api(path, { method, body: method === "DELETE" ? undefined : {} }); await reload(); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }

  const stats: [string, string, string | null, React.ReactNode, string][] = [
    ["Your fee", formatMoney(c.mentorFeeMinor, c.mentorFeeCurrency), "for the whole course", ICONS.fee, "bg-peach/45"],
    ["Learners pay", c.priceMinor != null ? formatMoney(c.priceMinor, "PKR") : "Not set yet", c.priceMinor != null ? "per learner" : "set by POINT B", ICONS.tag, "bg-sky/45"],
    ["Enrolled", published ? String(c.enrolled) : "–", published ? (c.capacity ? `of ${c.capacity} seats` : "no seat limit") : "once it's live", ICONS.people, "bg-mint/50"],
    ["Next class", c.nextClass ? `${fmtDayShort(c.nextClass.startAt)}, ${fmtTime(c.nextClass.startAt)}` : published ? "Finished" : "–", until, ICONS.clock, "bg-lilac/50"],
  ];

  return (
    <article className="overflow-hidden rounded-[2rem] bg-white ring-1 ring-line transition-shadow hover:shadow-[0_24px_60px_-40px_rgba(17,17,17,0.45)]">
      <div className={`relative bg-gradient-to-br ${a.wash} via-white to-white px-6 pb-6 pt-6 sm:px-8 sm:pt-7`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm ring-1 ring-ink/5">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[c.status]} ${c.status === "LIVE" ? "animate-pulse" : ""}`} />{st.label}
            </span>
            <h3 className="mt-4 font-display text-[1.9rem] leading-[1.08] text-ink sm:text-[2.2rem]">{c.title}</h3>
            <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-ink">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-ink/5">{ICONS.calendar}{c.schedule}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-ink/5">{ICONS.classes}{classesLabel(c)}</span>
              {c.firstClassAt && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-ink/5">{ICONS.start}Starts {fmtDayShort(c.firstClassAt)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && <Button size="sm" onClick={onEdit}>Edit course</Button>}
            {c.status === "SUBMITTED" && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act(`/courses/me/${c.id}/withdraw`)}>{busy ? <Spinner /> : "Withdraw to edit"}</Button>}
            {published && <Button size="sm" variant="secondary" href={`/courses/${c.slug}`}>View on site <span aria-hidden>↗</span></Button>}
            {(editable || c.status === "REJECTED") && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(`/courses/me/${c.id}`, "DELETE")}>Delete</Button>}
          </div>
        </div>

        {published && focusClass && c.roomReference && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 ring-1 ring-ink/5 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/50">
                {classWindow(focusClass.startAt, focusClass.endAt, now).joinable ? "Start here" : "Next class"}
              </p>
              <p className="mt-0.5 font-medium text-ink">Class {focusClass.number} · {fmtDayShort(focusClass.startAt)}, {fmtTime(focusClass.startAt)}–{fmtTime(focusClass.endAt)}</p>
              {focusClass.outline && <p className="mt-0.5 truncate text-xs text-ink-soft">{focusClass.outline}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <ClassSessionAction
                role="mentor"
                href={`/session/${c.roomReference}`}
                startAt={focusClass.startAt}
                endAt={focusClass.endAt}
                classNumber={focusClass.number}
                sessionsCount={c.sessionsCount}
                courseTitle={c.title}
                mentorName="your learners"
                outline={focusClass.outline}
              />
              {pendingComplete && !classWindow(focusClass.startAt, focusClass.endAt, now).joinable && pendingComplete.number === focusClass.number && (
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { setShowClasses(true); void act(`/courses/me/${c.id}/classes/${pendingComplete.number}/complete`); }}>
                  {busy?.includes("/complete") ? <Spinner /> : "Mark class complete"}
                </Button>
              )}
            </div>
          </div>
        )}

        {c.classes.length > 0 && (
          <div className="mt-6">
            <div className="flex gap-1.5" aria-hidden>
              {c.classes.map((k) => {
                const done = !!k.completedAt || new Date(k.endAt).getTime() <= now;
                const next = c.nextClass?.number === k.number;
                return <span key={k.number} title={`Class ${k.number}: ${fmtDayShort(k.startAt)}, ${fmtTime(k.startAt)}`} className={`h-2 flex-1 rounded-full transition-colors ${done ? a.dot : next ? `${a.dot} opacity-40` : "bg-ink/10"}`} />;
              })}
            </div>
            <p className="mt-2 text-xs text-ink-soft">{published ? `${held} of ${c.classes.length} classes held` : `${c.classes.length} classes planned`}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 px-6 pb-6 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {stats.map(([label, value, note, icon, tone]) => (
          <div key={label} className={`rounded-2xl ${tone} p-4`}>
            <p className="flex items-center gap-2 text-xs font-medium text-ink/60"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-ink">{icon}</span>{label}</p>
            <p className="mt-3 font-display text-2xl leading-tight text-ink tabular-nums">{value}</p>
            {note && <p className="mt-0.5 text-xs text-ink/55">{note}</p>}
          </div>
        ))}
      </div>

      {(c.adminNote && (c.status === "CHANGES_REQUESTED" || c.status === "REJECTED" || c.status === "LIVE")) && (
        <div className="mx-6 mb-6 rounded-2xl bg-paper px-5 py-4 text-sm sm:mx-8"><p className="font-medium text-ink">Note from the POINT B team</p><p className="mt-1 whitespace-pre-line text-ink-soft">{c.adminNote}</p></div>
      )}
      {error && <div className="mx-6 mb-6 sm:mx-8"><Alert>{error}</Alert></div>}
      {published && (
        <div className="border-t border-line bg-paper/50 px-6 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-expanded={showClasses} onClick={() => setShowClasses((v) => !v)} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink ring-1 ring-line transition-colors hover:ring-ink/30">
                {ICONS.classes}{showClasses ? "Hide classes" : `Classes (${held}/${c.classes.length})`}
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden className={`transition-transform ${showClasses ? "rotate-180" : ""}`}><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button type="button" aria-expanded={showRoster} onClick={() => setShowRoster((v) => !v)} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink ring-1 ring-line transition-colors hover:ring-ink/30">
                {ICONS.people}{showRoster ? "Hide learners" : `Learners (${c.enrolled})`}
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden className={`transition-transform ${showRoster ? "rotate-180" : ""}`}><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <p className="text-xs text-ink-soft">Open a class 10 minutes before it starts. Mark it complete when you&rsquo;re done.</p>
          </div>
          {showClasses && <ClassRuns courseId={c.id} roomReference={c.roomReference} onChanged={reload} />}
          {showRoster && <Roster id={c.id} />}
        </div>
      )}
    </article>
  );
}

/** Relative label for the next/current class: under way, starting soon, or in N hours/days. */
function relativeShort(startIso: string, endIso: string, now: number) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (now >= start && now <= end) return "under way";
  if (now > end) return "just finished";
  const ms = start - now;
  if (ms <= 10 * 60_000) return "starting now";
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `in ${Math.max(1, h)} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

const CLASS_STATUS: Record<CourseClassDetail["status"], { label: string; tone: string }> = {
  upcoming: { label: "Upcoming", tone: "bg-ink/8 text-ink/70" },
  live: { label: "Live now", tone: "bg-forest/15 text-forest" },
  ended: { label: "Ended", tone: "bg-amber/20 text-ink" },
  completed: { label: "Complete", tone: "bg-mint text-ink" },
};

function ClassRuns({ courseId, roomReference, onChanged }: { courseId: string; roomReference: string | null; onChanged: () => Promise<void> | void }) {
  const { data, loading, error, reload } = useApi<CourseClassDetail[]>(`/courses/me/${courseId}/classes`);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  async function complete(n: number) {
    setBusy(n); setErr(null);
    try {
      await api(`/courses/me/${courseId}/classes/${n}/complete`, { method: "POST", body: {} });
      await reload();
      await onChanged();
      setOpen(n);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); }
  }

  if (loading) return <Skeleton className="mt-4 h-28 rounded-2xl" />;
  if (error) return <div className="mt-4"><Alert>{error}</Alert></div>;
  if (!data?.length) return <p className="mt-4 text-sm text-ink-soft">No class dates yet.</p>;

  return (
    <div className="mt-4 space-y-3">
      {err && <Alert>{err}</Alert>}
      <ul className="space-y-2">
        {data.map((k) => {
          const st = CLASS_STATUS[k.status];
          const expanded = open === k.number;
          return (
            <li key={k.number} className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : k.number)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper font-display text-lg text-ink">{k.number}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">Class {k.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">{fmtDay(k.startAt)} · {fmtTime(k.startAt)}–{fmtTime(k.endAt)} · {k.attended} of {k.enrolled} joined</span>
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  {(k.status === "live" || k.status === "upcoming") && roomReference && (
                    <ClassSessionAction
                      role="mentor"
                      href={`/session/${roomReference}`}
                      startAt={k.startAt}
                      endAt={k.endAt}
                      classNumber={k.number}
                      sessionsCount={data.length}
                      courseTitle={`Class ${k.number}`}
                      mentorName="your learners"
                    />
                  )}
                  {k.canComplete && (
                    <Button size="sm" variant="secondary" disabled={busy === k.number} onClick={() => complete(k.number)}>
                      {busy === k.number ? <Spinner /> : "Mark class complete"}
                    </Button>
                  )}
                </div>
              </div>
              {expanded && (
                <div className="border-t border-line bg-paper/60 px-4 py-4 sm:px-5">
                  <div className="grid gap-3 text-xs text-ink-soft sm:grid-cols-3">
                    <p><span className="font-medium text-ink">Mentor joined</span><br />{k.hostStartedAt ? `${fmtDayShort(k.hostStartedAt)} · ${fmtTime(k.hostStartedAt)}` : "Not yet"}</p>
                    <p><span className="font-medium text-ink">Marked complete</span><br />{k.completedAt ? `${fmtDayShort(k.completedAt)} · ${fmtTime(k.completedAt)}` : "—"}</p>
                    <p><span className="font-medium text-ink">Attendance</span><br />{k.attended} learner{k.attended === 1 ? "" : "s"} of {k.enrolled}</p>
                  </div>
                  {k.attendees.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-soft">No join times recorded for this class yet.</p>
                  ) : (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {k.attendees.map((a) => (
                        <li key={a.reference} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-line">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-medium text-ink">{a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{a.name}</span>
                            <span className="block text-xs text-ink-soft">Joined {fmtTime(a.joinedAt)} · {fmtDayShort(a.joinedAt)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Roster({ id }: { id: string }) {
  const { data, loading, error } = useApi<{ reference: string; name: string; enrolledAt: string }[]>(`/courses/me/${id}/roster`);
  if (loading) return <Skeleton className="mt-3 h-16 rounded-2xl" />;
  if (error) return <div className="mt-3"><Alert>{error}</Alert></div>;
  if (!data?.length) return <p className="mt-3 text-sm text-ink-soft">No one has enrolled yet.</p>;
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((r) => <li key={r.reference} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm ring-1 ring-line"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-medium text-ink">{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span className="min-w-0"><span className="block truncate font-medium text-ink">{r.name}</span><span className="block text-xs text-ink-soft">Enrolled {fmtDayShort(r.enrolledAt)}</span></span></li>)}
    </ul>
  );
}

function CourseEditor({ course, onCancel, onSaved }: { course: MyCourse | null; onCancel: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState<Draft>(() => (course ? fromCourse(course) : blank()));
  const [busy, setBusy] = useState<"save" | "submit" | "suggest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => {
    if (k === "sessionsCount") {
      const n = v as number;
      const outlines = [...x.classOutlines];
      while (outlines.length < n) outlines.push("");
      return { ...x, sessionsCount: n, classOutlines: outlines.slice(0, n) };
    }
    return { ...x, [k]: v };
  });
  const dates = useMemo(() => previewDates(d), [d]);
  const topics = d.topics.map((t) => t.trim()).filter(Boolean);
  const feeMinor = Math.round(Number(d.fee.replace(/,/g, "")) * 100);
  const problems = [
    d.title.trim().length < 5 && "a title",
    d.summary.trim().length < 30 && "a summary of at least 30 characters",
    !topics.length && "at least one point the course covers",
    !d.weekdays.length && "the weekday(s) it runs",
    !(feeMinor >= 0 && d.fee.trim() !== "" && Number.isFinite(feeMinor)) && "your fee",
  ].filter(Boolean) as string[];

  async function suggest() {
    setBusy("suggest"); setError(null);
    try {
      const s = await api<{ title: string; summary: string; topics: string[]; audience: string }>("/courses/me/suggest", { body: { idea: idea.trim() || undefined } });
      setD((x) => ({ ...x, title: s.title, summary: s.summary, topics: s.topics.length ? s.topics : x.topics, audience: s.audience }));
    } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "save"); setError(null);
    const classOutlines = Array.from({ length: d.sessionsCount }, (_, i) => (d.classOutlines[i] ?? "").trim());
    const body = { title: d.title.trim(), summary: d.summary.trim(), topics, classOutlines, audience: d.audience.trim(), startDate: d.startDate, weekdays: d.weekdays, startTime: d.startTime, sessionsCount: d.sessionsCount, sessionMinutes: d.sessionMinutes, mentorFeeMinor: feeMinor, mentorFeeCurrency: d.mentorFeeCurrency, submit };
    try {
      await api(course ? `/courses/me/${course.id}` : "/courses/me", { method: course ? "PUT" : "POST", body });
      onSaved(submit ? "Sent to the POINT B team. We’ll email you once it’s reviewed." : "Saved as a draft.");
    } catch (e) { setError(errMsg(e)); setBusy(null); }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl text-ink">{course ? "Edit course" : "New course"}</h2>
          <button type="button" onClick={onCancel} className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink">Back to your courses</button>
        </div>
        {course?.adminNote && course.status === "CHANGES_REQUESTED" && <Alert tone="info"><span className="font-medium">Changes requested:</span> {course.adminNote}</Alert>}

        <section className="rounded-3xl bg-lilac/50 p-5 sm:p-6">
          <p className="font-medium text-ink">Not sure where to start?</p>
          <p className="mt-1 text-sm text-ink/70">We can draft the title, summary and the points it covers from your profile. You can change all of it.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input className="input flex-1 bg-white" maxLength={200} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Optional: an idea, e.g. strategic leadership for new managers" />
            <Button variant="secondary" disabled={!!busy} onClick={suggest}>{busy === "suggest" ? <Spinner /> : "Suggest from my profile"}</Button>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
          <Field label="Course title" hint={`${d.title.length}/120`}><input className="input" maxLength={120} value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Strategic Leadership" /></Field>
          <Field label="Summary" hint="Two or three sentences: what it is and what learners leave with."><textarea className="input min-h-28" maxLength={1500} value={d.summary} onChange={(e) => set("summary", e.target.value)} /></Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">What the course covers</p>
            <p className="mb-3 text-xs text-ink-soft">One point per line, e.g. strategic intent, the milestone approach, leading through change.</p>
            <div className="space-y-2">
              {d.topics.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <span className="flex w-8 shrink-0 items-center justify-center font-display text-lg text-ink-soft">{i + 1}</span>
                  <input className="input flex-1" maxLength={160} value={t} onChange={(e) => set("topics", d.topics.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (d.topics.length < 15) set("topics", [...d.topics.slice(0, i + 1), "", ...d.topics.slice(i + 1)]); } }} placeholder="A point the course covers" />
                  <button type="button" aria-label="Remove point" disabled={d.topics.length === 1} onClick={() => set("topics", d.topics.filter((_, j) => j !== i))} className="rounded-full px-3 text-ink-soft hover:bg-paper hover:text-ink disabled:opacity-30">×</button>
                </div>
              ))}
            </div>
            {d.topics.length < 15 && <button type="button" onClick={() => set("topics", [...d.topics, ""])} className="mt-2 text-sm font-medium text-ink underline underline-offset-4">Add a point</button>}
          </div>
          <Field label="Who it’s for (optional)"><input className="input" maxLength={400} value={d.audience} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. Managers stepping into their first senior role" /></Field>
        </section>

        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
          <div><p className="font-medium text-ink">Schedule</p><p className="text-xs text-ink-soft">All times are {TZ_LABEL}, where your learners are.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First class"><input className="input" type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="Start time"><select className="input" value={d.startTime} onChange={(e) => set("startTime", e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Runs every</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => {
                const on = d.weekdays.includes(i);
                return <button key={w} type="button" aria-pressed={on} onClick={() => set("weekdays", on ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort())} className={`h-10 min-w-14 rounded-full border px-4 text-sm transition-colors ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"}`}>{w}</button>;
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number of classes"><input className="input" type="number" min={1} max={24} value={d.sessionsCount} onChange={(e) => set("sessionsCount", Math.max(1, Math.min(24, Number(e.target.value) || 1)))} /></Field>
            <Field label="Each class lasts"><select className="input" value={d.sessionMinutes} onChange={(e) => set("sessionMinutes", Number(e.target.value))}>{LENGTHS.map((m) => <option key={m} value={m}>{m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m === 90 ? "1½ hours" : `${m} minutes`}</option>)}</select></Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">What each class covers</p>
            <p className="mb-3 text-xs text-ink-soft">Optional one-line outline per class. Learners see this on their dashboard.</p>
            <div className="space-y-2">
              {Array.from({ length: d.sessionsCount }, (_, i) => (
                <div key={i} className="flex gap-2">
                  <span className="flex w-8 shrink-0 items-center justify-center font-display text-lg text-ink-soft">{i + 1}</span>
                  <input
                    className="input flex-1"
                    maxLength={240}
                    value={d.classOutlines[i] ?? ""}
                    onChange={(e) => set("classOutlines", Array.from({ length: d.sessionsCount }, (_, j) => (j === i ? e.target.value : d.classOutlines[j] ?? "")))}
                    placeholder={dates[i] ? `Class ${i + 1} · ${fmtDayShort(dates[i].startAt)}` : `Class ${i + 1} outline`}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
          <div><p className="font-medium text-ink">Your fee</p><p className="text-xs text-ink-soft">What you&rsquo;d like to be paid for teaching the whole course, however many people enrol. The POINT B team sets the price learners pay, in rupees.</p></div>
          <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-white transition-colors focus-within:border-ink/50">
            <label className="relative flex shrink-0 items-center border-r border-line bg-paper/70">
              <span className="sr-only">Currency</span>
              <select className="h-full cursor-pointer appearance-none bg-transparent py-3 pl-4 pr-9 text-sm font-medium text-ink outline-none" value={d.mentorFeeCurrency} onChange={(e) => set("mentorFeeCurrency", e.target.value as Currency)}>{FEE_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden className="pointer-events-none absolute right-3 text-ink-soft"><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </label>
            <input className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-soft/60" inputMode="decimal" value={d.fee} onChange={(e) => set("fee", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="e.g. 500" aria-label="Fee amount" />
            {feeMinor > 0 && <span className="flex shrink-0 items-center pr-4 text-sm text-ink-soft">{formatMoney(feeMinor, d.mentorFeeCurrency)}</span>}
          </div>
        </section>

        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {problems.length > 0 && <p className="mr-auto text-xs text-ink-soft">To send it, add {problems.join(", ")}.</p>}
          <Button variant="secondary" disabled={!!busy || d.title.trim().length < 5} onClick={() => save(false)}>{busy === "save" ? <Spinner /> : "Save draft"}</Button>
          <Button disabled={!!busy || problems.length > 0} onClick={() => save(true)}>{busy === "submit" ? <Spinner /> : "Send for approval"}</Button>
        </div>
      </div>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">Preview</p>
        <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-line">
          <div className="bg-gradient-to-br from-mint/80 via-sky/40 to-white px-6 pb-6 pt-5">
            <span className="text-xs font-medium text-ink/60">{classesLabel(d)}</span>
            <p className="mt-6 font-display text-[1.6rem] leading-[1.1] text-ink">{d.title || "Your course title"}</p>
            <p className="mt-2 text-sm text-ink/70">{d.weekdays.length ? `Every ${d.weekdays.map((w) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][w]).join(" and ")} at ${timeLabel(d.startTime)}` : "Pick the weekday(s)"}</p>
          </div>
          <div className="px-6 py-5">
            <p className="text-xs font-medium text-ink-soft">Class dates</p>
            {dates.length ? (
              <ol className="mt-2 space-y-1.5 text-sm">{dates.map((k, i) => <li key={k.startAt} className="flex justify-between gap-3"><span className="text-ink-soft">{i + 1}</span><span className="flex-1 text-ink">{fmtDay(k.startAt)}</span><span className="text-ink-soft">{fmtTime(k.startAt)}</span></li>)}</ol>
            ) : <p className="mt-2 text-sm text-ink-soft">Choose a first date and weekday to see them.</p>}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">Courses need to start at least two days after you send them, so the team can review and announce them. <Link href="/contact" className="underline">Questions?</Link></p>
      </aside>
    </div>
  );
}
