"use client";

import { useState, type ReactNode } from "react";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Field, Mark, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { DashboardHero, DateTile, Panel, StatTile, Tabs, greeting } from "@/components/dashboard";
import { useAuth } from "@/lib/auth";
import { api, errMsg } from "@/lib/api";
import { LEVEL_LABEL, STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtDayShort, fmtTime, formatMoney, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { ToastProvider, useToast } from "@/components/toast";
import { UserTracking } from "@/components/user-tracking";
import { WhatsAppDelivery } from "@/components/whatsapp-delivery";
import { useUrlTab } from "@/lib/use-url-tab";
import { CountrySelect, isLocalCountry } from "@/components/country-select";
import { Flag, countryIn } from "@/components/flag";
import { formatPhone } from "@/components/phone-input";
import type { AdminInterview, AppStatus, Application, Booking, Currency, Level } from "@/lib/types";

const TABS = ["Overview", "Applications", "Mentors", "Bookings", "Pricing & settings", "User tracking", "Activity"] as const;

const TONE: Record<string, "neutral" | "brass" | "forest" | "rust"> = {
  SUBMITTED: "neutral", UNDER_REVIEW: "brass", SHORTLISTED: "brass", INTERVIEW_SCHEDULED: "brass", INTERVIEW_COMPLETED: "brass",
  APPROVED: "forest", ONBOARDING: "forest", ACTIVE: "forest", CHANGES_REQUESTED: "rust", WAITLISTED: "neutral", REJECTED: "rust",
  PAUSED: "rust", SUSPENDED: "rust", CONFIRMED: "forest", COMPLETED: "forest", CANCELLED: "rust", NO_SHOW: "rust", PENDING_PAYMENT: "brass",
};

export default function AdminPage() {
  return <RequireRole role="ADMIN"><ToastProvider><Console /></ToastProvider></RequireRole>;
}

function Console() {
  const { user } = useAuth();
  const [tab, setTab] = useUrlTab(TABS, "Overview");
  const [focusId, setFocusId] = useState<string | null>(null);
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
        {tab === "Overview" && <Overview stats={stats} onReview={() => setTab("Applications")} onOpenApp={(id) => { setFocusId(id); setTab("Applications"); }} />}
        {tab === "Applications" && <Applications initialId={focusId} />}
        {tab === "Mentors" && <Mentors />}
        {tab === "Bookings" && <Bookings />}
        {tab === "Pricing & settings" && <PricingSettings />}
        {tab === "User tracking" && <UserTracking />}
        {tab === "Activity" && <Activity />}
      </Container>
    </>
  );
}

interface Stats {
  applications: Record<string, number>; activeMentors: number; students: number; bookings: Record<string, number>;
  bookingConversion: number | null; repeatStudents: number; commissionConfigured: boolean; commission: { tier: Record<Level, number | null>; repeat: number };
  video: { usedMinutes: number; limitMinutes: number; source: "daily" | "estimate" };
  finance: { currency: Currency; grossMinor: number; refundedMinor: number; platformRevenueMinor: number | null; mentorPayoutsMinor: number | null; discountsMinor: number; repeatSessions: number }[];
}

const BOOKING_BARS = [["CONFIRMED", "Confirmed", "bg-sky"], ["COMPLETED", "Completed", "bg-mint"], ["PENDING_PAYMENT", "Awaiting payment", "bg-lemon"], ["CANCELLED", "Cancelled", "bg-peach"], ["NO_SHOW", "No-show", "bg-rust/40"]] as const;
const PIPELINE = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED", "APPROVED", "ONBOARDING"] as const;

function Overview({ stats, onReview, onOpenApp }: { stats: { data: Stats | null; loading: boolean; error: string | null }; onReview: () => void; onOpenApp: (id: string) => void }) {
  const { data: s, loading, error } = stats;
  const interviews = useApi<AdminInterview[]>("/admin/interviews");
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

      <BankTransfers />

      <VideoUsage v={s.video} />

      <Panel title="Mentor interviews" action={<span className="text-sm text-ink-soft">{interviews.data?.length ?? 0} scheduled</span>}>
        {interviews.loading ? <Skeleton className="h-20 rounded-2xl" /> : !interviews.data?.length ? (
          <p className="text-sm text-ink-soft">No interviews booked. Shortlist an applicant, then use Schedule interview on their application.</p>
        ) : (
          <ul className="space-y-3">
            {interviews.data.map((iv) => (
              <li key={iv.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-paper p-3 pr-4">
                <DateTile iso={iv.interviewAt} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{iv.fullName}</p>
                  <p className="truncate text-xs text-ink-soft">{iv.headline}</p>
                  <p className="mt-1 text-sm text-ink">{fmtTime(iv.interviewAt)} · {iv.interviewDurationMin ?? 30} min · {iv.phone}</p>
                </div>
                <a href={`/interview/${iv.id}`} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40">Join</a>
                <Button size="sm" variant="secondary" onClick={() => onOpenApp(iv.id)}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

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

      {!s.commissionConfigured && <Alert tone="info">No platform commission is configured for every tier, so platform revenue and mentor payouts are not calculated. Set the tier rates under Pricing &amp; settings.</Alert>}

      <div className="grid gap-6 md:grid-cols-2">
        {s.finance.map((f) => (
          <Panel key={f.currency}>
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-3 py-1.5 text-xs font-medium text-ink ${f.currency === "PKR" ? "bg-mint" : "bg-sky"}`}>{f.currency === "PKR" ? "Local · PKR" : "International · GBP"}</span>
              {s.commissionConfigured && <span className="text-xs text-ink-soft">Tier commission · {s.commission.repeat}% for returning students</span>}
            </div>
            <p className="mt-6 text-sm text-ink-soft">Gross booking value</p>
            <p className="font-display text-5xl leading-tight text-ink">{formatMoney(f.grossMinor, f.currency)}</p>
            <dl className="mt-6 divide-y divide-line text-sm">
              <Line l="Refunded / cancelled" v={formatMoney(f.refundedMinor, f.currency)} />
              <Line l="Platform revenue" v={f.platformRevenueMinor == null ? "Not configured" : formatMoney(f.platformRevenueMinor, f.currency)} />
              <Line l="Mentor payouts due" v={f.mentorPayoutsMinor == null ? "Not configured" : formatMoney(f.mentorPayoutsMinor, f.currency)} />
              <Line l="Promo discounts given" v={formatMoney(f.discountsMinor, f.currency)} />
              <Line l="Returning-student sessions" v={String(f.repeatSessions)} />
            </dl>
          </Panel>
        ))}
      </div>
    </div>
  );
}
/** Green below 60% of the video allowance, amber from 60%, red from 85%. */
const ZONES = [{ to: 60, label: "Healthy", bar: "bg-forest", soft: "bg-mint", text: "text-forest" }, { to: 85, label: "Getting high", bar: "bg-brass", soft: "bg-lemon", text: "text-brass-dark" }, { to: 100, label: "Near the limit", bar: "bg-rust", soft: "bg-peach", text: "text-rust" }] as const;

function VideoUsage({ v }: { v: Stats["video"] }) {
  const pct = Math.min(100, (v.usedMinutes / v.limitMinutes) * 100);
  const zone = ZONES.find((z) => pct <= z.to) ?? ZONES[2];
  const left = Math.max(0, v.limitMinutes - v.usedMinutes);
  const n = (x: number) => x.toLocaleString("en-GB");
  return (
    <Panel title="Video minutes" action={<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${zone.soft} ${zone.text}`}><span className={`h-2 w-2 rounded-full ${zone.bar}`} />{zone.label}</span>}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Used so far</p>
          <p className="mt-2 flex items-baseline gap-2 tabular-nums">
            <span className="font-display text-6xl leading-none tracking-normal text-ink">{n(v.usedMinutes)}</span>
            <span className="text-sm font-medium text-ink-soft">min</span>
          </p>
          <p className="mt-2 text-sm text-ink-soft tabular-nums">of {n(v.limitMinutes)} minute allowance</p>
        </div>
        <div>
          <div className="mb-3 flex items-baseline justify-between text-sm tabular-nums">
            <span className="font-medium text-ink">{pct < 10 ? pct.toFixed(1) : Math.round(pct)}% used</span>
            <span className="text-ink-soft">{n(left)} min remaining</span>
          </div>
          <div className="relative">
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
              <span className="h-full w-[60%] bg-forest/15" /><span className="h-full w-[25%] bg-brass/20" /><span className="h-full w-[15%] bg-rust/20" />
            </div>
            <span className={`absolute inset-y-0 left-0 rounded-full ${zone.bar} transition-all duration-700`} style={{ width: `max(${pct}%, 0.75rem)` }} role="progressbar" aria-valuemin={0} aria-valuemax={v.limitMinutes} aria-valuenow={v.usedMinutes} aria-label="Video minutes used" />
            <span className="pointer-events-none absolute -inset-y-1 left-[60%] w-px bg-white" aria-hidden /><span className="pointer-events-none absolute -inset-y-1 left-[85%] w-px bg-white" aria-hidden />
          </div>
          <div className="relative mt-2 h-4 text-[11px] text-ink-soft tabular-nums" aria-hidden>
            <span className="absolute left-0">0</span>
            <span className="absolute -translate-x-1/2" style={{ left: "60%" }}>{n(v.limitMinutes * 0.6)}</span>
            <span className="absolute -translate-x-1/2" style={{ left: "85%" }}>{n(v.limitMinutes * 0.85)}</span>
            <span className="absolute right-0">{n(v.limitMinutes)}</span>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4 text-xs text-ink-soft">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-forest" />Under 60%</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brass" />60% to 85%</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rust" />Over 85%</li>
        </ul>
        <p>{v.source === "daily" ? "Live from the video provider: every participant\u2019s time, rounded up to whole minutes." : "Estimate: the provider\u2019s records couldn\u2019t be reached."}</p>
      </div>
    </Panel>
  );
}

const Line = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between gap-4 py-2.5"><dt className="text-ink-soft">{l}</dt><dd className="text-right text-ink">{v}</dd></div>;

function Avatar({ name, size = "h-11 w-11 text-sm" }: { name: string; size?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-ink ${size}`} style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>;
}

const APP_FILTERS = ["", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED", "APPROVED", "ONBOARDING", "ACTIVE", "WAITLISTED", "REJECTED"] as const;

function Applications({ initialId }: { initialId: string | null }) {
  const list = useApi<Application[]>("/admin/applications");
  const [openId, setOpenId] = useState<string | null>(initialId);
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
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [iv, setIv] = useState<{ at: string; mins: number; note: string } | null>(null);

  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (error || !a) return <Alert>{error}</Alert>;
  const sc = score ?? (a.scorecard ? { ...a.scorecard } : { experience: 0, expertise: 0, communication: 0, approach: 0, conduct: 0 });
  const total = SCORE_FIELDS.reduce((n, [k]) => n + (sc[k] ?? 0), 0);
  const noteText = notes ?? a.internalNotes;
  const threshold = a.passThreshold ?? 75;
  const canScore = ["INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED"].includes(a.status);
  const canSchedule = ["SHORTLISTED", "INTERVIEW_SCHEDULED"].includes(a.status);
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
      <Section title="Application" aside={!edit ? <button type="button" onClick={() => setEdit(toEditForm(a))} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40">Edit details</button> : undefined}>
      {edit ? (
        <div className="rounded-2xl bg-paper p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {EDIT_FIELDS.map(([k, label, kind]) => (
              <div key={k} className={kind === "area" ? "sm:col-span-2" : ""}>
                <Field label={label}>
                  {kind === "country" ? <CountrySelect value={edit[k]} onChange={(c) => setEdit({ ...edit, [k]: c })} />
                    : kind === "area" ? <textarea className="input min-h-24" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                    : kind === "participation" ? <select className="input" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}><option>Paid</option><option>Voluntary</option></select>
                    : <input className="input" type={kind === "number" ? "number" : "text"} min={kind === "number" ? 0 : undefined} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}
                </Field>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-soft">Languages are comma-separated. Changes are saved to the application and recorded in the activity log. The applicant is not emailed.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={busy === "edit"} onClick={() => setEdit(null)}>Cancel</Button>
            <Button size="sm" disabled={busy === "edit"} onClick={() => run("edit", async () => { await api(`/admin/applications/${id}/details`, { method: "PATCH", body: fromEditForm(edit) }); setEdit(null); }, "Application details updated.")}>{busy === "edit" ? <Spinner /> : "Save changes"}</Button>
          </div>
        </div>
      ) : (<>
      <dl className="grid gap-x-8 rounded-2xl bg-paper px-5 py-2 text-sm sm:grid-cols-2">
        {([["Email", a.email], ["Phone", formatPhone(a.phone)], ["Based in", `${basedIn(a)} · ${/pakistan/i.test(a.countryOfResidence || a.professionalLocation) ? "Local" : "International"}`], ["Experience", `${a.yearsExperience} years`], ["Industry", a.industry], ["Qualifications", a.qualifications || "Not provided"], ["Languages", a.languages.join(", ")], ["Participation", a.participation], ["Good at", a.specialistAreas.join(", ") || "—"], ["Strongest points", a.strengths?.join(", ") || "—"], ["Topics", a.topicsOffered.join(", ") || "—"], ["Submitted", fmtDay(a.submittedAt)]] as const).map(([l, v]) => <div key={l} className="border-b border-line/70 last:border-0 sm:[&:nth-last-child(2)]:border-0"><Line l={l} v={v} /></div>)}
      </dl>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Quote label="Why they want to mentor" text={a.motivation} />
        {a.previousMentorshipExperience && <Quote label="Mentoring experience" text={a.previousMentorshipExperience} />}
      </div>
      </>)}
      </Section>

      <Section title="Interview">
        {a.interviewAt && a.status === "INTERVIEW_SCHEDULED" && !iv && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-2xl bg-lemon/60 p-4 sm:p-5">
            <DateTile iso={a.interviewAt} />
            <div className="min-w-[14rem] flex-1 text-sm">
              <p className="font-medium text-ink">{fmtDay(a.interviewAt)}, {fmtTime(a.interviewAt)} · {a.interviewDurationMin ?? 30} min</p>
              <p className="text-ink-soft">Online on POINT B · opens 10 minutes before the start</p>
              {a.interviewNote && <p className="mt-1 text-ink-soft">{a.interviewNote}</p>}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
              <a href={`/interview/${a.id}`} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">Join interview</a>
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { if (new Date(a.interviewAt!).getTime() > Date.now() && !window.confirm("This interview hasn't started yet. Mark it completed anyway?")) return; run("done", () => api(`/admin/applications/${id}/status`, { method: "PATCH", body: { status: "INTERVIEW_COMPLETED" } }), "Interview marked completed. Next, record the scorecard below, then make your decision."); }}>{busy === "done" ? <Spinner /> : "Mark interview completed"}</Button>
              <Button size="sm" variant="secondary" onClick={() => setIv({ at: toLocalInput(a.interviewAt!), mins: a.interviewDurationMin ?? 30, note: a.interviewNote ?? "" })}>Reschedule</Button>
            </div>
          </div>
        )}
        {a.interviewAt && a.status === "INTERVIEW_COMPLETED" && (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-mint/50 p-4">
            <DateTile iso={a.interviewAt} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-ink">Interview completed</p>
              <p className="text-ink-soft">{fmtDay(a.interviewAt)}, {fmtTime(a.interviewAt)}. {a.scorecard ? `Scored ${a.scorecard.total}/100.` : "Record the scorecard below, then make your decision."}</p>
            </div>
          </div>
        )}
        {!canSchedule && !a.interviewAt && <p className="text-sm text-ink-soft">Available once the applicant is shortlisted.</p>}
        {canSchedule && !a.interviewAt && !iv && (
          <div className="rounded-2xl bg-paper p-4 text-sm text-ink-soft">
            Call {a.fullName.split(" ")[0]} on {a.phone}, agree a time, then record it here. A video room is created in POINT B and they are emailed a private join link. It appears on your Overview.
            <div className="mt-3"><Button size="sm" onClick={() => setIv({ at: "", mins: 30, note: "" })}>Schedule interview</Button></div>
          </div>
        )}
        {iv && (
          <div className="rounded-2xl bg-paper p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date and time (your timezone)"><input type="datetime-local" className="input" value={iv.at} min={toLocalInput(new Date().toISOString())} onChange={(e) => setIv({ ...iv, at: e.target.value })} /></Field>
              <Field label="Duration"><select className="input" value={iv.mins} onChange={(e) => setIv({ ...iv, mins: Number(e.target.value) })}>{[20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></Field>
            </div>
            <p className="mt-4 rounded-xl bg-white px-4 py-3 text-xs text-ink-soft">The interview runs in a POINT B video room, like mentoring sessions. The applicant gets a private join link by email; you join from here or your Overview.</p>
            <div className="mt-4"><Field label="Note to the applicant (optional)"><textarea className="input min-h-16" maxLength={1000} value={iv.note} onChange={(e) => setIv({ ...iv, note: e.target.value })} /></Field></div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy === "iv"} onClick={() => setIv(null)}>Cancel</Button>
              <Button size="sm" disabled={!iv.at || busy === "iv"} onClick={() => run("iv", async () => { await api(`/admin/applications/${id}/interview`, { method: "PUT", body: { startAt: new Date(iv.at).toISOString(), durationMinutes: iv.mins, note: iv.note || undefined } }); setIv(null); }, `Interview booked. ${a.fullName.split(" ")[0]} has been emailed the details.`)}>{busy === "iv" ? <Spinner /> : a.status === "INTERVIEW_SCHEDULED" ? "Save new time" : "Book and email"}</Button>
            </div>
          </div>
        )}
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
          {(a.allowedTransitions ?? []).filter((n: AppStatus) => n !== "INTERVIEW_SCHEDULED").length === 0 && <p className="text-sm text-ink-soft">No further status changes are available.</p>}
          {(a.allowedTransitions ?? []).filter((n: AppStatus) => n !== "CHANGES_REQUESTED" && n !== "INTERVIEW_SCHEDULED").map((n: AppStatus) => (
            <Button key={n} size="sm" variant={["REJECTED", "SUSPENDED"].includes(n) ? "danger" : "primary"} disabled={!!busy} onClick={() => run("st-" + n, () => api(`/admin/applications/${id}/status`, { method: "PATCH", body: { status: n, notes: noteText || undefined } }), n === "ONBOARDING" ? `Moved to Onboarding. ${a.fullName.split(" ")[0]} has been emailed a private link to set their password.` : `Moved to ${STATUS_LABEL[n]}.`)}>{busy === "st-" + n ? <Spinner /> : ({ PAUSED: "Pause", SUSPENDED: "Suspend", INTERVIEW_COMPLETED: "Mark interview completed" } as Record<string, string>)[n] ?? STATUS_LABEL[n]}</Button>
          ))}
        </div>
      </Section>
      </div>
    </div>
  );
}

const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

const EDIT_FIELDS = [
  ["fullName", "Full name", "text"], ["email", "Email", "text"], ["phone", "Phone", "text"], ["linkedinUrl", "LinkedIn URL", "text"],
  ["headline", "Headline", "text"], ["currentRole", "Current role", "text"], ["organization", "Organisation", "text"], ["yearsExperience", "Years of experience", "number"],
  ["industry", "Industry", "text"], ["countryOfResidence", "Country", "country"], ["city", "City", "text"], ["languages", "Languages", "text"],
  ["qualifications", "Qualifications", "text"], ["participation", "Participation", "participation"],
  ["motivation", "Why they want to mentor", "area"], ["previousMentorshipExperience", "Mentoring experience", "area"],
] as const;
/** Location for display: the free-text place, with the country added if it doesn't already end with it. */
const basedIn = (a: Application) => {
  const [place, country] = [a.professionalLocation.trim(), a.countryOfResidence.trim()];
  return !country || place.toLowerCase().endsWith(country.toLowerCase()) ? place : place ? `${place}, ${country}` : country;
};
const cityOf = (a: Application) => a.professionalLocation.toLowerCase().endsWith(a.countryOfResidence.toLowerCase()) ? a.professionalLocation.slice(0, a.professionalLocation.length - a.countryOfResidence.length).replace(/,\s*$/, "").trim() : a.professionalLocation;
const toEditForm = (a: Application): Record<string, string> => Object.fromEntries(EDIT_FIELDS.map(([k]) => {
  if (k === "city") return [k, cityOf(a)];
  const v = (a as unknown as Record<string, unknown>)[k];
  return [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")];
}));
const fromEditForm = ({ city, ...f }: Record<string, string>) => ({ ...f, professionalLocation: city.trim() ? `${city.trim()}, ${f.countryOfResidence}` : f.countryOfResidence, yearsExperience: Number(f.yearsExperience), languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean) });

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

interface AdminMentor { id: string; slug: string; country: string; level: Level; category: string; status: string; verified: boolean; isDemo: boolean; priceMinor: number; currency: Currency; priceOverrideMinor: number | null; sessionsCompleted: number; user: { name: string; email: string } }

interface TierRule { level: Level; currency: Currency; priceMinor: number; minMinor: number; maxMinor: number; isDefault: boolean }

function Mentors() {
  const { data, loading, error, reload } = useApi<AdminMentor[]>("/admin/mentors");
  const tiers = useApi<TierRule[]>("/admin/pricing");
  if (loading) return <Skeleton className="h-64 rounded-3xl" />;
  if (error) return <Alert>{error}</Alert>;
  if (!data?.length) return <EmptyState title="No mentors yet" description="Mentors appear here once an application reaches onboarding." />;
  return <div className="grid gap-4 xl:grid-cols-2">{data.map((m) => <MentorRow key={m.id} m={m} tiers={tiers.data ?? []} onSaved={reload} />)}</div>;
}

function MentorRow({ m, tiers, onSaved }: { m: AdminMentor; tiers: TierRule[]; onSaved: () => void }) {
  const [level, setLevel] = useState(m.level);
  const [status, setStatus] = useState(m.status);
  const [override, setOverride] = useState(m.priceOverrideMinor == null ? "" : String(m.priceOverrideMinor / 100));
  const [country, setCountry] = useState(countryIn(m.country));
  const savedCountry = countryIn(m.country);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const range = tiers.find((t) => t.level === level && t.currency === m.currency);
  const dirty = country !== savedCountry || level !== m.level || status !== m.status || override !== (m.priceOverrideMinor == null ? "" : String(m.priceOverrideMinor / 100));

  async function save() {
    setBusy(true); setMsg(null);
    try { await api(`/admin/mentors/${m.id}`, { method: "PATCH", body: { level, status, ...(country !== savedCountry ? { country } : {}), priceOverrideMinor: override === "" ? null : Math.round(Number(override) * 100) } }); onSaved(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  }

  const reset = () => { setLevel(m.level); setStatus(m.status); setOverride(m.priceOverrideMinor == null ? "" : String(m.priceOverrideMinor / 100)); setCountry(savedCountry); setMsg(null); };
  const priceNum = override === "" ? null : Number(override) * 100;
  const outOfRange = !!range && priceNum != null && (priceNum < range.minMinor || priceNum > range.maxMinor);
  const shown = priceNum ?? range?.priceMinor ?? m.priceMinor;
  const pos = range && range.maxMinor > range.minMinor ? Math.min(100, Math.max(0, ((shown - range.minMinor) / (range.maxMinor - range.minMinor)) * 100)) : 0;
  const local = country ? isLocalCountry(country) : m.category === "LOCAL";

  return (
    <div className="flex flex-col overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-line transition-shadow hover:shadow-[0_20px_50px_-36px_rgba(17,17,17,0.35)]">
      <div className="p-6 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar name={m.user.name} size="h-12 w-12 text-base" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-display text-[1.6rem] capitalize leading-tight text-ink">{m.user.name}{m.isDemo && <Badge>Demo</Badge>}</p>
              <p className="truncate text-xs text-ink-soft">{m.user.email}</p>
            </div>
          </div>
          <Badge tone={TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-ink">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1">{m.country && <Flag country={m.country} className="h-3 w-[18px]" />}{m.country || "Country not set"}</span>
          <span className="rounded-full bg-paper px-2.5 py-1">{LEVEL_LABEL[m.level]}</span>
          <span className="rounded-full bg-paper px-2.5 py-1">{m.category === "LOCAL" ? "Local · PKR" : "International · GBP"}</span>
          {m.status === "ACTIVE" && <a href={`/mentors/${m.slug}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Public profile<svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M7 13L13 7M8 7h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a>}
        </div>

        <dl className="mt-5 grid grid-cols-2 divide-x divide-line rounded-2xl bg-paper/70 py-3.5">
          <div className="px-5">
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">Session price</dt>
            <dd className="mt-1 flex items-baseline gap-2"><span className="font-display text-2xl tabular-nums text-ink">{formatMoney(m.priceMinor, m.currency)}</span><span className="text-[11px] text-ink-soft">{m.priceOverrideMinor != null ? "custom" : "standard"}</span></dd>
          </div>
          <div className="px-5">
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">Sessions completed</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums text-ink">{m.sessionsCompleted}</dd>
          </div>
        </dl>
      </div>

      <div className="flex-1 space-y-4 border-t border-line bg-paper/40 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Settings</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Level"><select className="input bg-white" value={level} onChange={(e) => setLevel(e.target.value as Level)}>{(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></Field>
          <Field label="Status"><select className="input bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>{["ONBOARDING", "ACTIVE", "PAUSED", "SUSPENDED"].map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}</select></Field>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Country</span>
          <CountrySelect value={country} onChange={setCountry} />
          <p className={`mt-1.5 text-xs ${country && local !== (m.category === "LOCAL") ? "text-brass-dark" : "text-ink-soft"}`}>
            {!country ? `Not recognised: "${m.country}". Choose a country.` : local !== (m.category === "LOCAL") ? `Will become ${local ? "Local · PKR" : "International · GBP"}. Check the price after saving.` : local ? "Local mentor, priced in PKR" : "International mentor, priced in GBP"}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={`price-${m.id}`} className="text-sm font-medium text-ink">Session price</label>
            {override !== "" && <button type="button" onClick={() => setOverride("")} className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline">Use standard price</button>}
          </div>
          <div className={`flex items-center rounded-xl bg-white ring-1 focus-within:ring-ink/40 ${outOfRange ? "ring-rust/60" : "ring-line"}`}>
            <span className="border-r border-line px-3.5 py-2.5 text-sm text-ink-soft">{m.currency === "PKR" ? "Rs" : "£"}</span>
            <input id={`price-${m.id}`} className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-sm tabular-nums text-ink outline-none placeholder:text-ink-soft/70" type="number" min={range ? range.minMinor / 100 : 0} max={range ? range.maxMinor / 100 : undefined} step="1" value={override} placeholder={range ? `${range.priceMinor / 100} (standard)` : "Standard price"} onChange={(e) => setOverride(e.target.value)} />
          </div>
          {range && (
            <div className="mt-3">
              <div className="relative h-1.5 rounded-full bg-paper-dim">
                <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${outOfRange ? "bg-rust" : "bg-ink"}`} style={{ left: `${pos}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-ink-soft">
                <span>{formatMoney(range.minMinor, m.currency)}</span>
                <span>{outOfRange ? <span className="text-rust">Outside the {LEVEL_LABEL[level]} range</span> : `Standard ${formatMoney(range.priceMinor, m.currency)}`}</span>
                <span>{formatMoney(range.maxMinor, m.currency)}</span>
              </div>
            </div>
          )}
        </div>
        {msg && <Alert>{msg}</Alert>}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        {dirty
          ? <span className="inline-flex items-center gap-2 text-xs text-brass-dark"><span className="h-1.5 w-1.5 rounded-full bg-brass" />Unsaved changes</span>
          : <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden className="text-forest"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>All changes saved</span>}
        <div className="flex gap-2">
          {dirty && <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>Discard</Button>}
          <Button size="sm" disabled={!dirty || busy || outOfRange} onClick={save}>{busy ? <Spinner /> : "Save changes"}</Button>
        </div>
      </div>
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

const COMMISSION = [
  { key: "commission_professional", label: "Professional", hint: "Tier 1 · first session with a mentor", tone: "bg-sky" },
  { key: "commission_senior_specialist", label: "Senior Specialist", hint: "Tier 2 · first session with a mentor", tone: "bg-mint" },
  { key: "commission_executive", label: "Executive / Industry Leader", hint: "Tier 3 · first session with a mentor", tone: "bg-lilac" },
  { key: "repeat_commission_percent", label: "Returning student", hint: "Any tier · another 1:1 with the same mentor", tone: "bg-lemon" },
] as const;

const SETTING_NAMES: Record<string, string> = {
  commission_professional: "Professional commission", commission_senior_specialist: "Senior Specialist commission", commission_executive: "Executive commission",
  repeat_commission_percent: "Returning student commission", reschedule_notice_hours: "Rescheduling notice", group_price_percent: "Group seat price",
};

function PricingSettings() {
  const rules = useApi<TierRule[]>("/admin/pricing");
  const settings = useApi<Record<string, string>>("/admin/settings");
  const toast = useToast();
  const [sv, setSv] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function saveSetting(key: string) {
    const n = Number(sv[key]);
    if (key === "reschedule_notice_hours" ? n < 0 : n < (key === "group_price_percent" ? 1 : 0) || n > 100) {
      toast(key === "reschedule_notice_hours" ? "Enter a number of hours, 0 or more." : `Enter a percentage between ${key === "group_price_percent" ? 1 : 0} and 100.`, "error");
      return;
    }
    setBusy(key);
    try {
      await api("/admin/settings", { method: "PUT", body: { key, value: sv[key] } });
      toast(`${SETTING_NAMES[key] ?? "Setting"} saved.`);
      await settings.reload();
      setSv((all) => { const rest = { ...all }; delete rest[key]; return rest; });
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }
  const field = (key: string, current?: string) => ({
    value: sv[key] ?? current ?? "",
    onChange: (v: string) => setSv({ ...sv, [key]: v }),
    dirty: sv[key] !== undefined && sv[key] !== "" && sv[key] !== (current ?? ""),
    busy: busy === key,
    onSave: () => saveSetting(key),
  });

  return (
    <div className="divide-y divide-line">
      <SettingsSection title="Tier price ranges" text="The price range per 30-minute session for each tier. Every mentor is priced inside it: the standard price, or their own price from the Mentors tab. The public pricing page shows these ranges.">
        {rules.loading ? <Skeleton className="h-64 rounded-3xl" /> : (
          <div className="space-y-4">
            {(Object.keys(LEVEL_LABEL) as Level[]).map((l, i) => (
              <div key={l} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium text-ink ${["bg-sky", "bg-mint", "bg-lilac"][i]}`}>Tier {i + 1}</span>
                  <p className="font-display text-2xl leading-tight text-ink">{LEVEL_LABEL[l]}</p>
                </div>
                <div className="mt-4 divide-y divide-line">
                  {(["PKR", "GBP"] as const).map((c) => {
                    const r = rules.data?.find((x) => x.level === l && x.currency === c);
                    return r ? <RangeEditor key={c} rule={r} onSaved={(t) => { toast(t); rules.reload(); }} onError={(t) => toast(t, "error")} /> : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Bank app & QR" text="Students paying in PKR can scan your QR code or transfer from any banking app, then send the transaction ID. You approve each payment in the Overview after checking your bank statement.">
        <BankSettings />
      </SettingsSection>

      <SettingsSection title="Platform commission" text="The platform's share of each paid session; the rest goes to the mentor. A lower rate applies when a student books another 1:1 with a mentor they've already met. Each booking keeps the rate in force when it was made.">
        <div className="grid gap-4 sm:grid-cols-2">
          {COMMISSION.map(({ key, label, hint, tone }) => {
            const current = settings.data?.[key] ?? (key.startsWith("commission_") ? settings.data?.commission_percent : undefined);
            const f = field(key, current);
            const pct = Number(f.value);
            return (
              <div key={key} className="flex flex-col rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
                <span className={`self-start rounded-full px-3 py-1 text-xs font-medium text-ink ${tone}`}>{label}</span>
                <p className="mb-4 mt-2.5 text-xs leading-relaxed text-ink-soft">{hint}</p>
                <SettingInput {...f} unit="%" max={100} placeholder={key === "repeat_commission_percent" ? "15" : "Not set"} />
                <p className="mt-2 text-xs text-ink-soft">{f.value !== "" && pct >= 0 && pct <= 100 ? `Mentor keeps ${100 - pct}%` : key === "repeat_commission_percent" ? "Default is 15%" : "Set a rate to calculate payouts"}</p>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Booking rules" text="Platform-wide rules. Changes apply to new bookings straight away.">
        <div className="grid gap-4 sm:grid-cols-2">
          {([["reschedule_notice_hours", "Rescheduling notice", "How long before a session a student can still move it. Default is 48 hours (2 days).", "hours", undefined], ["group_price_percent", "Group seat price", "Each group seat as a share of the mentor's 1:1 price. Default is 40%.", "%", 100]] as const).map(([k, label, hint, unit, max]) => (
            <div key={k} className="flex flex-col rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
              <p className="font-display text-2xl leading-tight text-ink">{label}</p>
              <p className="mb-4 mt-1.5 text-xs leading-relaxed text-ink-soft">{hint}</p>
              <div className="mt-auto"><SettingInput {...field(k, settings.data?.[k])} unit={unit} max={max} placeholder={k === "group_price_percent" ? "40" : "48"} /></div>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 py-10 first:pt-0 last:pb-0 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="font-display text-3xl leading-tight text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SettingInput({ value, onChange, dirty, busy, onSave, unit, max, placeholder }: { value: string; onChange: (v: string) => void; dirty: boolean; busy: boolean; onSave: () => void; unit: string; max?: number; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-paper px-3.5 ring-1 ring-line focus-within:ring-ink/40">
        <input className="w-full min-w-0 bg-transparent py-2.5 font-display text-2xl tabular-nums text-ink outline-none placeholder:text-ink-soft/40" type="number" min={0} max={max} placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && dirty) onSave(); }} />
        <span className="shrink-0 text-sm text-ink-soft">{unit}</span>
      </span>
      <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={!dirty || busy} onClick={onSave}>{busy ? <Spinner /> : "Save"}</Button>
    </div>
  );
}

interface BankTransfer { id: string; amountMinor: number; currency: Currency; txnRef: string | null; senderName: string | null; submittedAt: string; reference: string; startAt: string; studentName: string; studentEmail: string; mentorName: string }

/** Bank / QR transfers students say they've made, waiting to be matched against the bank statement. */
function BankTransfers() {
  const toast = useToast();
  const list = useApi<BankTransfer[]>("/payments/admin/bank-transfers");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function act(id: string, kind: "approve" | "reject", body: unknown = {}) {
    setBusy(id + kind);
    try {
      list.setData(await api<BankTransfer[]>(`/payments/admin/bank-transfers/${id}/${kind}`, { body }));
      toast(kind === "approve" ? "Payment approved. The booking is confirmed and both sides have been emailed." : "Payment rejected. The slot is released and the student has been emailed.");
      setRejecting(null); setReason("");
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }
  if (!list.data?.length) return null;
  return (
    <Panel title="Bank payments to verify" action={<span className="rounded-full bg-lemon px-3 py-1 text-xs font-medium text-ink">{list.data.length} waiting</span>}>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">Match each transfer against your bank statement (amount, transaction ID and the booking reference in the note) before approving.</p>
      <ul className="space-y-3">
        {list.data.map((t) => (
          <li key={t.id} className="rounded-2xl bg-paper p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-[-0.02em] tabular-nums text-ink">{formatMoney(t.amountMinor, t.currency)}</p>
                <p className="mt-0.5 text-sm text-ink">{t.studentName} <span className="text-ink-soft">· session with {t.mentorName}</span></p>
                <p className="text-xs text-ink-soft">{fmtDay(t.startAt)}, {fmtTime(t.startAt)} · sent {fmtDayShort(t.submittedAt)} {fmtTime(t.submittedAt)}</p>
              </div>
              <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 text-xs">
                <dt className="text-ink-soft">Transaction ID</dt><dd className="font-mono font-medium text-ink">{t.txnRef}</dd>
                <dt className="text-ink-soft">Sender</dt><dd className="font-medium text-ink">{t.senderName}</dd>
                <dt className="text-ink-soft">Reference</dt><dd className="font-mono font-medium text-ink">{t.reference}</dd>
              </dl>
            </div>
            {rejecting === t.id ? (
              <div className="mt-4 space-y-2">
                <textarea className="input min-h-16 bg-white" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it couldn't be verified (sent to the student), e.g. No transfer with this ID has arrived." />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
                  <Button size="sm" variant="danger" disabled={reason.trim().length < 5 || !!busy} onClick={() => act(t.id, "reject", { reason })}>{busy === t.id + "reject" ? <Spinner /> : "Reject and release slot"}</Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { setRejecting(t.id); setReason(""); }}>Reject</Button>
                <Button size="sm" disabled={!!busy} onClick={() => act(t.id, "approve")}>{busy === t.id + "approve" ? <Spinner /> : "Approve and confirm booking"}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

interface BankSettingsData { enabled: boolean; accountTitle: string; bankName: string; accountNumber?: string; iban?: string; raastId?: string; hasQr: boolean }

/** The QR code and account details students pay into with "Bank app · QR" at checkout (PKR sessions). */
function BankSettings() {
  const toast = useToast();
  const saved = useApi<BankSettingsData>("/payments/admin/bank-settings");
  const [f, setF] = useState<Omit<BankSettingsData, "hasQr"> | null>(null);
  const [qr, setQr] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  if (saved.loading || !saved.data) return <Skeleton className="h-64 rounded-3xl" />;
  const d = saved.data;
  const form = f ?? { enabled: d.enabled, accountTitle: d.accountTitle, bankName: d.bankName, accountNumber: d.accountNumber ?? "", iban: d.iban ?? "", raastId: d.raastId ?? "" };
  const set = (k: keyof typeof form, val: string | boolean) => setF({ ...form, [k]: val });
  const preview = qr === undefined ? (d.hasQr ? `/api/payments/bank-qr?v=${v}` : null) : qr;
  const dirty = f !== null || qr !== undefined;

  function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Choose a PNG, JPEG or WebP image of your QR code.", "error"); return; }
    if (file.size > 1_400_000) { toast("That image is too large. Use one under 1.4 MB; a screenshot of the QR is fine.", "error"); return; }
    const r = new FileReader();
    r.onload = () => setQr(String(r.result));
    r.readAsDataURL(file);
  }
  async function save() {
    setBusy(true);
    try {
      saved.setData(await api<BankSettingsData>("/payments/admin/bank-settings", { method: "PUT", body: { ...form, ...(qr === undefined ? {} : { qrImage: qr ?? "" }) } }));
      setF(null); setQr(undefined); setV((n) => n + 1);
      toast(form.enabled ? "Saved. PKR checkouts now offer Bank app · QR." : "Saved. Bank app · QR is off at checkout.");
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <p className="text-sm font-medium text-ink">Show at checkout</p>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
          <input type="checkbox" className="sr-only" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          {form.enabled ? "On" : "Off"}
          <span className={`relative h-5 w-9 rounded-full transition-colors ${form.enabled ? "bg-forest" : "bg-ink/20"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${form.enabled ? "left-[1.125rem]" : "left-0.5"}`} /></span>
        </label>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Payment QR code</p>
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="Payment QR code" className="h-full w-full object-contain p-3" /> : <p className="px-5 text-center text-xs leading-relaxed text-ink-soft">Upload the QR from your bank app (Raast, or your bank&rsquo;s &ldquo;Receive money&rdquo; QR).</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-ink-soft">{preview ? "Replace" : "Upload QR"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {preview && <button type="button" onClick={() => setQr(null)} className="rounded-full px-4 py-2 text-xs font-medium text-ink-soft ring-1 ring-line hover:text-ink">Remove</button>}
          </div>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Account title"><input className="input" value={form.accountTitle} maxLength={80} onChange={(e) => set("accountTitle", e.target.value)} placeholder="e.g. POINT B Pvt Ltd" /></Field>
          <Field label="Bank"><input className="input" value={form.bankName} maxLength={80} onChange={(e) => set("bankName", e.target.value)} placeholder="e.g. Meezan Bank" /></Field>
          <Field label="Raast ID (optional)"><input className="input" value={form.raastId} maxLength={40} onChange={(e) => set("raastId", e.target.value)} placeholder="Mobile number or Raast ID" /></Field>
          <Field label="IBAN (optional)"><input className="input uppercase" value={form.iban} maxLength={40} onChange={(e) => set("iban", e.target.value)} placeholder="PK00 XXXX 0000 0000 0000 0000" /></Field>
          <Field label="Account number (optional)"><input className="input" value={form.accountNumber} maxLength={40} onChange={(e) => set("accountNumber", e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        {dirty && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setF(null); setQr(undefined); }}>Discard</Button>}
        <Button size="sm" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : "Save"}</Button>
      </div>
    </div>
  );
}

function RangeEditor({ rule, onSaved, onError }: { rule: TierRule; onSaved: (msg: string) => void; onError: (msg: string) => void }) {
  const major = (x: number) => String(x / 100);
  const [f, setF] = useState({ min: major(rule.minMinor), max: major(rule.maxMinor), std: major(rule.priceMinor) });
  const [busy, setBusy] = useState(false);
  const dirty = f.min !== major(rule.minMinor) || f.max !== major(rule.maxMinor) || f.std !== major(rule.priceMinor);
  const [min, max, std] = [Number(f.min), Number(f.max), Number(f.std)];
  const problem = !f.min || !f.max || !f.std ? "Fill in all three prices." : min > max ? "Lowest is above highest." : std < min || std > max ? "Standard must be inside the range." : null;
  async function save() {
    setBusy(true);
    try { await api("/admin/pricing", { method: "PUT", body: { level: rule.level, currency: rule.currency, minMinor: Math.round(min * 100), maxMinor: Math.round(max * 100), priceMinor: Math.round(std * 100) } }); onSaved(`${LEVEL_LABEL[rule.level]} · ${rule.currency === "PKR" ? "local" : "international"} range saved.`); }
    catch (e) { onError(errMsg(e)); } finally { setBusy(false); }
  }
  const sym = rule.currency === "PKR" ? "Rs" : "£";
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="sm:col-span-4 xl:col-span-1 xl:pb-2">
          <p className="text-sm font-medium text-ink">{rule.currency === "PKR" ? "Local" : "International"}</p>
          <p className="text-xs text-ink-soft">{rule.currency}</p>
        </div>
        {([["min", "Lowest"], ["max", "Highest"], ["std", "Standard"]] as const).map(([k, label]) => (
          <label key={k} className="block min-w-0">
            <span className="text-xs text-ink-soft">{label}</span>
            <span className="mt-1 flex items-center gap-1.5 rounded-xl bg-paper px-3 ring-1 ring-line focus-within:ring-ink/40">
              <span className="shrink-0 text-xs text-ink-soft">{sym}</span>
              <input className="w-full min-w-0 bg-transparent py-2.5 text-sm tabular-nums text-ink outline-none" type="number" min={1} step="1" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </span>
          </label>
        ))}
        <Button size="sm" variant={dirty && !problem ? "primary" : "secondary"} className="sm:mb-1" disabled={!dirty || !!problem || busy} onClick={save}>{busy ? <Spinner /> : "Save"}</Button>
      </div>
      {((dirty && problem) || rule.isDefault) && <p className={`mt-2 text-xs ${dirty && problem ? "text-rust" : "text-ink-soft"}`}>{dirty && problem ? problem : "Provisional default"}</p>}
    </div>
  );
}

function Activity() {
  const log = useApi<{ id: string; action: string; entityType: string; entityId: string; detail: string; createdAt: string; admin: { name: string } }[]>("/admin/audit-log");
  const outbox = useApi<{ id: string; toEmail: string; subject: string; sentAt: string }[]>("/admin/outbox");
  return (
    <div className="space-y-6">
    <WhatsAppDelivery />
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
    </div>
  );
}
