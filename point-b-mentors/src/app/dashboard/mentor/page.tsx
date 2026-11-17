"use client";

import { useState } from "react";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Field, FilterChips, Mark, Skeleton, Spinner } from "@/components/ui";
import { Stars } from "@/components/feedback";
import { DashboardHero, InterviewCard, Panel, StatTile, Tabs, greeting } from "@/components/dashboard";
import { FacultyTile } from "@/components/course-card";
import { PhotoUpload } from "@/components/photo-upload";
import { MentorCourses, type MyCourse } from "@/components/mentor-courses";
import { api, errMsg } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtDayShort, formatMoney } from "@/lib/format";
import { useUrlTab } from "@/lib/use-url-tab";
import { MySupport } from "@/components/my-support";
import { useApi } from "@/lib/use-api";
import type { Currency, Interview, MentorSummary, MyReview } from "@/lib/types";
import { PayoutDetailsForm, PayoutDetailsView, type PayoutDetails } from "@/components/admin-mentor-detail";

interface Earnings { totals: { currency: Currency; grossMinor: number; feeMinor: number; payoutMinor: number; sessions: number; repeatSessions: number }[]; tierPercent: number | null; repeatPercent: number; commissionConfigured: boolean }
type Profile = MentorSummary & { agreementAcceptedAt?: string | null };

const TABS = ["Courses", "Feedback", "Payouts", "Profile", "Support"] as const;
type Tab = (typeof TABS)[number];

export default function MentorDashboardPage() {
  return <RequireRole role="MENTOR"><Dashboard /></RequireRole>;
}

function Dashboard() {
  const [tab, setTab] = useUrlTab(TABS, "Courses");
  const profile = useApi<Profile>("/mentors/me/profile");
  const courses = useApi<MyCourse[]>("/courses/me/list");
  const earnings = useApi<Earnings>("/mentors/me/earnings");
  const reviews = useApi<MyReview[]>("/mentors/me/reviews");
  const interview = useApi<Interview | null>("/applications/mine/interview");
  const goTo = (t: Tab) => { setTab(t); setTimeout(() => document.getElementById("mentor-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const p = profile.data;
  const list = courses.data ?? [];
  const live = list.filter((c) => c.status === "LIVE" || c.status === "CLOSED").length;
  const currency = (earnings.data?.totals[0]?.currency ?? (p?.currency ?? "PKR")) as Currency;
  const totals = earnings.data?.totals.find((t) => t.currency === currency);

  return (
    <>
      <DashboardHero
        eyebrow={<><span>Faculty dashboard</span>{p && <Badge tone={p.status === "ACTIVE" ? "forest" : p.status === "ONBOARDING" ? "brass" : "rust"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>}</>}
        title={<>{greeting()}, <Mark color="mint">{p ? p.name.split(" ")[0] : "mentor"}</Mark></>}
        subtitle={live ? `You have ${live} published course${live === 1 ? "" : "s"}. Plan the next one, or check who has enrolled.` : "Plan a course, send it for review, and teach once the POINT B team publishes it."}
        actions={<>{p && p.status === "ACTIVE" && <Button href={`/mentors/${p.slug}`} variant="secondary">View public profile</Button>}<Button onClick={() => goTo("Courses")}>Your courses</Button></>}
      >
        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Published courses" value={courses.loading ? "–" : live} tone="sky" onClick={() => goTo("Courses")} />
          <StatTile label="In draft / review" value={courses.loading ? "–" : list.length - live} tone="lemon" delay={60} onClick={() => goTo("Courses")} />
          <StatTile label="Feedback" value={reviews.loading ? "–" : (reviews.data ?? []).length} tone="mint" delay={120} onClick={() => goTo("Feedback")} />
          <StatTile label="Your course fees" value={formatMoney(totals?.payoutMinor ?? 0, currency)} tone="peach" delay={180} onClick={() => goTo("Payouts")}
            note="Fixed fee per published course, paid by the POINT B team." />
        </div>
      </DashboardHero>

      <Container className="py-10 sm:py-12">
        {interview.data && <InterviewCard iv={interview.data} />}
        {profile.error && <div className="mb-6"><Alert>{profile.error}</Alert></div>}
        {p && p.status !== "ACTIVE" && <Checklist p={p} hasCourse={list.length > 0} onDone={profile.reload} />}

        <div id="mentor-tabs" className="mb-8 flex scroll-mt-24 flex-wrap items-center justify-between gap-4">
          <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Courses: list.length, Feedback: (reviews.data ?? []).length }} />
          {p && <p className="text-sm text-ink-soft">{p.rating ? <>★ {p.rating.toFixed(1)} from {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}</> : "No reviews yet"}</p>}
        </div>

        {tab === "Courses" && <MentorCourses courses={courses.data} loading={courses.loading} reload={courses.reload} live={p?.status === "ACTIVE"} />}
        {tab === "Feedback" && <Feedback loading={reviews.loading} items={reviews.data ?? []} />}
        {tab === "Payouts" && <PayoutSettings />}
        {tab === "Profile" && p && <ProfileEditor p={p} onSaved={profile.reload} />}
        {tab === "Support" && <div className="max-w-3xl"><MySupport /></div>}
      </Container>
    </>
  );
}

function Checklist({ p, hasCourse, onDone }: { p: Profile; hasCourse: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const accepted = !!p.agreementAcceptedAt || justAccepted;
  const items = [
    { done: p.introduction.length > 40 && p.helpTopics.length > 0, label: "Complete your profile", hint: "Introduction, career summary and how you can help (Profile tab)." },
    { done: accepted, label: "Accept the mentor agreement", hint: accepted && p.agreementAcceptedAt ? `Accepted on ${fmtDay(p.agreementAcceptedAt)}.` : "Covers conduct, confidentiality and safeguarding boundaries." },
    { done: hasCourse, label: "Plan your first course", hint: "Write a course and send it for the POINT B team to review (Courses tab)." },
    { done: false, label: "Admin review and activation", hint: "POINT B verifies your identity and publishes your profile." },
  ];
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div className="mb-10 rounded-[2rem] bg-white p-6 ring-1 ring-line sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-3xl text-ink">{p.status === "ONBOARDING" ? "Finish setting up your profile" : `Your profile is ${STATUS_LABEL[p.status]?.toLowerCase()}`}</p>
        {p.status === "ONBOARDING" && <span className="text-sm text-ink-soft">{doneCount} of {items.length} done</span>}
      </div>
      {p.status === "ONBOARDING" && (
        <>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-dim"><div className="h-full rounded-full bg-ink transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} /></div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <li key={i.label} className={`flex gap-3 rounded-2xl p-4 text-sm ${i.done ? "bg-mint/50" : "bg-paper"}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${i.done ? "bg-forest text-white" : "border border-ink/25"}`}>{i.done ? "✓" : ""}</span>
                <span><span className="font-medium text-ink">{i.label}</span><span className="mt-0.5 block text-ink-soft">{i.hint}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.status === "ONBOARDING" && justAccepted && (
        <div className="mt-6"><Alert tone="success">Thank you, the mentor agreement is accepted. {hasCourse ? "Our team will now review your profile and activate it." : "Next, plan a course so our team can review and activate your profile."}</Alert></div>
      )}
      {p.status === "ONBOARDING" && !accepted && (
        <div className="mt-6">
          {error && <div className="mb-3"><Alert>{error}</Alert></div>}
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await api("/mentors/me/agreement", { method: "POST", body: {} }); setJustAccepted(true); onDone(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } }}>
            {busy ? <Spinner /> : "I accept the mentor agreement"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Feedback from students, read-only: the POINT B team decides what appears on the public profile. */
function Feedback({ loading, items }: { loading: boolean; items: MyReview[] }) {
  if (loading) return <Skeleton className="h-40 rounded-3xl" />;
  const card = (r: MyReview) => {
    const likert = [
      r.clarity != null && `Clarity ${r.clarity}/5`,
      r.usefulness != null && `Usefulness ${r.usefulness}/5`,
      r.recommend != null && `Recommend ${r.recommend}/5`,
    ].filter(Boolean);
    return (
      <div key={r.id} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{r.studentName.split(" ")[0]} {r.studentName.split(" ")[1]?.[0] ?? ""}. <span className="font-normal text-ink-soft">· {fmtDayShort(r.sessionAt)} · {r.agenda}{r.isCourse ? " · course" : ""}</span></p>
            <p className="mt-1 text-lg"><Stars n={r.rating} /></p>
            {!!likert.length && <p className="mt-1 text-xs text-ink-soft">{likert.join(" · ")}</p>}
          </div>
          <Badge tone={r.status === "APPROVED" ? "forest" : r.status === "PENDING" ? "brass" : "neutral"}>{r.status === "APPROVED" ? "On your public profile" : r.status === "PENDING" ? "Being reviewed by POINT B" : "Private"}</Badge>
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">&ldquo;{r.comment}&rdquo;</p>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-ink-soft">Every piece of feedback from your learners is shown here. The POINT B team reviews it and decides what appears on your public profile and counts towards your rating, so ratings stay fair for everyone. If you think a review breaks the rules, contact support.</p>
      {items.length === 0 ? <EmptyState title="No feedback yet" description="After the final class of a course, learners are invited to leave feedback, and it appears here." /> : <div className="space-y-3">{items.map(card)}</div>}
    </div>
  );
}

function ProfileEditor({ p, onSaved }: { p: Profile; onSaved: () => unknown }) {
  const lines = (a: string[]) => a.join("\n");
  const [f, setF] = useState({ title: p.title, organization: p.organization, introduction: p.introduction, careerSummary: p.careerSummary, helpTopics: lines(p.helpTopics), outsideScope: lines(p.outsideScope), qualifications: lines(p.qualifications), achievements: lines(p.achievements), linkedinUrl: p.linkedinUrl ?? "" });
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api("/mentors/me/profile", { method: "PATCH", body: { title: f.title, organization: f.organization, introduction: f.introduction, careerSummary: f.careerSummary, helpTopics: split(f.helpTopics), outsideScope: split(f.outsideScope), qualifications: split(f.qualifications), achievements: split(f.achievements), ...(f.linkedinUrl ? { linkedinUrl: f.linkedinUrl } : {}), ...(photo === undefined ? {} : { photoImage: photo ?? "" }) } });
      setMsg({ tone: "success", text: "Profile saved." }); await onSaved(); setPhoto(undefined);
    } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }

  const photoSrc = photo === undefined ? p.photoUrl ?? null : photo;
  const preview = { slug: p.slug, name: p.name, title: f.title, organization: f.organization, photoUrl: photoSrc, courses: [] as unknown[] };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Panel title="About you">
          <p className="-mt-3 mb-5 text-sm text-ink-soft">This is what learners see on your public profile. Write in your own voice and keep claims specific and accurate.</p>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Professional title"><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Organisation"><input className="input" value={f.organization} onChange={(e) => set("organization", e.target.value)} /></Field>
            </div>
            <Field label="Introduction" hint={`${f.introduction.length}/1200`}><textarea className="input min-h-28" maxLength={1200} value={f.introduction} onChange={(e) => set("introduction", e.target.value)} /></Field>
            <Field label="Career summary" hint={`${f.careerSummary.length}/2000`}><textarea className="input min-h-32" maxLength={2000} value={f.careerSummary} onChange={(e) => set("careerSummary", e.target.value)} /></Field>
          </div>
        </Panel>
        <Panel title="How you help">
          <div className="space-y-5">
            <Field label="How I can help" hint="One topic per line"><textarea className="input min-h-24" value={f.helpTopics} onChange={(e) => set("helpTopics", e.target.value)} /></Field>
            <Field label="Outside my scope" hint="One per line"><textarea className="input min-h-16" value={f.outsideScope} onChange={(e) => set("outsideScope", e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Qualifications" hint="One per line"><textarea className="input min-h-20" value={f.qualifications} onChange={(e) => set("qualifications", e.target.value)} /></Field>
              <Field label="Achievements" hint="One per line"><textarea className="input min-h-20" value={f.achievements} onChange={(e) => set("achievements", e.target.value)} /></Field>
            </div>
          </div>
        </Panel>
        <Panel title="Photo and links">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Profile photo</p>
              <PhotoUpload name={p.name} src={photoSrc} onChange={setPhoto} hint="JPG, PNG or WebP. A clear, recent headshot, shown on your card and profile." />
            </div>
            <Field label="LinkedIn URL"><input className="input" type="url" value={f.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} /></Field>
          </div>
        </Panel>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button size="lg" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Save profile"}</Button>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-sm font-medium text-ink">Preview of your card</p>
        <FacultyTile m={preview} />
        <p className="mt-3 text-xs text-ink-soft">Updates as you type. Save to publish your changes.</p>
      </div>
    </div>
  );
}

interface MyPayouts {
  totals: { currency: Currency; earnedMinor: number; paidMinor: number; dueMinor: number; forCancelledMinor: number; sessions: number }[];
  payouts: { id: string; createdAt: string; currency: Currency; amountMinor: number; sessions: number; reference: string | null; note: string | null; courseId?: string | null; courseTitle?: string | null }[];
  sessions: { reference: string; status: string; currency: Currency; startAt: string; studentName: string; priceMinor: number; percent: number | null; earnMinor: number | null; paidOn: string | null }[];
  courses?: { id: string; title: string; currency: Currency; feeMinor: number; paidOn: string | null }[];
  hasPayoutDetails: boolean;
}

const monthKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key: string, month: "short" | "long") => new Date(`${key}-15T12:00:00`).toLocaleDateString("en-GB", { month, year: "numeric" });

/** The mentor's money: fixed course fees due and paid, plus where to pay them. */
function PayoutSettings() {
  const data = useApi<MyPayouts>("/mentors/me/payouts");
  const saved = useApi<PayoutDetails | null>("/mentors/me/payout-details");
  const [draft, setDraft] = useState<PayoutDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [picked, setPicked] = useState("all");
  if (saved.loading || data.loading) return <Skeleton className="h-64 rounded-3xl" />;
  const editing = draft ?? (saved.data ? null : { method: "bank" });
  const d = data.data;
  async function save() {
    setBusy(true); setMsg(null);
    try { saved.setData(await api<PayoutDetails>("/mentors/me/payout-details", { method: "PUT", body: editing })); setDraft(null); setMsg({ tone: "success", text: "Saved. We'll pay your earnings into this account." }); }
    catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }
  const courseRows = d?.courses ?? [];
  const months = [...new Set([...courseRows.map((c) => c.paidOn).filter(Boolean).map((iso) => monthKey(iso!)), ...(d?.payouts ?? []).map((p) => monthKey(p.createdAt))])];
  const month = months.includes(picked) ? picked : "all";
  const inMonth = month === "all" ? "" : monthLabel(month, "long");
  const shownCourses = courseRows.filter((c) => month === "all" || (c.paidOn && monthKey(c.paidOn) === month) || (!c.paidOn && month === "all"));
  const payments = (d?.payouts ?? []).filter((p) => month === "all" || monthKey(p.createdAt) === month);
  const totals = d?.totals ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 space-y-6">
        {months.length > 0 && (
          <div>
            <FilterChips options={[["all", "All time"], ...months.map((m) => [m, monthLabel(m, "short")] as const)]} value={month} onChange={setPicked} label="Show earnings for" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {totals.length === 0 ? <div className="rounded-3xl bg-paper p-5 sm:col-span-3"><p className="text-sm text-ink-soft">No course fees yet. Once a course is published, your fixed fee appears here.</p></div>
            : totals.map((t) => (
              <div key={t.currency} className="rounded-3xl bg-paper p-5">
                <p className="text-xs uppercase tracking-[0.12em] text-ink-soft">{t.currency}{inMonth ? ` · ${inMonth}` : ""}</p>
                <p className="mt-2 font-display text-3xl tabular-nums text-ink">{formatMoney(t.earnedMinor || t.dueMinor + t.paidMinor, t.currency)}</p>
                <p className="mt-1 text-xs text-ink-soft">{formatMoney(t.paidMinor, t.currency)} paid · {formatMoney(t.dueMinor, t.currency)} due</p>
              </div>
            ))}
        </div>
        <Panel title="Course fees">
          {shownCourses.length === 0 ? <EmptyState title="No courses yet" description="Published courses and their fixed mentor fees appear here." />
            : (
              <ul className="divide-y divide-line">
                {shownCourses.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{c.title}</p>
                      <p className="text-xs text-ink-soft">{c.paidOn ? `Paid ${fmtDayShort(c.paidOn)}` : "Awaiting payout"}</p>
                    </div>
                    <p className="font-medium tabular-nums text-ink">{formatMoney(c.feeMinor, c.currency)}</p>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
        {!!payments.length && (
          <Panel title="Transfers">
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{formatMoney(p.amountMinor, p.currency)}</p>
                    <p className="text-xs text-ink-soft">{fmtDayShort(p.createdAt)}{p.courseTitle ? ` · ${p.courseTitle}` : ""}{p.reference ? ` · ${p.reference}` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Panel title="Where we pay you">
          {editing ? (
            <div className="space-y-4">
              <PayoutDetailsForm value={editing} onChange={(v) => setDraft(v)} onSave={save} onCancel={saved.data ? () => setDraft(null) : undefined} busy={busy} />
              {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            </div>
          ) : (
            <div className="space-y-4">
              {saved.data && <PayoutDetailsView d={saved.data} />}
              {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
              <Button variant="secondary" onClick={() => setDraft(saved.data ?? { method: "bank" })}>Update details</Button>
            </div>
          )}
        </Panel>
      </aside>
    </div>
  );
}
