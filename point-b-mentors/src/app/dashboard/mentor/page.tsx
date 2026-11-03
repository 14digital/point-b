"use client";

import { useState } from "react";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Field, Mark, Skeleton, Spinner } from "@/components/ui";
import { Stars } from "@/components/feedback";
import { DashboardHero, DateTile, InterviewCard, Panel, StatTile, Tabs, greeting, relative } from "@/components/dashboard";
import { MentorCard } from "@/components/mentor-card";
import { Reveal } from "@/components/motion";
import { api, errMsg } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtDayShort, fmtTime, formatMoney, groupByDay, initials, localTz } from "@/lib/format";
import { useApi, useNow } from "@/lib/use-api";
import type { Booking, Interview, MentorSummary, MyReview } from "@/lib/types";

interface MySlot { id: string; startAt: string; endAt: string; isBooked: boolean; kind: "ONE_TO_ONE" | "GROUP"; capacity: number; seatsTaken: number; bookings: { reference: string; status: string }[] }
interface Earnings { totals: { currency: "PKR" | "GBP"; grossMinor: number; feeMinor: number; payoutMinor: number; sessions: number; repeatSessions: number }[]; tierPercent: number | null; repeatPercent: number; commissionConfigured: boolean }
interface MyStudent { id: string; name: string; email: string; lastSessionAt: string; sessions: number }
interface MyPromo { id: string; studentId: string; code: string; percentOff: number; note: string; createdAt: string; expiresAt: string; usedAt: string | null; studentName: string; state: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED" }
type MyBooking = Booking & { studentName: string; hostStartedAt?: string | null };
type Profile = MentorSummary & { agreementAcceptedAt?: string | null };

const TABS = ["Sessions", "Feedback", "Promo codes", "Availability", "Profile"] as const;
type Tab = (typeof TABS)[number];

export default function MentorDashboardPage() {
  return <RequireRole role="MENTOR"><Dashboard /></RequireRole>;
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("Sessions");
  const profile = useApi<Profile>("/mentors/me/profile");
  const slots = useApi<MySlot[]>("/mentors/me/slots");
  const bookings = useApi<MyBooking[]>("/mentors/me/bookings");
  const earnings = useApi<Earnings>("/mentors/me/earnings");
  const reviews = useApi<MyReview[]>("/mentors/me/reviews");
  const interview = useApi<Interview | null>("/applications/mine/interview");
  const now = useNow();
  const goTo = (t: Tab) => { setTab(t); setTimeout(() => document.getElementById("mentor-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const p = profile.data;

  // Once a session has started (or the mentor opened the room) the mentor can record its outcome.
  const all = bookings.data ?? [];
  const started = (b: MyBooking) => new Date(b.startAt).getTime() <= now || !!b.hostStartedAt;
  const upcoming = all.filter((b) => b.status === "CONFIRMED" && !started(b)).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const toClose = all.filter((b) => b.status === "CONFIRMED" && started(b));
  const history = all.filter((b) => b.status !== "CONFIRMED").sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt));
  const currency = (earnings.data?.totals[0]?.currency ?? (p?.currency ?? "PKR")) as "PKR" | "GBP";
  const totals = earnings.data?.totals.find((t) => t.currency === currency);
  const openSlots = (slots.data ?? []).filter((s) => !s.isBooked).length;
  const reload = async () => { await Promise.all([bookings.reload(), earnings.reload(), slots.reload()]); };

  return (
    <>
      <DashboardHero
        eyebrow={<><span>Mentor dashboard</span>{p && <Badge tone={p.status === "ACTIVE" ? "forest" : p.status === "ONBOARDING" ? "brass" : "rust"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>}</>}
        title={<>{greeting()}, <Mark color="mint">{p ? p.name.split(" ")[0] : "mentor"}</Mark></>}
        subtitle={upcoming[0] ? `Your next session is ${relative(upcoming[0].startAt, now)}, with ${upcoming[0].studentName}.` : toClose.length ? `${toClose.length} session${toClose.length > 1 ? "s" : ""} need an outcome from you.` : "No sessions booked yet. Publishing more times helps students find you."}
        actions={<>{p && p.status === "ACTIVE" && <Button href={`/mentors/${p.slug}`} variant="secondary">View public profile</Button>}<Button onClick={() => goTo("Availability")}>Add availability</Button></>}
      >
        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Upcoming sessions" value={bookings.loading ? "–" : upcoming.length} tone="sky" />
          <StatTile label="Needs your outcome" value={bookings.loading ? "–" : toClose.length} tone={toClose.length ? "lemon" : "white"} delay={60} />
          <StatTile label="Open slots" value={slots.loading ? "–" : openSlots} tone="mint" delay={120} />
          <StatTile label={earnings.data?.commissionConfigured ? "Your earnings" : "Booked value"} value={formatMoney((earnings.data?.commissionConfigured ? totals?.payoutMinor : totals?.grossMinor) ?? 0, currency)} tone="peach" delay={180}
            note={earnings.data?.commissionConfigured && earnings.data.tierPercent != null ? `After ${earnings.data.tierPercent}% platform fee, ${earnings.data.repeatPercent}% for returning students` : "Payout terms are confirmed by POINT B."} />
        </div>
      </DashboardHero>

      <Container className="py-10 sm:py-12">
        {interview.data && <InterviewCard iv={interview.data} />}
        {profile.error && <div className="mb-6"><Alert>{profile.error}</Alert></div>}
        {p && p.status !== "ACTIVE" && <Checklist p={p} hasSlots={(slots.data?.length ?? 0) > 0} onDone={profile.reload} />}

        <div id="mentor-tabs" className="mb-8 flex scroll-mt-24 flex-wrap items-center justify-between gap-4">
          <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Sessions: upcoming.length + toClose.length, Feedback: (reviews.data ?? []).filter((r) => r.status === "PENDING").length, Availability: openSlots }} />
          {p && <p className="text-sm text-ink-soft">{p.rating ? <>★ {p.rating.toFixed(1)} from {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}</> : "No reviews yet"} · {p.sessionsCompleted} completed</p>}
        </div>

        {tab === "Sessions" && <Sessions loading={bookings.loading} upcoming={upcoming} toClose={toClose} history={history} now={now} reload={reload} />}
        {tab === "Feedback" && <Feedback loading={reviews.loading} items={reviews.data ?? []} reload={async () => { await Promise.all([reviews.reload(), profile.reload()]); }} />}
        {tab === "Promo codes" && <PromoCodes live={p?.status === "ACTIVE"} repeatPercent={earnings.data?.repeatPercent ?? 15} />}
        {tab === "Availability" && <Availability slots={slots.data} loading={slots.loading} reload={slots.reload} />}
        {tab === "Profile" && p && <ProfileEditor p={p} onSaved={profile.reload} />}
      </Container>
    </>
  );
}

function Checklist({ p, hasSlots, onDone }: { p: Profile; hasSlots: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const accepted = !!p.agreementAcceptedAt || justAccepted;
  const items = [
    { done: p.introduction.length > 40 && p.helpTopics.length > 0, label: "Complete your profile", hint: "Introduction, career summary and how you can help (Profile tab)." },
    { done: accepted, label: "Accept the mentor agreement", hint: accepted && p.agreementAcceptedAt ? `Accepted on ${fmtDay(p.agreementAcceptedAt)}.` : "Covers conduct, confidentiality and safeguarding boundaries." },
    { done: hasSlots, label: "Add your availability", hint: "Publish at least one 30-minute slot (Availability tab)." },
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
        <div className="mt-6"><Alert tone="success">Thank you, the mentor agreement is accepted. {hasSlots ? "Our team will now review your profile and activate it." : "Next, add your availability so our team can review and activate your profile."}</Alert></div>
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

function StudentChip({ name }: { name: string }) {
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky font-display text-lg text-ink">{initials(name)}</span>;
}

function PromoCodes({ live, repeatPercent }: { live: boolean; repeatPercent: number }) {
  const students = useApi<MyStudent[]>("/mentors/me/students");
  const promos = useApi<MyPromo[]>("/mentors/me/promo-codes");
  const [form, setForm] = useState<{ studentId: string; percentOff: number; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const activeFor = (id: string) => (promos.data ?? []).some((c) => c.state === "ACTIVE" && c.studentId === id);

  async function send() {
    if (!form) return;
    setBusy("send"); setMsg(null);
    try {
      promos.setData(await api<MyPromo[]>("/mentors/me/promo-codes", { body: { studentId: form.studentId, percentOff: form.percentOff, note: form.note || undefined } }));
      const name = students.data?.find((x) => x.id === form.studentId)?.name.split(" ")[0];
      setMsg({ tone: "success", text: `Code sent to ${name}. It's in their email and works once, for a 1:1 with you, within 30 days.` }); setForm(null);
    } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(null); }
  }
  async function revoke(id: string) {
    setBusy(id); setMsg(null);
    try { promos.setData(await api<MyPromo[]>(`/mentors/me/promo-codes/${id}`, { method: "DELETE" })); } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(null); }
  }

  if (students.loading || promos.loading) return <Skeleton className="h-48 rounded-3xl" />;
  const list = students.data ?? [];
  return (
    <div className="space-y-10">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Invite them back", "Ask a student to book again at the end of a session, and send them a code here."], ["Up to 50% off", "You choose the discount, from 5% to 50%. It comes off the session price."], [`${repeatPercent}% platform fee`, "Every 1:1 with a returning student has a lower platform fee, so more of the price is yours."]].map(([t, d], i) => (
          <div key={t} className={`rounded-3xl p-5 ${["bg-mint/60", "bg-lemon/60", "bg-sky/60"][i]}`}><p className="font-display text-2xl text-ink">{t}</p><p className="mt-1 text-sm leading-relaxed text-ink/70">{d}</p></div>
        ))}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <section>
        <h2 className="font-display text-3xl text-ink">Your students</h2>
        <p className="mt-1 text-sm text-ink-soft">Students who have had a paid session with you. Each can hold one unused code from you at a time.</p>
        {!live && <div className="mt-4"><Alert tone="info">You can send promo codes once your profile is live.</Alert></div>}
        {list.length === 0 ? <div className="mt-5"><EmptyState title="No students yet" description="After your first paid session, the student appears here and you can invite them back with a code." /></div> : (
          <div className="mt-5 overflow-hidden rounded-3xl bg-white ring-1 ring-line">
            {list.map((st, i) => (
              <div key={st.id} className={i ? "border-t border-line" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-dim text-xs text-ink">{initials(st.name)}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{st.name}</span><span className="text-xs text-ink-soft">{st.sessions} session{st.sessions === 1 ? "" : "s"} · last {fmtDayShort(st.lastSessionAt)}</span></span>
                  </div>
                  {activeFor(st.id) ? <Badge tone="brass">Code sent</Badge> : form?.studentId === st.id ? null : <Button size="sm" variant="secondary" disabled={!live} onClick={() => setForm({ studentId: st.id, percentOff: 20, note: "" })}>Send promo code</Button>}
                </div>
                {form?.studentId === st.id && (
                  <div className="border-t border-line bg-paper px-5 py-5 sm:px-6">
                    <div className="flex items-baseline justify-between"><p className="text-sm font-medium text-ink">Discount</p><p className="font-display text-3xl tabular-nums text-ink">{form.percentOff}% off</p></div>
                    <input type="range" min={5} max={50} step={5} value={form.percentOff} onChange={(e) => setForm({ ...form, percentOff: Number(e.target.value) })} className="mt-2 w-full accent-ink" aria-label="Discount percentage" />
                    <div className="flex justify-between text-[11px] text-ink-soft"><span>5%</span><span>50% maximum</span></div>
                    <div className="mt-4"><Field label="Note to the student (optional)"><input className="input" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={`e.g. Great talking today. Let's pick up on your CV next time.`} /></Field></div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" disabled={busy === "send"} onClick={() => setForm(null)}>Cancel</Button>
                      <Button size="sm" disabled={busy === "send"} onClick={send}>{busy === "send" ? <Spinner /> : `Email code to ${st.name.split(" ")[0]}`}</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {(promos.data ?? []).length > 0 && (
        <section>
          <h2 className="font-display text-3xl text-ink">Codes you&rsquo;ve sent</h2>
          <div className="mt-5 overflow-hidden rounded-3xl bg-white ring-1 ring-line">
            {(promos.data ?? []).map((c, i) => (
              <div key={c.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm sm:px-6 ${i ? "border-t border-line" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium text-ink"><span className="font-mono tracking-wide">{c.code}</span> · {c.percentOff}% off</p>
                  <p className="text-xs text-ink-soft">{c.studentName} · sent {fmtDayShort(c.createdAt)} · {c.state === "USED" && c.usedAt ? `used ${fmtDayShort(c.usedAt)}` : `valid until ${fmtDayShort(c.expiresAt)}`}</p>
                </div>
                <span className="flex items-center gap-2">
                  <Badge tone={c.state === "ACTIVE" ? "brass" : c.state === "USED" ? "forest" : "neutral"}>{{ ACTIVE: "Unused", USED: "Used", EXPIRED: "Expired", REVOKED: "Revoked" }[c.state]}</Badge>
                  {c.state === "ACTIVE" && <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => revoke(c.id)}>{busy === c.id ? <Spinner /> : "Revoke"}</Button>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Feedback({ loading, items, reload }: { loading: boolean; items: MyReview[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(id: string, action: "approve" | "hide") {
    setBusy(id + action); setError(null);
    try { await api(`/mentors/me/reviews/${id}/${action}`, { body: {} }); await reload(); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }
  if (loading) return <Skeleton className="h-40 rounded-3xl" />;
  const pending = items.filter((r) => r.status === "PENDING");
  const rest = items.filter((r) => r.status !== "PENDING");
  const card = (r: MyReview) => (
    <div key={r.id} className={`rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6 ${r.status === "PENDING" ? "border-l-4 border-brass" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{r.studentName.split(" ")[0]} {r.studentName.split(" ")[1]?.[0] ?? ""}. <span className="font-normal text-ink-soft">· {fmtDayShort(r.sessionAt)} · {r.agenda}</span></p>
          <p className="mt-1 text-lg"><Stars n={r.rating} /></p>
        </div>
        <Badge tone={r.status === "APPROVED" ? "forest" : r.status === "PENDING" ? "brass" : "neutral"}>{r.status === "APPROVED" ? "Public" : r.status === "PENDING" ? "Awaiting your approval" : "Hidden"}</Badge>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">&ldquo;{r.comment}&rdquo;</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {r.status !== "APPROVED" && <Button size="sm" disabled={!!busy} onClick={() => act(r.id, "approve")}>{busy === r.id + "approve" ? <Spinner /> : "Approve and publish"}</Button>}
        {r.status !== "HIDDEN" && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act(r.id, "hide")}>{busy === r.id + "hide" ? <Spinner /> : r.status === "APPROVED" ? "Remove from profile" : "Keep private"}</Button>}
      </div>
    </div>
  );
  return (
    <div className="space-y-10">
      {error && <Alert>{error}</Alert>}
      <p className="max-w-2xl text-sm text-ink-soft">Students&rsquo; feedback is private until you approve it. Approved feedback appears on your public profile and counts towards your rating. Please publish feedback fairly and keep it to genuine student experiences.</p>
      {items.length === 0 && <EmptyState title="No feedback yet" description="After a session finishes, the student is invited to leave feedback and it appears here for your approval." />}
      {pending.length > 0 && <section><h2 className="font-display text-3xl text-ink">Awaiting your approval</h2><div className="mt-5 space-y-3">{pending.map(card)}</div></section>}
      {rest.length > 0 && <section><h2 className="font-display text-3xl text-ink">Reviewed</h2><div className="mt-5 space-y-3">{rest.map(card)}</div></section>}
    </div>
  );
}

function Sessions({ loading, upcoming, toClose, history, now, reload }: { loading: boolean; upcoming: MyBooking[]; toClose: MyBooking[]; history: MyBooking[]; now: number; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(ref: string, action: "complete" | "no-show") {
    setBusy(ref + action); setError(null);
    try { await api(`/bookings/${ref}/${action}`, { body: {} }); await reload(); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-10">
      {error && <Alert>{error}</Alert>}

      {toClose.length > 0 && (
        <section>
          <h2 className="font-display text-3xl text-ink">Record the outcome</h2>
          <p className="mt-1 text-sm text-ink-soft">Marking a session completed emails the student a feedback request.</p>
          <div className="mt-5 space-y-3">
            {toClose.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-l-4 border-brass bg-white p-5 ring-1 ring-line sm:p-6">
                <div className="flex items-center gap-4">
                  <DateTile iso={b.startAt} />
                  <StudentChip name={b.studentName} />
                  <div>
                    <p className="font-display text-xl text-ink">{b.studentName}</p>
                    <p className="text-sm text-ink-soft">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.agenda}</p>
                    <span className="mt-1.5 inline-block rounded-full bg-brass-pale px-2.5 py-0.5 text-xs font-medium text-brass-dark">Needs outcome</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.meetingLink && new Date(b.endAt).getTime() + 3600_000 > now && <a href={b.meetingLink} target="_blank" rel="noreferrer" className="rounded-full bg-paper-dim px-4 py-2 text-sm font-medium text-ink hover:bg-line">Join call</a>}
                  <Button size="sm" disabled={!!busy} onClick={() => act(b.reference, "complete")}>{busy === b.reference + "complete" ? <Spinner /> : "Mark completed"}</Button>
                  <Button size="sm" variant="danger" disabled={!!busy} onClick={() => act(b.reference, "no-show")}>Student no-show</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-3xl text-ink">Upcoming sessions</h2>
        <div className="mt-5 space-y-3">
          {loading ? <><Skeleton className="h-36 rounded-3xl" /><Skeleton className="h-36 rounded-3xl" /></> : upcoming.length === 0 ? (
            <EmptyState title="No upcoming sessions" description="When a student books and pays, their preparation notes will appear here." />
          ) : upcoming.map((b, i) => (
            <Reveal key={b.id} delay={i * 60}>
              <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <DateTile iso={b.startAt} />
                    <StudentChip name={b.studentName} />
                    <div className="min-w-0">
                      <p className="font-display text-xl text-ink">{b.studentName}</p>
                      <p className="text-sm text-ink-soft">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {relative(b.startAt, now)}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5"><Badge>{b.agenda}</Badge><Badge tone={b.sessionKind === "GROUP" ? "brass" : "neutral"}>{b.sessionKind === "GROUP" ? "Group" : "1:1"}</Badge></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {b.meetingLink && <a href={b.meetingLink} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white">Session page</a>}
                  </div>
                </div>
                <details className="group mt-4 rounded-2xl bg-paper-dim px-4 py-3">
                  <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-ink">Student&rsquo;s preparation notes<span className="faq-plus text-lg font-light transition-transform">+</span></summary>
                  <dl className="mt-3 space-y-2 text-sm text-ink-soft">
                    <div><dt className="font-medium text-ink">Current situation</dt><dd>{b.currentSituation}</dd></div>
                    <div><dt className="font-medium text-ink">What would make this useful</dt><dd>{b.usefulOutcome}</dd></div>
                    {b.materialsToReview && <div><dt className="font-medium text-ink">To review beforehand</dt><dd>{b.materialsToReview}</dd></div>}
                  </dl>
                </details>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="font-display text-3xl text-ink">History</h2>
          <div className="mt-5 overflow-hidden rounded-3xl bg-white ring-1 ring-line">
            {history.map((b, i) => (
              <div key={b.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm sm:px-6 ${i ? "border-t border-line" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-dim text-xs text-ink">{initials(b.studentName)}</span>
                  <span className="min-w-0"><span className="block font-medium text-ink">{b.studentName}</span><span className="text-ink-soft">{fmtDayShort(b.startAt)} · {b.agenda}{b.sessionKind === "GROUP" ? " · Group" : ""}</span></span>
                </div>
                <span className="flex items-center gap-3">
                  {b.review && <span className="text-brass" title={b.review.comment}>{"★".repeat(b.review.rating)}<span className="text-line">{"★".repeat(5 - b.review.rating)}</span></span>}
                  <Badge tone={b.status === "COMPLETED" ? "forest" : "rust"}>{STATUS_LABEL[b.status]}</Badge>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const TIMES = Array.from({ length: 34 }, (_, i) => ({ h: 6 + Math.floor(i / 2), m: (i % 2) * 30 }));

function Availability({ slots, loading, reload }: { slots: MySlot[] | null; loading: boolean; reload: () => void }) {
  const [date, setDate] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kind, setKind] = useState<"ONE_TO_ONE" | "GROUP">("ONE_TO_ONE");
  const [capacity, setCapacity] = useState(4);
  const today = new Date().toISOString().slice(0, 10);

  const toISO = (t: string) => { const [h, m] = t.split(":").map(Number); const [y, mo, d] = date.split("-").map(Number); return new Date(y, mo - 1, d, h, m).toISOString(); };

  async function add() {
    setBusy(true); setError(null); setOk(null);
    try {
      const r = await api<{ created: number }>("/mentors/me/slots", { body: { startTimes: picked.map(toISO), kind, ...(kind === "GROUP" ? { capacity } : {}) } });
      setOk(`${r.created} slot${r.created === 1 ? "" : "s"} published.`); setPicked([]); reload();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api(`/mentors/me/slots/${id}`, { method: "DELETE" }); reload(); } catch (e) { setError(errMsg(e)); }
  }

  const grouped = groupByDay((slots ?? []).map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt })));
  const byId = new Map((slots ?? []).map((s) => [s.id, s]));

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <Panel title="Add availability" className="lg:sticky lg:top-24 lg:self-start">
        <p className="-mt-3 mb-5 text-xs text-ink-soft">Times are in your timezone ({localTz()}). Each slot is 30 minutes.</p>
        <div className="grid grid-cols-2 gap-2">
          {([["ONE_TO_ONE", "1:1 session", "Private, full price"], ["GROUP", "Group session", "Lower price per student"]] as const).map(([k, label, hint]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-2xl px-4 py-3 text-left text-xs transition-colors ${kind === k ? "bg-ink text-white" : "bg-paper-dim text-ink hover:bg-line"}`}>
              <span className="block text-sm font-medium">{label}</span><span className={kind === k ? "text-white/70" : "text-ink-soft"}>{hint}</span>
            </button>
          ))}
        </div>
        {kind === "GROUP" && <div className="mt-4"><Field label="Seats per group session" hint="2 to 10 students"><input type="number" className="input" min={2} max={10} value={capacity} onChange={(e) => setCapacity(Math.min(10, Math.max(2, Number(e.target.value) || 2)))} /></Field></div>}
        <div className="mt-4"><Field label="Date"><input type="date" className="input" min={today} value={date} onChange={(e) => { setDate(e.target.value); setPicked([]); }} /></Field></div>
        {date && (
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {TIMES.map(({ h, m }) => {
              const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              const on = picked.includes(t);
              return <button key={t} type="button" aria-pressed={on} onClick={() => setPicked((s) => on ? s.filter((x) => x !== t) : [...s, t])} className={`rounded-full py-1.5 text-xs transition-colors ${on ? "bg-ink text-white" : "bg-paper-dim text-ink hover:bg-line"}`}>{t}</button>;
            })}
          </div>
        )}
        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        {ok && <div className="mt-4"><Alert tone="success">{ok}</Alert></div>}
        <Button className="mt-5 w-full" disabled={busy || picked.length === 0} onClick={add}>{busy ? <Spinner /> : `Publish ${picked.length || ""} slot${picked.length === 1 ? "" : "s"}`}</Button>
      </Panel>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl text-ink">Your upcoming slots</h2>
          <div className="flex flex-wrap gap-3 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-paper-dim ring-1 ring-line" />Open</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-lemon" />Some seats taken</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-mint" />Booked</span>
          </div>
        </div>
        {loading ? <Skeleton className="mt-5 h-40 rounded-3xl" /> : grouped.length === 0 ? (
          <div className="mt-5"><EmptyState title="No slots published" description="Students can only book times you publish here." /></div>
        ) : (
          <div className="mt-5 space-y-3">
            {grouped.map((g) => (
              <div key={g.key} className="flex gap-4 rounded-3xl bg-white p-4 ring-1 ring-line sm:p-5">
                <DateTile iso={g.iso} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{fmtDay(g.iso)}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {g.slots.map((s) => {
                      const full = byId.get(s.id)!;
                      const label = full.kind === "GROUP" ? ` · group ${full.seatsTaken}/${full.capacity}` : "";
                      return full.isBooked
                        ? <span key={s.id} className="rounded-full bg-mint px-3 py-1.5 text-xs text-forest" title="Fully booked">{fmtTime(s.startAt)}{label || " · booked"}</span>
                        : full.seatsTaken > 0
                        ? <span key={s.id} className="rounded-full bg-lemon px-3 py-1.5 text-xs text-ink" title="Has bookings">{fmtTime(s.startAt)}{label}</span>
                        : <button key={s.id} onClick={() => remove(s.id)} className="group rounded-full bg-paper-dim px-3 py-1.5 text-xs text-ink transition-colors hover:bg-rust-pale hover:text-rust" title="Remove slot">{fmtTime(s.startAt)}{label} <span className="ml-1 opacity-40 group-hover:opacity-100">×</span></button>;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileEditor({ p, onSaved }: { p: Profile; onSaved: () => void }) {
  const lines = (a: string[]) => a.join("\n");
  const [f, setF] = useState({ title: p.title, organization: p.organization, introduction: p.introduction, careerSummary: p.careerSummary, helpTopics: lines(p.helpTopics), outsideScope: lines(p.outsideScope), qualifications: lines(p.qualifications), achievements: lines(p.achievements), linkedinUrl: p.linkedinUrl ?? "", photoUrl: p.photoUrl ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api("/mentors/me/profile", { method: "PATCH", body: { title: f.title, organization: f.organization, introduction: f.introduction, careerSummary: f.careerSummary, helpTopics: split(f.helpTopics), outsideScope: split(f.outsideScope), qualifications: split(f.qualifications), achievements: split(f.achievements), ...(f.linkedinUrl ? { linkedinUrl: f.linkedinUrl } : {}), ...(f.photoUrl ? { photoUrl: f.photoUrl } : {}) } });
      setMsg({ tone: "success", text: "Profile saved." }); onSaved();
    } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }

  // Live preview of the card students see in search results.
  const preview: MentorSummary = { ...p, title: f.title, organization: f.organization, photoUrl: f.photoUrl || null };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Panel title="About you">
          <p className="-mt-3 mb-5 text-sm text-ink-soft">This is what students see on your public profile. Write in your own voice and keep claims specific and accurate.</p>
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
            <Field label="Profile photo URL" hint="A public https link to a clear, recent headshot. Shown on your card and profile."><input className="input" type="url" placeholder="https://" value={f.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} /></Field>
            <Field label="LinkedIn URL"><input className="input" type="url" value={f.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} /></Field>
          </div>
        </Panel>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button size="lg" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Save profile"}</Button>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-sm font-medium text-ink">Preview of your card</p>
        <MentorCard mentor={preview} />
        <p className="mt-3 text-xs text-ink-soft">Updates as you type. Save to publish your changes.</p>
      </div>
    </div>
  );
}
