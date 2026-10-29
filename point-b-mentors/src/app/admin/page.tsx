"use client";

import { useState, type ReactNode } from "react";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Field, Mark, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { DashboardHero, Panel, StatTile, Tabs, greeting } from "@/components/dashboard";
import { useAuth } from "@/lib/auth";
import { api, errMsg } from "@/lib/api";
import { LEVEL_LABEL, STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtTime, formatMoney, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { AppStatus, Application, Booking, Currency, Level } from "@/lib/types";

const TABS = ["Overview", "Applications", "Mentors", "Bookings", "Pricing & settings", "Activity"] as const;
type Tab = (typeof TABS)[number];

const TONE: Record<string, "neutral" | "brass" | "forest" | "rust"> = {
  SUBMITTED: "neutral", UNDER_REVIEW: "brass", SHORTLISTED: "brass", INTERVIEW_SCHEDULED: "brass", INTERVIEW_COMPLETED: "brass",
  APPROVED: "forest", ONBOARDING: "forest", ACTIVE: "forest", CHANGES_REQUESTED: "rust", WAITLISTED: "neutral", REJECTED: "rust",
  PAUSED: "rust", SUSPENDED: "rust", CONFIRMED: "forest", COMPLETED: "forest", CANCELLED: "rust", NO_SHOW: "rust", PENDING_PAYMENT: "brass",
};

export default function AdminPage() {
  return <RequireRole role="ADMIN"><Console /></RequireRole>;
}

function Console() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Overview");
  const stats = useApi<Stats>("/admin/stats");
  const s = stats.data;
  const toReview = s ? (s.applications.SUBMITTED ?? 0) + (s.applications.UNDER_REVIEW ?? 0) : undefined;
  return (
    <>
      <DashboardHero
        eyebrow={<><span>Administration</span><span aria-hidden>·</span><span>POINT B control centre</span></>}
        title={<>{greeting()}, <Mark color="lilac">{user?.name ?? "admin"}</Mark></>}
        subtitle={toReview ? `${toReview} application${toReview === 1 ? "" : "s"} waiting for review, and ${s?.bookings.CONFIRMED ?? 0} upcoming confirmed session${s?.bookings.CONFIRMED === 1 ? "" : "s"}.` : "Everything is up to date. Here's how the platform is doing."}
        actions={<><Button variant="secondary" href="/mentors">View live site</Button>{!!toReview && <Button onClick={() => setTab("Applications")}>Review applications</Button>}</>}
      >
        <div className="mt-10"><Tabs tabs={TABS} value={tab} onChange={setTab} counts={toReview ? { Applications: toReview } : {}} /></div>
      </DashboardHero>
      <Container className="py-10 sm:py-12">
        {tab === "Overview" && <Overview stats={stats} onReview={() => setTab("Applications")} />}
        {tab === "Applications" && <Applications />}
        {tab === "Mentors" && <Mentors />}
        {tab === "Bookings" && <Bookings />}
        {tab === "Pricing & settings" && <PricingSettings />}
        {tab === "Activity" && <Activity />}
      </Container>
    </>
  );
}

interface Stats {
  applications: Record<string, number>; activeMentors: number; students: number; bookings: Record<string, number>;
  bookingConversion: number | null; repeatStudents: number; commissionConfigured: boolean; commissionPercent: number | null;
  finance: { currency: Currency; grossMinor: number; refundedMinor: number; platformRevenueMinor: number | null; mentorPayoutsMinor: number | null }[];
}

const BOOKING_BARS = [["CONFIRMED", "Confirmed", "bg-sky"], ["COMPLETED", "Completed", "bg-mint"], ["PENDING_PAYMENT", "Awaiting payment", "bg-lemon"], ["CANCELLED", "Cancelled", "bg-peach"], ["NO_SHOW", "No-show", "bg-rust/40"]] as const;
const PIPELINE = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED", "APPROVED", "ONBOARDING"] as const;

function Overview({ stats, onReview }: { stats: { data: Stats | null; loading: boolean; error: string | null }; onReview: () => void }) {
  const { data: s, loading, error } = stats;
  if (loading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}</div>;
  if (error || !s) return <Alert>{error}</Alert>;
  const pipeline = (["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED"] as const).reduce((n, k) => n + (s.applications[k] ?? 0), 0);
  const totalBookings = BOOKING_BARS.reduce((n, [k]) => n + (s.bookings[k] ?? 0), 0);
  const maxStage = Math.max(1, ...PIPELINE.map((k) => s.applications[k] ?? 0));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active mentors" value={s.activeMentors} tone="mint" />
        <StatTile label="Applications in pipeline" value={pipeline} note={`${s.applications.SUBMITTED ?? 0} awaiting first review`} tone="sky" delay={60} />
        <StatTile label="Registered students" value={s.students} tone="peach" delay={120} />
        <StatTile label="Booking conversion" value={s.bookingConversion == null ? "—" : `${Math.round(s.bookingConversion * 100)}%`} note={`${s.repeatStudents} repeat students`} tone="lilac" delay={180} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Bookings" action={<span className="text-sm text-ink-soft">{totalBookings} in total</span>}>
          <div className="flex h-3 overflow-hidden rounded-full bg-paper-dim" aria-hidden>
            {totalBookings > 0 && BOOKING_BARS.map(([k, , c]) => (s.bookings[k] ?? 0) > 0 && <span key={k} className={`${c} h-full`} style={{ width: `${((s.bookings[k] ?? 0) / totalBookings) * 100}%` }} />)}
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {BOOKING_BARS.map(([k, label, c]) => (
              <div key={k}>
                <dt className="flex items-center gap-2 text-xs text-ink-soft"><span className={`h-2.5 w-2.5 rounded-full ${c}`} />{label}</dt>
                <dd className="mt-1 font-display text-3xl text-ink">{s.bookings[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Application pipeline" action={pipeline > 0 ? <button onClick={onReview} className="text-sm font-medium text-ink underline underline-offset-4">Review</button> : undefined}>
          <ul className="space-y-2.5">
            {PIPELINE.map((k) => (
              <li key={k} className="grid grid-cols-[130px_1fr_28px] items-center gap-3 text-sm">
                <span className="truncate text-ink-soft">{STATUS_LABEL[k]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-paper-dim"><span className="block h-full rounded-full bg-ink/80" style={{ width: `${((s.applications[k] ?? 0) / maxStage) * 100}%` }} /></span>
                <span className="text-right text-ink">{s.applications[k] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {!s.commissionConfigured && <Alert tone="info">No commission rate is configured, so platform revenue and mentor payouts are not calculated. Set one under Pricing &amp; settings once the commercial terms are agreed.</Alert>}

      <div className="grid gap-6 md:grid-cols-2">
        {s.finance.map((f) => (
          <Panel key={f.currency}>
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-3 py-1.5 text-xs font-medium text-ink ${f.currency === "PKR" ? "bg-mint" : "bg-sky"}`}>{f.currency === "PKR" ? "Local · PKR" : "International · GBP"}</span>
              {s.commissionPercent != null && <span className="text-xs text-ink-soft">{s.commissionPercent}% commission</span>}
            </div>
            <p className="mt-6 text-sm text-ink-soft">Gross booking value</p>
            <p className="font-display text-5xl leading-tight text-ink">{formatMoney(f.grossMinor, f.currency)}</p>
            <dl className="mt-6 divide-y divide-line text-sm">
              <Line l="Refunded / cancelled" v={formatMoney(f.refundedMinor, f.currency)} />
              <Line l="Platform revenue" v={f.platformRevenueMinor == null ? "Not configured" : formatMoney(f.platformRevenueMinor, f.currency)} />
              <Line l="Mentor payouts due" v={f.mentorPayoutsMinor == null ? "Not configured" : formatMoney(f.mentorPayoutsMinor, f.currency)} />
            </dl>
          </Panel>
        ))}
      </div>
    </div>
  );
}
const Line = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between gap-4 py-2.5"><dt className="text-ink-soft">{l}</dt><dd className="text-right text-ink">{v}</dd></div>;

function Avatar({ name, size = "h-11 w-11 text-sm" }: { name: string; size?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-ink ${size}`} style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>;
}

const APP_FILTERS = ["", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED", "APPROVED", "ONBOARDING", "ACTIVE", "WAITLISTED", "REJECTED"] as const;

function Applications() {
  const list = useApi<Application[]>("/admin/applications");
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const all = list.data ?? [];
  const rows = all.filter((a) => !filter || a.status === filter);
  const selected = openId ?? rows[0]?.id ?? null;
  const count = (k: string) => (k ? all.filter((a) => a.status === k).length : all.length);

  return (
    <div className="space-y-6">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {APP_FILTERS.filter((k) => !k || count(k) > 0).map((k) => (
          <button key={k || "all"} onClick={() => { setFilter(k); setOpenId(null); }}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${filter === k ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink hover:border-ink/40"}`}>
            {k ? STATUS_LABEL[k] : "All"}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${filter === k ? "bg-white/20" : "bg-paper-dim text-ink-soft"}`}>{count(k)}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24 lg:-m-1 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:p-1">
          {list.loading ? <Skeleton className="h-48 rounded-3xl" /> : rows.length === 0 ? <EmptyState title="No applications" description="New mentor applications appear here." /> : (
            <div className="space-y-2">
              {rows.map((a) => {
                const on = selected === a.id;
                return (
                  <button key={a.id} onClick={() => setOpenId(a.id)}
                    className={`flex w-full gap-3 rounded-2xl p-4 text-left transition-all ${on ? "bg-white shadow-[0_12px_32px_-20px_rgba(17,17,17,0.35)] ring-2 ring-ink" : "bg-white ring-1 ring-line hover:ring-ink/30"}`}>
                    <Avatar name={a.fullName} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{a.fullName}</span>
                        <span className="shrink-0 text-[11px] text-ink-soft">{new Date(a.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-soft">{a.headline}</span>
                      <span className="mt-2 flex items-center gap-2"><Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>{a.scorecard && <span className="text-xs text-ink-soft">{a.scorecard.total}/100</span>}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="min-w-0">{selected ? <ApplicationDetail key={selected} id={selected} onChanged={list.reload} /> : <EmptyState title="Select an application" description="Choose an application to review it." />}</div>
      </div>
    </div>
  );
}

/** Quick starters for a change request; the admin edits the text before sending. */
const CHANGE_PROMPTS = ["Add a working LinkedIn profile link", "Add more detail about your experience", "Clarify your current role and organisation", "List the topics you can mentor on", "Add your qualifications", "Tell us more about your availability"];

const SCORE_FIELDS = [["experience", "Professional experience", 25], ["expertise", "Subject expertise", 25], ["communication", "Communication", 20], ["approach", "Mentorship approach", 20], ["conduct", "Professional conduct & safeguarding", 10]] as const;

function ApplicationDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data: a, loading, error, reload } = useApi<Application>(`/admin/applications/${id}`);
  const [score, setScore] = useState<Record<string, number> | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [reqText, setReqText] = useState("");

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (error || !a) return <Alert>{error}</Alert>;
  const sc = score ?? (a.scorecard ? { ...a.scorecard } : { experience: 0, expertise: 0, communication: 0, approach: 0, conduct: 0 });
  const total = SCORE_FIELDS.reduce((n, [k]) => n + (sc[k] ?? 0), 0);
  const noteText = notes ?? a.internalNotes;
  const threshold = a.passThreshold ?? 75;
  const canScore = ["INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED"].includes(a.status);
  const canRequest = a.status === "CHANGES_REQUESTED" || (a.allowedTransitions ?? []).includes("CHANGES_REQUESTED");

  async function run(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ tone: "success", text: success ?? "Saved." }); await reload(); onChanged(); }
    catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(null); }
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6 sm:p-8">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={a.fullName} size="h-14 w-14 text-lg" />
          <div className="min-w-0"><p className="font-display text-3xl leading-tight text-ink">{a.fullName}</p><p className="text-sm text-ink-soft">{a.headline}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <a href={a.linkedinUrl} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40">LinkedIn ↗</a>
          <Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
        </div>
      </div>
      <div className="space-y-8 p-6 sm:p-8">
      {a.resubmittedAt && (
        <div className="flex items-start gap-3 rounded-2xl bg-mint/60 px-5 py-4 text-sm text-ink">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="mt-0.5 shrink-0 text-forest" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Updated by the applicant on {fmtDay(a.resubmittedAt)} at {fmtTime(a.resubmittedAt)}{(a.resubmissionCount ?? 0) > 1 ? ` (${a.resubmissionCount} updates in total)` : ""}. The details below are the latest version.</span>
        </div>
      )}
      <Section title="Application">
      <dl className="grid gap-x-8 rounded-2xl bg-paper px-5 py-2 text-sm sm:grid-cols-2">
        {([["Email", a.email], ["Phone", a.phone], ["Professional location", a.professionalLocation], ["Residence", a.countryOfResidence], ["Experience", `${a.yearsExperience} years`], ["Industry", a.industry], ["Qualifications", a.qualifications || "—"], ["Languages", a.languages.join(", ")], ["Availability", a.weeklyAvailability], ["Participation", a.participation], ["Pricing preference", a.preferredPricing], ["Submitted", fmtDay(a.submittedAt)]] as const).map(([l, v]) => <div key={l} className="border-b border-line/70 last:border-0 sm:[&:nth-last-child(2)]:border-0"><Line l={l} v={v} /></div>)}
      </dl>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Quote label="Why they want to mentor" text={a.motivation} />
        {a.previousMentorshipExperience && <Quote label="Mentoring experience" text={a.previousMentorshipExperience} />}
      </div>
      </Section>

      <Section title="Interview scorecard" aside={!canScore && !a.scorecard ? <span className="text-xs text-ink-soft">Available once an interview is scheduled</span> : undefined}>
        <div className="space-y-4">
          {SCORE_FIELDS.map(([k, label, max]) => (
            <div key={k}>
              <div className="flex justify-between text-xs text-ink-soft"><label htmlFor={`s-${k}`}>{label}</label><span>{sc[k]} / {max}</span></div>
              <input id={`s-${k}`} type="range" min={0} max={max} value={sc[k]} disabled={!canScore} onChange={(e) => setScore({ ...sc, [k]: Number(e.target.value) })} className="mt-1 w-full accent-ink disabled:opacity-50" />
            </div>
          ))}
        </div>
        <div className={`mt-4 flex items-center justify-between rounded-2xl px-5 py-4 ${total >= threshold ? "bg-mint" : "bg-paper-dim"}`}>
          <span className="text-sm font-medium text-ink">Total score{total >= threshold ? " · above threshold" : ""}</span><span className="font-display text-3xl text-ink">{total}<span className="text-base text-ink-soft"> / 100</span></span>
        </div>
        <p className="mt-2 text-xs text-ink-soft">Suggested threshold is {threshold}/100. A score never approves a mentor automatically; identity and suitability are checked separately.</p>
        <Button size="sm" variant="secondary" className="mt-3" disabled={!canScore || busy === "score"} onClick={() => run("score", () => api(`/admin/applications/${id}/scorecard`, { method: "PUT", body: sc }), "Scorecard saved.")}>{busy === "score" ? <Spinner /> : "Save scorecard"}</Button>
      </Section>

      <Section title="Verification & notes">
        <label className="flex items-center gap-2.5 rounded-2xl bg-paper px-4 py-3 text-sm text-ink"><input type="checkbox" className="accent-ink" checked={a.identityVerified} onChange={(e) => run("id", () => api(`/admin/applications/${id}/identity`, { method: "PATCH", body: { verified: e.target.checked } }))} />Identity verified by an authorised reviewer</label>
        <div className="mt-4"><Field label="Internal notes / decision rationale"><textarea className="input min-h-20" value={noteText} onChange={(e) => setNotes(e.target.value)} /></Field></div>
        <Button size="sm" variant="secondary" className="mt-3" disabled={busy === "notes"} onClick={() => run("notes", () => api(`/admin/applications/${id}/notes`, { method: "PATCH", body: { notes: noteText } }), "Notes saved.")}>Save notes</Button>
      </Section>

      <Section title="Decision">
        {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

        {a.changesRequested && !requesting && (
          <div className="mb-4 rounded-2xl border-l-4 border-brass bg-white p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-brass-dark">Changes requested{a.changesRequestedAt ? ` · ${fmtDay(a.changesRequestedAt)}` : ""}</p>
              {a.status === "CHANGES_REQUESTED" && <button type="button" onClick={() => { setReqText(a.changesRequested ?? ""); setRequesting(true); }} className="text-xs font-medium text-ink underline underline-offset-2">Edit and resend</button>}
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{a.changesRequested}</p>
            <p className="mt-2 text-xs text-ink-soft">
              {a.status === "CHANGES_REQUESTED" && a.editTokenExpiresAt
                ? `Emailed to ${a.email} with a private, single-use update link, valid until ${fmtDay(a.editTokenExpiresAt)}. It closes automatically when they resubmit or you change the status.`
                : `Emailed to ${a.email}. The update link is closed.`}
            </p>
          </div>
        )}

        {requesting ? (
          <div className="mb-4 rounded-2xl bg-paper p-5">
            <p className="font-display text-xl text-ink">Request changes from {a.fullName.split(" ")[0]}</p>
            <p className="mt-1 text-sm text-ink-soft">Explain what needs correcting or adding. This is emailed to the applicant exactly as written, so keep it clear and friendly.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CHANGE_PROMPTS.map((t) => (
                <button key={t} type="button" onClick={() => setReqText((v) => (v.trim() ? `${v.trimEnd()}\n` : "") + `• ${t}`)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40">+ {t}</button>
              ))}
            </div>
            <textarea className="input mt-3 min-h-36 leading-relaxed" maxLength={3000} value={reqText} onChange={(e) => setReqText(e.target.value)}
              placeholder={"e.g.\n• Please add a working link to your LinkedIn profile.\n• Tell us more about the teams you've led and for how long."} />
            <div className="mt-1 flex justify-between text-xs text-ink-soft"><span>Sent to {a.email}</span><span>{reqText.trim().length}/3000 · at least 10 characters</span></div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy === "req"} onClick={() => setRequesting(false)}>Cancel</Button>
              <Button size="sm" disabled={reqText.trim().length < 10 || busy === "req"} onClick={() => run("req", async () => { await api(`/admin/applications/${id}/request-changes`, { body: { message: reqText } }); setRequesting(false); }, `Change request emailed to ${a.email}.`)}>{busy === "req" ? <Spinner /> : "Send request"}</Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canRequest && !requesting && (
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { setReqText(""); setRequesting(true); }}>{a.status === "CHANGES_REQUESTED" ? "Send another request" : "Request changes"}</Button>
          )}
          {(a.allowedTransitions ?? []).length === 0 && <p className="text-sm text-ink-soft">No further status changes are available.</p>}
          {(a.allowedTransitions ?? []).filter((n: AppStatus) => n !== "CHANGES_REQUESTED").map((n: AppStatus) => (
            <Button key={n} size="sm" variant={["REJECTED", "SUSPENDED"].includes(n) ? "danger" : "primary"} disabled={!!busy} onClick={() => run("st-" + n, () => api(`/admin/applications/${id}/status`, { method: "PATCH", body: { status: n, notes: noteText || undefined } }), n === "ONBOARDING" ? `Moved to Onboarding. ${a.fullName.split(" ")[0]} has been emailed a private link to set their password.` : `Moved to ${STATUS_LABEL[n]}.`)}>{busy === "st-" + n ? <Spinner /> : STATUS_LABEL[n]}</Button>
          ))}
        </div>
      </Section>
      </div>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-display text-2xl text-ink">{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line p-5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{text}</p>
    </div>
  );
}

interface AdminMentor { id: string; slug: string; level: Level; category: string; status: string; verified: boolean; isDemo: boolean; priceMinor: number; currency: Currency; priceOverrideMinor: number | null; sessionsCompleted: number; user: { name: string; email: string } }

function Mentors() {
  const { data, loading, error, reload } = useApi<AdminMentor[]>("/admin/mentors");
  if (loading) return <Skeleton className="h-64 rounded-3xl" />;
  if (error) return <Alert>{error}</Alert>;
  if (!data?.length) return <EmptyState title="No mentors yet" description="Mentors appear here once an application reaches onboarding." />;
  return <div className="grid gap-4 xl:grid-cols-2">{data.map((m) => <MentorRow key={m.id} m={m} onSaved={reload} />)}</div>;
}

function MentorRow({ m, onSaved }: { m: AdminMentor; onSaved: () => void }) {
  const [level, setLevel] = useState(m.level);
  const [status, setStatus] = useState(m.status);
  const [override, setOverride] = useState(m.priceOverrideMinor == null ? "" : String(m.priceOverrideMinor / 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = level !== m.level || status !== m.status || override !== (m.priceOverrideMinor == null ? "" : String(m.priceOverrideMinor / 100));

  async function save() {
    setBusy(true); setMsg(null);
    try { await api(`/admin/mentors/${m.id}`, { method: "PATCH", body: { level, status, priceOverrideMinor: override === "" ? null : Math.round(Number(override) * 100) } }); onSaved(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={m.user.name} size="h-12 w-12 text-base" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-display text-2xl leading-tight text-ink">{m.user.name}{m.isDemo && <Badge>Demo</Badge>}</p>
            <p className="truncate text-xs text-ink-soft">{m.user.email}</p>
          </div>
        </div>
        <Badge tone={TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-paper p-1 text-center">
        <div className="rounded-xl py-2.5"><p className="font-display text-xl text-ink">{formatMoney(m.priceMinor, m.currency)}</p><p className="text-[11px] text-ink-soft">{m.priceOverrideMinor != null ? "Custom price" : "Tier price"}</p></div>
        <div className="rounded-xl py-2.5"><p className="font-display text-xl text-ink">{m.sessionsCompleted}</p><p className="text-[11px] text-ink-soft">Completed</p></div>
        <div className="rounded-xl py-2.5"><p className="font-display text-xl text-ink">{m.category === "LOCAL" ? "Local" : "Intl."}</p><p className="text-[11px] text-ink-soft">{LEVEL_LABEL[m.level].split(" /")[0]}</p></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 sm:items-end">
        <Field label="Level"><select className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{["ONBOARDING", "ACTIVE", "PAUSED", "SUSPENDED"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
        <Field label={`Price override (${m.currency})`}><input className="input" type="number" min={0} step="0.01" value={override} placeholder="Tier price" onChange={(e) => setOverride(e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : dirty ? "Save changes" : "Saved"}</Button></div>
      {msg && <div className="mt-3"><Alert>{msg}</Alert></div>}
    </div>
  );
}

type AdminBooking = Booking & { student: { name: string; email: string }; slot: { startAt: string }; mentor: { user: { name: string } }; payments: { status: string }[] };

function Bookings() {
  const [status, setStatus] = useState("");
  const { data, loading, error } = useApi<AdminBooking[]>(`/admin/bookings${status ? `?status=${status}` : ""}`);
  return (
    <Panel title="Bookings" action={data ? <span className="text-sm text-ink-soft">{data.length} shown</span> : undefined}>
      <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1">
        {["", "PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"].map((k) => (
          <button key={k || "all"} onClick={() => setStatus(k)} className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${status === k ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink/40"}`}>{k ? STATUS_LABEL[k] : "All"}</button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? <Skeleton className="h-48" /> : !data?.length ? <EmptyState title="No bookings" description="Bookings appear here as students book sessions." /> : (
        <div className="-mx-6 overflow-x-auto sm:-mx-7">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-ink-soft"><tr className="border-y border-line bg-paper/60">{["Booking", "Student", "Mentor", "When", "Amount", "Payment", "Status"].map((h) => <th key={h} className="px-4 py-3 font-medium first:pl-6 last:pr-6 sm:first:pl-7 sm:last:pr-7">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{data.map((b) => (
              <tr key={b.id} className="transition-colors hover:bg-paper/60">
                <td className="py-3.5 pl-6 pr-4 font-mono text-xs text-ink sm:pl-7">{b.reference}</td>
                <td className="px-4 py-3.5"><span className="flex items-center gap-2.5"><Avatar name={b.student.name} size="h-7 w-7 text-[10px]" /><span className="text-ink">{b.student.name}</span></span></td>
                <td className="px-4 py-3.5 text-ink">{b.mentor.user.name}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-ink-soft">{new Date(b.slot.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {fmtTime(b.slot.startAt)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-ink">{formatMoney(b.priceMinor, b.currency)}</td>
                <td className="px-4 py-3.5 text-xs text-ink-soft">{b.payments[0]?.status ? b.payments[0].status.charAt(0) + b.payments[0].status.slice(1).toLowerCase() : "—"}</td>
                <td className="py-3.5 pl-4 pr-6 sm:pr-7"><Badge tone={TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PricingSettings() {
  const rules = useApi<{ level: Level; currency: Currency; priceMinor: number; isDefault: boolean }[]>("/admin/pricing");
  const settings = useApi<Record<string, string>>("/admin/settings");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [sv, setSv] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function savePrice(level: Level, currency: Currency, major: string) {
    try { await api("/admin/pricing", { method: "PUT", body: { level, currency, priceMinor: Math.round(Number(major) * 100) } }); setEdits((e) => { const n = { ...e }; delete n[`${level}-${currency}`]; return n; }); setMsg({ tone: "success", text: "Price updated." }); rules.reload(); }
    catch (e) { setMsg({ tone: "error", text: errMsg(e) }); }
  }
  async function saveSetting(key: string) {
    try { await api("/admin/settings", { method: "PUT", body: { key, value: sv[key] } }); setMsg({ tone: "success", text: "Setting saved." }); settings.reload(); }
    catch (e) { setMsg({ tone: "error", text: errMsg(e) }); }
  }

  return (
    <div className="space-y-10">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <section>
        <h2 className="font-display text-3xl text-ink">Tier pricing</h2>
        <p className="mt-1 text-sm text-ink-soft">Default price per 30-minute session. Individual mentors can be overridden in the Mentors tab.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l, i) => (
            <div key={l} className="rounded-3xl bg-white p-6 ring-1 ring-line">
              <span className={`inline-block rounded-full px-3 py-1.5 text-xs font-medium text-ink ${["bg-sky", "bg-mint", "bg-lilac"][i]}`}>Tier {i + 1}</span>
              <p className="mt-4 font-display text-2xl leading-tight text-ink">{LEVEL_LABEL[l]}</p>
              {(["PKR", "GBP"] as const).map((c) => {
                const r = rules.data?.find((x) => x.level === l && x.currency === c);
                const k = `${l}-${c}`;
                return (
                  <div key={c} className="mt-3 flex items-end gap-2">
                    <Field label={c}><input className="input" type="number" min={0} step="0.01" value={edits[k] ?? (r ? String(r.priceMinor / 100) : "")} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} /></Field>
                    <Button size="sm" variant="secondary" disabled={edits[k] === undefined} onClick={() => savePrice(l, c, edits[k])}>Save</Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-3xl text-ink">Commercial settings</h2>
        <p className="mt-1 text-sm text-ink-soft">Platform-wide rules. Changes apply to new bookings straight away.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {([["commission_percent", "Platform commission (%)", "Leave unset until commercial terms are agreed."], ["reschedule_notice_hours", "Rescheduling notice (hours)", "Default is 48 hours (2 days) if unset."], ["group_price_percent", "Group seat price (% of 1:1)", "Default is 40%. Applies to every mentor, per seat."]] as const).map(([k, label, hint]) => (
            <div key={k} className="rounded-3xl bg-white p-6 ring-1 ring-line">
              <div className="flex items-end gap-2">
                <Field label={label} hint={hint}><input className="input" type="number" min={0} value={sv[k] ?? settings.data?.[k] ?? ""} onChange={(e) => setSv({ ...sv, [k]: e.target.value })} /></Field>
                <Button size="sm" variant="secondary" disabled={sv[k] === undefined || sv[k] === ""} onClick={() => saveSetting(k)}>Save</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Activity() {
  const log = useApi<{ id: string; action: string; entityType: string; entityId: string; detail: string; createdAt: string; admin: { name: string } }[]>("/admin/audit-log");
  const outbox = useApi<{ id: string; toEmail: string; subject: string; sentAt: string }[]>("/admin/outbox");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Audit log" action={<span className="text-xs text-ink-soft">Latest 50</span>}>
        {log.loading ? <Skeleton className="h-32" /> : !log.data?.length ? <p className="text-sm text-ink-soft">No admin activity yet.</p> : (
          <ol className="relative space-y-5 border-l border-line pl-6">
            {log.data.slice(0, 50).map((l) => (
              <li key={l.id} className="relative">
                <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-ink ring-4 ring-white" />
                <p className="text-sm text-ink first-letter:uppercase">{l.action.replaceAll("_", " ").toLowerCase()} <span className="text-ink-soft">· {l.entityType.replace(/([a-z])([A-Z])/g, "$1 $2")}</span></p>
                <p className="mt-0.5 text-xs text-ink-soft">{l.admin.name} · {fmtDay(l.createdAt)} {fmtTime(l.createdAt)}</p>
                {l.detail && <p className="mt-1.5 line-clamp-2 rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">{l.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel title="Email outbox" action={<span className="text-xs text-ink-soft">Latest 50</span>}>
        <p className="-mt-2 mb-4 text-xs text-ink-soft">Every email the platform sends is recorded here, whether or not SMTP delivery is configured.</p>
        {outbox.loading ? <Skeleton className="h-32" /> : !outbox.data?.length ? <p className="text-sm text-ink-soft">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {outbox.data.slice(0, 50).map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{n.subject}</p>
                  <p className="truncate text-xs text-ink-soft">{n.toEmail} · {fmtDay(n.sentAt)} {fmtTime(n.sentAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
