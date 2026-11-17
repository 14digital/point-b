"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, EmptyState, Field, FilterChips, MentorPhoto, Skeleton, Spinner } from "./ui";
import { classesLabel, courseAccent } from "./course-card";
import { STATUS, STATUS_DOT } from "./mentor-courses";
import { formatPhone } from "./phone-input";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fmtDay, fmtDayShort, fmtTime, formatMoney } from "@/lib/format";
import type { AdminCourse, CourseClassDetail, CourseStatus } from "@/lib/types";

type Filter = "review" | "live" | "all" | "other";
const FILTERS: [Filter, string][] = [["review", "Waiting for review"], ["live", "Published"], ["other", "Drafts & declined"], ["all", "All"]];
const inFilter = (f: Filter, s: CourseStatus) => f === "all" || (f === "review" ? s === "SUBMITTED" : f === "live" ? s === "LIVE" || s === "CLOSED" : !["SUBMITTED", "LIVE", "CLOSED"].includes(s));
const rupees = (v: string) => Math.round(Number(v.replace(/[,\s]/g, "")) * 100);

/**
 * Courses for the POINT B team: review what mentors send, set the price learners pay, publish, and then manage
 * enrolment, seat limits and the mentor's fee.
 */
const ic = (d: React.ReactNode) => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

export function AdminCourses({ onChanged }: { onChanged?: () => void }) {
  const { data, loading, error, setData, reload } = useApi<AdminCourse[]>("/admin/courses");
  const list = data ?? [];
  const waiting = list.filter((c) => c.status === "SUBMITTED").length;
  const [filter, setFilter] = useState<Filter>("review");
  const shown = list.filter((c) => inFilter(waiting || filter !== "review" ? filter : "live", c.status));
  const active: Filter = waiting || filter !== "review" ? filter : "live";
  const update = (c: AdminCourse | undefined) => { if (c) setData(list.map((x) => (x.id === c.id ? c : x))); else void reload(); onChanged?.(); };
  const live = list.filter((c) => c.status === "LIVE");
  const learners = list.reduce((n, c) => n + c.enrolled, 0);
  const revenue = list.reduce((n, c) => n + c.revenueMinor, 0);
  const company = list.reduce((n, c) => n + (c.companyRevenueMinor ?? 0), 0);

  if (loading) return <Skeleton className="h-72 rounded-3xl" />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Waiting for review", String(waiting), waiting ? "Price and publish them" : "All caught up", "bg-lilac", ic(<><circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 2" /></>)],
          ["Live now", String(live.length), `${list.filter((c) => c.status === "CLOSED").length} with enrolment closed`, "bg-mint", ic(<><path d="M3 5.5c2.5-1 4.8-1 7 .5 2.2-1.5 4.5-1.5 7-.5v10c-2.5-1-4.8-1-7 .5-2.2-1.5-4.5-1.5-7-.5z" /><path d="M10 6v10" /></>)],
          ["Learners enrolled", String(learners), "across all courses", "bg-sky", ic(<><circle cx="7.5" cy="7" r="2.6" /><circle cx="13.8" cy="7.8" r="2.1" /><path d="M2.5 16.5c.6-2.8 2.6-4.4 5-4.4s4.4 1.6 5 4.4M12.6 12.2c2.4-.3 4.3 1.1 4.9 4" /></>)],
          ["Company share", formatMoney(company, "PKR"), `${formatMoney(revenue, "PKR")} learner gross`, "bg-peach", ic(<><rect x="2.5" y="5" width="15" height="11" rx="2.5" /><path d="M2.5 8.5h15M6 13h3" /></>)],
        ] as const).map(([l, v, note, tone, icon]) => (
          <div key={l} className={`rounded-3xl ${tone} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-brass-dark">{l}</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-brass-dark">{icon}</span>
            </div>
            <p className="mt-3 font-display text-4xl leading-none text-ink tabular-nums">{v}</p>
            <p className="mt-2 text-xs text-ink/60">{note}</p>
          </div>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <FilterChips options={FILTERS} value={active} onChange={setFilter} counts={{ review: waiting, live: list.filter((c) => c.status === "LIVE" || c.status === "CLOSED").length }} highlight="review" label="Show courses" />
      {shown.length === 0 ? <EmptyState title={active === "review" ? "Nothing waiting" : "No courses here"} description={active === "review" ? "When a mentor sends a course for approval, it appears here." : "Courses appear here as mentors plan them."} />
        : <div className="space-y-4">{shown.map((c) => <CourseAdminRow key={c.id} c={c} onUpdate={update} />)}</div>}
    </div>
  );
}

function CourseAdminRow({ c, onUpdate }: { c: AdminCourse; onUpdate: (c: AdminCourse | undefined) => void }) {
  const [open, setOpen] = useState(c.status === "SUBMITTED");
  const st = STATUS[c.status];
  const a = courseAccent(c.slug);
  const published = c.status === "LIVE" || c.status === "CLOSED";
  return (
    <article className={`overflow-hidden rounded-[2rem] bg-white ring-1 transition-shadow ${open ? "shadow-[0_24px_60px_-40px_rgba(17,17,17,0.45)] ring-ink/10" : "ring-line hover:shadow-[0_18px_44px_-36px_rgba(17,17,17,0.4)]"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`flex w-full flex-wrap items-center justify-between gap-4 bg-gradient-to-r ${a.wash} via-white to-white px-6 py-5 text-left sm:px-7`}>
        <span className="flex min-w-0 items-center gap-4">
          <span className="relative shrink-0">
            <MentorPhoto name={c.mentor.name} photoUrl={c.mentor.photoUrl} className="h-14 w-14 rounded-2xl shadow-sm ring-2 ring-white" initialsClass="text-sm" />
            <span className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full ring-2 ring-white ${STATUS_DOT[c.status]}`} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[1.6rem] leading-tight text-ink">{c.title}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
              <span className="font-medium text-ink">{c.mentor.name}</span>
              <span className="h-1 w-1 rounded-full bg-ink/20" />{c.schedule}
              <span className="h-1 w-1 rounded-full bg-ink/20" />{classesLabel(c)}
              {c.firstClassAt && <><span className="h-1 w-1 rounded-full bg-ink/20" />from {fmtDayShort(c.firstClassAt)}</>}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
          {published ? (
            <span className="hidden min-w-[16rem] grid-cols-3 gap-2 md:grid lg:min-w-[20rem]">
              <EarnCell label="Learner gross" value={formatMoney(c.revenueMinor, "PKR")} />
              <EarnCell label="Mentor fee" value={formatMoney(c.mentorFeeMinor, c.mentorFeeCurrency)} muted />
              <EarnCell label="Company share" value={c.companyRevenueMinor == null ? "—" : formatMoney(c.companyRevenueMinor, "PKR")} strong />
            </span>
          ) : (
            <span className="hidden text-right sm:block">
              <span className="block font-display text-xl leading-none text-ink tabular-nums">{c.priceMinor != null ? formatMoney(c.priceMinor, "PKR") : "—"}</span>
              <span className="mt-1 block text-[11px] text-ink-soft">price not set</span>
            </span>
          )}
          <span className="text-right sm:hidden">
            {published ? (
              <>
                <span className="block font-display text-lg leading-none text-ink tabular-nums">{c.companyRevenueMinor == null ? formatMoney(c.revenueMinor, "PKR") : formatMoney(c.companyRevenueMinor, "PKR")}</span>
                <span className="mt-1 block text-[11px] text-ink-soft">{c.enrolled} enrolled · company</span>
              </>
            ) : (
              <>
                <span className="block font-display text-lg leading-none text-ink tabular-nums">{c.priceMinor != null ? formatMoney(c.priceMinor, "PKR") : "—"}</span>
                <span className="mt-1 block text-[11px] text-ink-soft">price not set</span>
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm ring-1 ring-ink/5"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[c.status]}`} />{st.label}</span>
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line transition-all ${open ? "rotate-180 bg-ink text-white" : "bg-white text-ink"}`}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        </span>
      </button>
      {open && (
        <div className="grid gap-8 border-t border-line px-6 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5 text-sm">
            <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-ink">{c.summary}</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-dark">What it covers</p>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">{c.topics.map((t, i) => <li key={t} className="flex gap-3 rounded-2xl bg-paper px-3.5 py-2.5"><span className="font-display text-base leading-snug text-brass-dark">{String(i + 1).padStart(2, "0")}</span><span className="text-ink">{t}</span></li>)}</ol>
            </div>
            {c.audience && <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-dark">Who it&rsquo;s for</p><p className="mt-2 text-ink">{c.audience}</p></div>}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-dark">Class dates</p>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">{c.classes.map((k) => <li key={k.number} className="flex items-center gap-3 rounded-2xl px-3 py-2 ring-1 ring-line"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.chip} text-xs font-medium text-ink`}>{k.number}</span><span><span className="block text-ink">{fmtDay(k.startAt)}</span><span className="block text-xs text-ink-soft">{fmtTime(k.startAt)}–{fmtTime(k.endAt)}</span></span></li>)}</ol>
            </div>
            {c.adminNote && <div className="rounded-2xl bg-paper px-4 py-3"><p className="text-xs font-medium text-ink-soft">Note sent to the mentor</p><p className="mt-1 whitespace-pre-line text-ink">{c.adminNote}</p></div>}
            {published && (
              <div className="space-y-3">
                <AdminClassRuns id={c.id} onChanged={() => onUpdate(undefined)} />
                <Roster id={c.id} />
              </div>
            )}
          </div>
          <aside className="space-y-4">
            <dl className="space-y-2 rounded-2xl bg-paper p-4 text-sm">
              <Row l="Learners pay" v={c.priceMinor != null ? formatMoney(c.priceMinor, "PKR") : "Not set"} />
              {published && <Row l="Enrolled" v={`${c.enrolled}${c.capacity ? ` of ${c.capacity}` : " · no limit"}`} />}
              {c.submittedAt && <Row l="Sent for review" v={fmtDayShort(c.submittedAt)} />}
            </dl>
            {published && (
              <div className="overflow-hidden rounded-2xl ring-1 ring-line">
                <div className="bg-ink px-4 py-3 text-white">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">Earnings from this course</p>
                  <p className="mt-1 font-display text-2xl tabular-nums">{c.companyRevenueMinor == null ? "—" : formatMoney(c.companyRevenueMinor, "PKR")}</p>
                  <p className="text-xs text-white/65">Company share · learner gross − mentor fee</p>
                </div>
                <dl className="grid grid-cols-3 divide-x divide-line bg-paper/80 text-center">
                  <div className="px-2 py-3"><dt className="text-[10px] uppercase tracking-[0.1em] text-ink-soft">Learner gross</dt><dd className="mt-1 text-sm font-medium tabular-nums text-ink">{formatMoney(c.revenueMinor, "PKR")}</dd></div>
                  <div className="px-2 py-3"><dt className="text-[10px] uppercase tracking-[0.1em] text-ink-soft">Mentor fee</dt><dd className="mt-1 text-sm font-medium tabular-nums text-ink">{formatMoney(c.mentorFeeMinor, c.mentorFeeCurrency)}</dd></div>
                  <div className="px-2 py-3"><dt className="text-[10px] uppercase tracking-[0.1em] text-ink-soft">Company</dt><dd className="mt-1 text-sm font-medium tabular-nums text-ink">{c.companyRevenueMinor == null ? "—" : formatMoney(c.companyRevenueMinor, "PKR")}</dd></div>
                </dl>
                {c.feedback && (
                  <div className="space-y-1.5 border-t border-line px-4 py-3 text-xs text-ink-soft">
                    <p>
                      Feedback {c.feedback.count
                        ? <>{c.feedback.rating != null ? `${c.feedback.rating} ★ avg` : "—"} · {c.feedback.count} review{c.feedback.count === 1 ? "" : "s"}{c.feedback.pending ? ` · ${c.feedback.pending} waiting` : ""}</>
                        : "No reviews yet — invited after the final class"}
                    </p>
                    {c.feedback.count > 0 && (c.feedback.clarity != null || c.feedback.usefulness != null || c.feedback.recommend != null) && (
                      <p>
                        {[c.feedback.clarity != null && `Clarity ${c.feedback.clarity}`, c.feedback.usefulness != null && `Usefulness ${c.feedback.usefulness}`, c.feedback.recommend != null && `Recommend ${c.feedback.recommend}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {c.status === "SUBMITTED" && <ReviewActions c={c} onUpdate={onUpdate} />}
            {published && <LiveActions c={c} onUpdate={onUpdate} />}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" href={`/mentors/${c.mentor.slug}`}>Mentor profile</Button>
              {published && <Button size="sm" variant="ghost" href={`/courses/${c.slug}`}>View on site</Button>}
            </div>
          </aside>
        </div>
      )}
    </article>
  );
}

function ReviewActions({ c, onUpdate }: { c: AdminCourse; onUpdate: (c: AdminCourse | undefined) => void }) {
  const [price, setPrice] = useState("");
  const [seats, setSeats] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"approve" | "return">("approve");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const priceMinor = rupees(price);
  const seatLimit = seats.trim() ? Math.round(Number(seats)) : null;
  async function run(key: string, path: string, body: object) {
    setBusy(key); setError(null);
    try { onUpdate(await api<AdminCourse>(path, { body })); } catch (e) { setError(errMsg(e)); setBusy(null); }
  }
  return (
    <div className="space-y-3 rounded-2xl ring-1 ring-line p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-paper p-1 text-sm">
        {(["approve", "return"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-2 ${mode === m ? "bg-white font-medium text-ink shadow-sm" : "text-ink-soft"}`}>{m === "approve" ? "Approve" : "Send back"}</button>)}
      </div>
      {mode === "approve" ? (
        <>
          <Field label="Price per learner (PKR)" hint="For the whole course"><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ""))} placeholder="e.g. 45,000" /></Field>
          <Field label="Seat limit (optional)" hint="Leave empty for no limit"><input className="input" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} placeholder="No limit" /></Field>
          <Field label="Note to the mentor (optional)"><textarea className="input min-h-16" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button className="w-full" disabled={!!busy || !(priceMinor >= 100)} onClick={() => run("approve", `/admin/courses/${c.id}/approve`, { priceMinor, capacity: seatLimit, note: note.trim() || undefined })}>{busy === "approve" ? <Spinner /> : `Publish at ${priceMinor >= 100 ? formatMoney(priceMinor, "PKR") : "…"}`}</Button>
        </>
      ) : (
        <>
          <Field label="What needs to change?" hint="Emailed to the mentor"><textarea className="input min-h-24" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button className="flex-1" variant="secondary" disabled={!!busy || note.trim().length < 5} onClick={() => run("return", `/admin/courses/${c.id}/return`, { note: note.trim() })}>{busy === "return" ? <Spinner /> : "Ask for changes"}</Button>
            <Button variant="danger" disabled={!!busy || note.trim().length < 5} onClick={() => run("reject", `/admin/courses/${c.id}/return`, { note: note.trim(), reject: true })}>{busy === "reject" ? <Spinner /> : "Decline"}</Button>
          </div>
        </>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function LiveActions({ c, onUpdate }: { c: AdminCourse; onUpdate: (c: AdminCourse | undefined) => void }) {
  const [price, setPrice] = useState(c.priceMinor != null ? String(c.priceMinor / 100) : "");
  const [seats, setSeats] = useState(c.capacity != null ? String(c.capacity) : "");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const priceMinor = rupees(price);
  const seatLimit = seats.trim() ? Math.round(Number(seats)) : null;
  const dirty = priceMinor !== c.priceMinor || seatLimit !== c.capacity;
  async function run(key: string, path: string, body: object, method = "POST") {
    setBusy(key); setError(null);
    try { onUpdate(await api<AdminCourse>(path, { method, body })); setPaying(false); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }
  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-2xl p-4 ring-1 ring-line">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Price (PKR)"><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ""))} /></Field>
          <Field label="Seat limit"><input className="input" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} placeholder="No limit" /></Field>
        </div>
        {dirty && <Button size="sm" className="w-full" disabled={!!busy || !(priceMinor >= 100)} onClick={() => run("save", `/admin/courses/${c.id}`, { priceMinor, capacity: seatLimit }, "PATCH")}>{busy === "save" ? <Spinner /> : "Save changes"}</Button>}
        <p className="text-xs text-ink-soft">New enrolments pay the new price. Anyone already enrolled keeps what they paid.</p>
        <Button size="sm" variant="secondary" className="w-full" disabled={!!busy} onClick={() => run("open", `/admin/courses/${c.id}/${c.status === "LIVE" ? "close" : "reopen"}`, {})}>{busy === "open" ? <Spinner /> : c.status === "LIVE" ? "Stop new enrolments" : "Reopen enrolment"}</Button>
      </div>
      <div className="rounded-2xl p-4 ring-1 ring-line">
        <p className="text-sm font-medium text-ink">Mentor&rsquo;s fee</p>
        {c.feePaid ? (
          <p className="mt-1 text-sm text-forest">Paid {formatMoney(c.feePaid.amountMinor, c.feePaid.currency)} on {fmtDayShort(c.feePaid.createdAt)}{c.feePaid.reference ? ` · ref ${c.feePaid.reference}` : ""}</p>
        ) : paying ? (
          <div className="mt-2 space-y-2">
            <input className="input" maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transfer reference (optional)" />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPaying(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" disabled={!!busy} onClick={() => run("fee", `/admin/courses/${c.id}/fee-paid`, { reference: ref.trim() || undefined })}>{busy === "fee" ? <Spinner /> : `Record ${formatMoney(c.mentorFeeMinor, c.mentorFeeCurrency)} paid`}</Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-3"><p className="text-sm text-ink-soft">{formatMoney(c.mentorFeeMinor, c.mentorFeeCurrency)} · not paid yet</p><Button size="sm" variant="secondary" onClick={() => setPaying(true)}>Mark paid</Button></div>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function AdminClassRuns({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [show, setShow] = useState(false);
  const { data, loading, reload } = useApi<CourseClassDetail[]>(show ? `/admin/courses/${id}/classes` : null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function complete(n: number) {
    setBusy(n); setError(null);
    try {
      await api(`/admin/courses/${id}/classes/${n}/complete`, { method: "POST", body: {} });
      await reload();
      onChanged();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }
  return (
    <div>
      <button type="button" onClick={() => setShow((v) => !v)} className="font-medium text-ink underline underline-offset-4">{show ? "Hide classes" : "Show classes & attendance"}</button>
      {show && (loading ? <Skeleton className="mt-3 h-20 rounded-2xl" /> : !data?.length ? <p className="mt-3 text-ink-soft">No class dates yet.</p> : (
        <ul className="mt-3 space-y-2">
          {error && <Alert>{error}</Alert>}
          {data.map((k) => (
            <li key={k.number} className="rounded-2xl bg-paper/70 px-4 py-3 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">Class {k.number} · <span className="capitalize text-ink-soft">{k.status}</span></p>
                  <p className="text-xs text-ink-soft">{fmtDay(k.startAt)} · {fmtTime(k.startAt)}–{fmtTime(k.endAt)} · {k.attended}/{k.enrolled} joined</p>
                </div>
                {k.canComplete && <Button size="sm" variant="secondary" disabled={busy === k.number} onClick={() => complete(k.number)}>{busy === k.number ? <Spinner /> : "Mark class complete"}</Button>}
              </div>
              {!!k.attendees.length && (
                <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                  {k.attendees.map((a) => <li key={a.reference}>{a.name} · joined {fmtTime(a.joinedAt)}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Roster({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  const { data, loading } = useApi<{ reference: string; enrolledAt: string; status: string; priceMinor: number; awaitingVerification: boolean; student: { id: string; name: string; email: string; phone: string | null } }[]>(show ? `/admin/courses/${id}/roster` : null);
  return (
    <div>
      <button type="button" onClick={() => setShow((v) => !v)} className="font-medium text-ink underline underline-offset-4">{show ? "Hide learners" : "Show learners"}</button>
      {show && (loading ? <Skeleton className="mt-3 h-20 rounded-2xl" /> : !data?.length ? <p className="mt-3 text-ink-soft">No one has enrolled yet.</p> : (
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
          {data.map((r, i) => (
            <div key={r.reference} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
              <span className="min-w-0"><span className="block font-medium text-ink">{r.student.name}</span><span className="block truncate text-xs text-ink-soft">{r.student.email}{r.student.phone ? ` · ${formatPhone(r.student.phone)}` : ""}</span></span>
              <span className="text-right text-xs text-ink-soft"><Badge tone={r.status === "PENDING_PAYMENT" ? "brass" : "forest"}>{r.status === "PENDING_PAYMENT" ? (r.awaitingVerification ? "Checking payment" : "Paying") : "Enrolled"}</Badge><span className="mt-1 block">{fmtDayShort(r.enrolledAt)} · <Link href="/admin?tab=enrolments" className="underline">{r.reference}</Link></span></span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EarnCell({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <span className={`rounded-2xl px-2.5 py-2 text-left ring-1 ring-ink/5 ${strong ? "bg-ink text-white" : "bg-white/90 text-ink"}`}>
      <span className={`block text-[10px] uppercase tracking-[0.1em] ${strong ? "text-white/55" : "text-ink-soft"}`}>{label}</span>
      <span className={`mt-0.5 block truncate text-sm tabular-nums ${strong ? "font-semibold" : muted ? "font-medium text-ink-soft" : "font-medium"}`}>{value}</span>
    </span>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-ink-soft">{l}</dt><dd className="text-right text-ink">{v}</dd></div>;
}
