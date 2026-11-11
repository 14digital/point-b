"use client";

import { useState } from "react";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Field, FilterChips, Mark, Skeleton, Spinner } from "@/components/ui";
import { Stars } from "@/components/feedback";
import { DashboardHero, DateTile, InterviewCard, Panel, StatTile, Tabs, greeting, relative } from "@/components/dashboard";
import { MentorCard } from "@/components/mentor-card";
import { PhotoUpload } from "@/components/photo-upload";
import { Availability, type MySlot } from "@/components/mentor-availability";
import { Reveal } from "@/components/motion";
import { api, errMsg } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtDayShort, fmtTime, formatMoney, initials } from "@/lib/format";
import { useUrlTab } from "@/lib/use-url-tab";
import { MySupport } from "@/components/my-support";
import { SessionButton } from "@/components/session-button";
import { useApi, useNow } from "@/lib/use-api";
import type { Booking, Currency, Interview, MentorSummary, MyReview } from "@/lib/types";
import { PayoutDetailsForm, PayoutDetailsView, type PayoutDetails } from "@/components/admin-mentor-detail";

interface Earnings { totals: { currency: Currency; grossMinor: number; feeMinor: number; payoutMinor: number; sessions: number; repeatSessions: number }[]; tierPercent: number | null; repeatPercent: number; commissionConfigured: boolean }
interface MyStudent { id: string; name: string; email: string; lastSessionAt: string; sessions: number }
interface MyPromo { id: string; studentId: string; code: string; percentOff: number; note: string; createdAt: string; expiresAt: string; usedAt: string | null; studentName: string; state: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED" }
type MyBooking = Booking & { studentName: string; hostStartedAt?: string | null };
type Profile = MentorSummary & { agreementAcceptedAt?: string | null };

const TABS = ["Sessions", "Feedback", "Promo codes", "Availability", "Payouts", "Profile", "Support"] as const;
type Tab = (typeof TABS)[number];

export default function MentorDashboardPage() {
  return <RequireRole role="MENTOR"><Dashboard /></RequireRole>;
}

function Dashboard() {
  const [tab, setTab] = useUrlTab(TABS, "Sessions");
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
  const currency = (earnings.data?.totals[0]?.currency ?? (p?.currency ?? "PKR")) as Currency;
  const totals = earnings.data?.totals.find((t) => t.currency === currency);
  const openSlots = (slots.data ?? []).filter((s) => !s.isBooked).length;
  const reload = async () => { await Promise.all([bookings.reload(), earnings.reload(), slots.reload()]); };

  return (
    <>
      <DashboardHero
        eyebrow={<><span>Mentor dashboard</span>{p && <Badge tone={p.status === "ACTIVE" ? "forest" : p.status === "ONBOARDING" ? "brass" : "rust"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>}</>}
        title={<>{greeting()}, <Mark color="mint">{p ? p.name.split(" ")[0] : "mentor"}</Mark></>}
        subtitle={upcoming[0] ? `Your next session is ${relative(upcoming[0].startAt, now)}, with ${upcoming[0].studentName}.` : toClose.length ? `${toClose.length} session${toClose.length > 1 ? "s" : ""} need an outcome from you.` : "No sessions booked yet. Publishing more times helps mentees find you."}
        actions={<>{p && p.status === "ACTIVE" && <Button href={`/mentors/${p.slug}`} variant="secondary">View public profile</Button>}<Button onClick={() => goTo("Availability")}>Add availability</Button></>}
      >
        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Upcoming sessions" value={bookings.loading ? "–" : upcoming.length} tone="sky" onClick={() => goTo("Sessions")} />
          <StatTile label="Needs your outcome" value={bookings.loading ? "–" : toClose.length} tone={toClose.length ? "lemon" : "white"} delay={60} onClick={() => goTo("Sessions")} />
          <StatTile label="Open slots" value={slots.loading ? "–" : openSlots} tone="mint" delay={120} onClick={() => goTo("Availability")} />
          <StatTile label={earnings.data?.commissionConfigured ? "Your earnings" : "Booked value"} value={formatMoney((earnings.data?.commissionConfigured ? totals?.payoutMinor : totals?.grossMinor) ?? 0, currency)} tone="peach" delay={180} onClick={() => goTo("Payouts")}
            note={earnings.data?.commissionConfigured && earnings.data.tierPercent != null ? `After ${earnings.data.tierPercent}% platform fee, ${earnings.data.repeatPercent}% for returning mentees` : "Payout terms are confirmed by POINT B."} />
        </div>
      </DashboardHero>

      <Container className="py-10 sm:py-12">
        {interview.data && <InterviewCard iv={interview.data} />}
        {profile.error && <div className="mb-6"><Alert>{profile.error}</Alert></div>}
        {p && p.status !== "ACTIVE" && <Checklist p={p} hasSlots={(slots.data?.length ?? 0) > 0} onDone={profile.reload} />}

        <div id="mentor-tabs" className="mb-8 flex scroll-mt-24 flex-wrap items-center justify-between gap-4">
          <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Sessions: upcoming.length + toClose.length, Availability: openSlots }} />
          {p && <p className="text-sm text-ink-soft">{p.rating ? <>★ {p.rating.toFixed(1)} from {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}</> : "No reviews yet"} · {p.sessionsCompleted} completed</p>}
        </div>

        {tab === "Sessions" && <Sessions loading={bookings.loading} upcoming={upcoming} toClose={toClose} history={history} now={now} reload={reload} />}
        {tab === "Feedback" && <Feedback loading={reviews.loading} items={reviews.data ?? []} />}
        {tab === "Promo codes" && <PromoCodes live={p?.status === "ACTIVE"} repeatPercent={earnings.data?.repeatPercent ?? 15} />}
        {tab === "Availability" && <Availability slots={slots.data} loading={slots.loading} reload={slots.reload} />}
        {tab === "Payouts" && <PayoutSettings />}
        {tab === "Profile" && p && <ProfileEditor p={p} onSaved={profile.reload} />}
        {tab === "Support" && <div className="max-w-3xl"><MySupport /></div>}
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
      <MyReferralCodes />
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Invite them back", "Ask a mentee to book again at the end of a session, and send them a code here."], ["Up to 50% off", "You choose the discount, from 5% to 50%. It comes off the session price."], [`${repeatPercent}% platform fee`, "Every 1:1 with a returning mentee has a lower platform fee, so more of the price is yours."]].map(([t, d], i) => (
          <div key={t} className={`rounded-3xl p-5 ${["bg-mint/60", "bg-lemon/60", "bg-sky/60"][i]}`}><p className="font-display text-2xl text-ink">{t}</p><p className="mt-1 text-sm leading-relaxed text-ink/70">{d}</p></div>
        ))}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <section>
        <h2 className="font-display text-3xl text-ink">Your mentees</h2>
        <p className="mt-1 text-sm text-ink-soft">Mentees who have had a paid session with you. Each can hold one unused code from you at a time.</p>
        {!live && <div className="mt-4"><Alert tone="info">You can send promo codes once your profile is live.</Alert></div>}
        {list.length === 0 ? <div className="mt-5"><EmptyState title="No mentees yet" description="After your first paid session, the mentee appears here and you can invite them back with a code." /></div> : (
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
                    <div className="mt-4"><Field label="Note to the mentee (optional)"><input className="input" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={`e.g. Great talking today. Let's pick up on your CV next time.`} /></Field></div>
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

/** Feedback from students, read-only: the POINT B team decides what appears on the public profile. */
function Feedback({ loading, items }: { loading: boolean; items: MyReview[] }) {
  if (loading) return <Skeleton className="h-40 rounded-3xl" />;
  const card = (r: MyReview) => (
    <div key={r.id} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{r.studentName.split(" ")[0]} {r.studentName.split(" ")[1]?.[0] ?? ""}. <span className="font-normal text-ink-soft">· {fmtDayShort(r.sessionAt)} · {r.agenda}</span></p>
          <p className="mt-1 text-lg"><Stars n={r.rating} /></p>
        </div>
        <Badge tone={r.status === "APPROVED" ? "forest" : r.status === "PENDING" ? "brass" : "neutral"}>{r.status === "APPROVED" ? "On your public profile" : r.status === "PENDING" ? "Being reviewed by POINT B" : "Private"}</Badge>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">&ldquo;{r.comment}&rdquo;</p>
    </div>
  );
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-ink-soft">Every piece of feedback from your mentees is shown here. The POINT B team reviews it and decides what appears on your public profile and counts towards your rating, so ratings stay fair for everyone. If you think a review breaks the rules, contact support.</p>
      {items.length === 0 ? <EmptyState title="No feedback yet" description="After a session finishes, the mentee is invited to leave feedback, and it appears here." /> : <div className="space-y-3">{items.map(card)}</div>}
    </div>
  );
}

const SHORT_LIST = 4;

function Sessions({ loading, upcoming, toClose, history, now, reload }: { loading: boolean; upcoming: MyBooking[]; toClose: MyBooking[]; history: MyBooking[]; now: number; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingNoShow, setConfirmingNoShow] = useState<string | null>(null);
  const [allToClose, setAllToClose] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const closing = allToClose ? toClose : toClose.slice(0, SHORT_LIST);
  const past = allHistory ? history : history.slice(0, SHORT_LIST);
  const more = "mt-3 w-full rounded-full border border-line bg-white py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30";

  async function act(ref: string, action: "complete" | "no-show") {
    setBusy(ref + action); setError(null);
    try { await api(`/bookings/${ref}/${action}`, { body: {} }); setConfirmingNoShow(null); await reload(); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-10">
      {error && <Alert>{error}</Alert>}

      {toClose.length > 0 && (
        <section>
          <h2 className="font-display text-3xl text-ink">Record the outcome</h2>
          <p className="mt-1 text-sm text-ink-soft">Marking a session completed emails the mentee a feedback request.</p>
          <div className="mt-5 space-y-3">
            {closing.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-l-4 border-amber bg-white p-5 ring-1 ring-line sm:p-6">
                <div className="flex items-center gap-4">
                  <DateTile iso={b.startAt} />
                  <span className="hidden sm:block"><StudentChip name={b.studentName} /></span>
                  <div>
                    <p className="font-display text-xl text-ink">{b.studentName}</p>
                    <p className="text-sm text-ink-soft">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.agenda}</p>
                    <span className="mt-1.5 inline-block rounded-full bg-amber-pale px-2.5 py-0.5 text-xs font-medium text-amber-dark">Needs outcome</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.meetingLink && new Date(b.endAt).getTime() + 3600_000 > now && <a href={b.meetingLink} target="_blank" rel="noreferrer" className="rounded-full bg-paper-dim px-4 py-2 text-sm font-medium text-ink hover:bg-line">Join call</a>}
                  <Button size="sm" disabled={!!busy} onClick={() => act(b.reference, "complete")}>{busy === b.reference + "complete" ? <Spinner /> : "Mark completed"}</Button>
                  {b.hostStartedAt && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmingNoShow(b.reference)}>Mentee didn&rsquo;t join</Button>}
                </div>
                {confirmingNoShow === b.reference && (
                  <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4">
                    <p className="text-sm text-ink">Mark {b.studentName.split(" ")[0]} as a no-show? They won&rsquo;t get a refund, and this can&rsquo;t be undone.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmingNoShow(null)}>Go back</Button>
                      <Button size="sm" variant="danger" disabled={!!busy} onClick={() => act(b.reference, "no-show")}>{busy === b.reference + "no-show" ? <Spinner /> : "Mark as no-show"}</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {toClose.length > SHORT_LIST && <button type="button" onClick={() => setAllToClose(!allToClose)} className={more}>{allToClose ? "Show fewer" : `Show all ${toClose.length}`}</button>}
        </section>
      )}

      <section>
        <h2 className="font-display text-3xl text-ink">Upcoming sessions</h2>
        <div className="mt-5 space-y-3">
          {loading ? <><Skeleton className="h-36 rounded-3xl" /><Skeleton className="h-36 rounded-3xl" /></> : upcoming.length === 0 ? (
            <EmptyState title="No upcoming sessions" description="When a mentee books and pays, their preparation notes will appear here." />
          ) : upcoming.map((b, i) => (
            <Reveal key={b.id} delay={i * 60}>
              <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <DateTile iso={b.startAt} />
                    <span className="hidden sm:block"><StudentChip name={b.studentName} /></span>
                    <div className="min-w-0">
                      <p className="font-display text-xl text-ink">{b.studentName}</p>
                      <p className="text-sm text-ink-soft">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {relative(b.startAt, now)}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5"><Badge>{b.agenda}</Badge><Badge tone={b.sessionKind === "GROUP" ? "brass" : "neutral"}>{b.sessionKind === "GROUP" ? "Group" : "1:1"}</Badge></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {b.meetingLink && <SessionButton link={b.meetingLink} startAt={b.startAt} endAt={b.endAt} withName={b.studentName} detail={`${b.sessionKind === "GROUP" ? "Group" : "1:1"} · ${b.agenda}`} joinClass="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-white" waitClass="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white" />}
                  </div>
                </div>
                <details className="group mt-4 rounded-2xl bg-paper-dim px-4 py-3">
                  <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-ink">Mentee&rsquo;s preparation notes<span className="faq-plus text-lg font-light transition-transform">+</span></summary>
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
            {past.map((b, i) => (
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
          {history.length > SHORT_LIST && <button type="button" onClick={() => setAllHistory(!allHistory)} className={more}>{allHistory ? "Show fewer" : `Show all ${history.length}`}</button>}
        </section>
      )}
    </div>
  );
}

function ProfileEditor({ p, onSaved }: { p: Profile; onSaved: () => unknown }) {
  const lines = (a: string[]) => a.join("\n");
  const [f, setF] = useState({ title: p.title, organization: p.organization, introduction: p.introduction, careerSummary: p.careerSummary, helpTopics: lines(p.helpTopics), outsideScope: lines(p.outsideScope), qualifications: lines(p.qualifications), achievements: lines(p.achievements), linkedinUrl: p.linkedinUrl ?? "" });
  // undefined: unchanged. A data URL: a newly chosen photo. null: removed.
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
  // Live preview of the card students see in search results.
  const preview: MentorSummary = { ...p, title: f.title, organization: f.organization, photoUrl: photoSrc };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Panel title="About you">
          <p className="-mt-3 mb-5 text-sm text-ink-soft">This is what mentees see on your public profile. Write in your own voice and keep claims specific and accurate.</p>
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
        <MentorCard mentor={preview} />
        <p className="mt-3 text-xs text-ink-soft">Updates as you type. Save to publish your changes.</p>
      </div>
    </div>
  );
}

interface MyPayouts {
  totals: { currency: Currency; earnedMinor: number; paidMinor: number; dueMinor: number; forCancelledMinor: number; sessions: number }[];
  payouts: { id: string; createdAt: string; currency: Currency; amountMinor: number; sessions: number; reference: string | null; note: string | null }[];
  sessions: { reference: string; status: string; currency: Currency; startAt: string; studentName: string; priceMinor: number; percent: number | null; earnMinor: number | null; paidOn: string | null }[];
  hasPayoutDetails: boolean;
}

const monthKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key: string, month: "short" | "long") => new Date(`${key}-15T12:00:00`).toLocaleDateString("en-GB", { month, year: "numeric" });

/** The mentor's money: what they've earned, what we've paid and what's on its way, plus where to pay them. */
function PayoutSettings() {
  const data = useApi<MyPayouts>("/mentors/me/payouts");
  const saved = useApi<PayoutDetails | null>("/mentors/me/payout-details");
  const [draft, setDraft] = useState<PayoutDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState("all");
  if (saved.loading || data.loading) return <Skeleton className="h-64 rounded-3xl" />;
  const editing = draft ?? (saved.data ? null : { method: "bank" });
  const d = data.data;
  async function save() {
    setBusy(true); setMsg(null);
    try { saved.setData(await api<PayoutDetails>("/mentors/me/payout-details", { method: "PUT", body: editing })); setDraft(null); setMsg({ tone: "success", text: "Saved. We'll pay your earnings into this account." }); }
    catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }
  const months = [...new Set((d?.sessions ?? []).map((s) => monthKey(s.startAt)))];
  const month = months.includes(picked) ? picked : "all";
  const inMonth = month === "all" ? "" : monthLabel(month, "long");
  const monthSessions = (d?.sessions ?? []).filter((s) => month === "all" || monthKey(s.startAt) === month);
  const payments = (d?.payouts ?? []).filter((p) => month === "all" || monthKey(p.createdAt) === month);
  const earned = (l: typeof monthSessions) => l.reduce((n, s) => n + (s.earnMinor ?? 0), 0);
  // All time uses the statement totals; a single month is added up from its sessions.
  const totals: MyPayouts["totals"] = month === "all" ? d?.totals ?? [] : [...new Set((d?.sessions ?? []).map((s) => s.currency))].flatMap((currency) => {
    const mine = monthSessions.filter((s) => s.currency === currency);
    if (!mine.length) return [];
    const unpaid = earned(mine.filter((s) => !s.paidOn));
    return [{ currency, earnedMinor: earned(mine), paidMinor: earned(mine) - unpaid, dueMinor: unpaid, forCancelledMinor: 0, sessions: mine.length }];
  });
  const sessions = showAll ? monthSessions : monthSessions.slice(0, 8);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 space-y-6">
        {months.length > 0 && (
          <div>
            <FilterChips options={[["all", "All time"], ...months.map((m) => [m, monthLabel(m, "short")] as const)]} value={month} onChange={(m) => { setPicked(m); setShowAll(false); }} label="Show earnings for" />
            {inMonth && <p className="mt-2 text-xs text-ink-soft">Earnings count in the month the session takes place.</p>}
          </div>
        )}
        {!totals.length ? <Panel title="Your earnings"><p className="text-sm text-ink-soft">Your earnings appear here after your first paid session.</p></Panel> : totals.map((t) => (
          <Panel key={t.currency} title={`${inMonth || "Earnings"} · ${t.currency}`} action={<span className="text-sm text-ink-soft">{t.sessions} paid session{t.sessions === 1 ? "" : "s"}</span>}>
            <div className="grid gap-2 sm:grid-cols-3">
              {([["Earned", t.earnedMinor, "bg-paper"], ["Paid to you", t.paidMinor, "bg-mint/60"], ["On its way", t.dueMinor, t.dueMinor ? "bg-lemon/60" : "bg-paper"]] as const).map(([k, v, bg]) => (
                <div key={k} className={`flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3 sm:block ${bg}`}><p className="text-xs text-ink-soft">{k}</p><p className="whitespace-nowrap font-display text-2xl leading-tight text-ink tabular-nums sm:mt-1">{formatMoney(v, t.currency)}</p></div>
              ))}
            </div>
            {t.earnedMinor > 0 && <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-paper-dim" aria-hidden><span className="h-full bg-forest" style={{ width: `${Math.min(100, ((t.earnedMinor - t.dueMinor) / t.earnedMinor) * 100)}%` }} /></div>}
            {t.forCancelledMinor > 0 && <p className="mt-3 text-xs text-ink-soft">{formatMoney(t.forCancelledMinor, t.currency)} of what we&rsquo;ve paid you was for a session that was later cancelled. The POINT B team will be in touch about it.</p>}
          </Panel>
        ))}

        {!!payments.length && (
          <Panel title={inMonth ? `Payments sent in ${inMonth}` : "Payments we've sent"}>
            <ul className="divide-y divide-line">{payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0"><span className="block text-ink">{fmtDay(p.createdAt)}</span><span className="block truncate text-xs text-ink-soft">{p.sessions} session{p.sessions === 1 ? "" : "s"}{p.reference ? ` · ref ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</span></span>
                <span className="whitespace-nowrap font-medium tabular-nums text-ink">{formatMoney(p.amountMinor, p.currency)}</span>
              </li>
            ))}</ul>
          </Panel>
        )}

        {!!monthSessions.length && (
          <Panel title={inMonth ? `Sessions in ${inMonth}` : "Sessions"}>
            <ul className="divide-y divide-line">{sessions.map((s) => (
              <li key={s.reference} className="flex items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate text-ink">{s.studentName}</span><span className="block text-xs text-ink-soft">{fmtDayShort(s.startAt)}, {fmtTime(s.startAt)} · <span className="whitespace-nowrap">{formatMoney(s.priceMinor, s.currency)}{s.percent != null ? ` − ${s.percent}%` : ""}</span></span></span>
                <span className="text-right"><span className="block whitespace-nowrap font-medium tabular-nums text-ink">{s.earnMinor == null ? "—" : formatMoney(s.earnMinor, s.currency)}</span><span className={`block text-xs ${s.paidOn ? "text-forest" : "text-ink-soft"}`}>{s.paidOn ? `Paid ${fmtDayShort(s.paidOn)}` : "On its way"}</span></span>
              </li>
            ))}</ul>
            {monthSessions.length > 8 && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-sm font-medium text-ink underline-offset-4 hover:underline">{showAll ? "Show fewer" : `Show all ${monthSessions.length}`}</button>}
          </Panel>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div>
          <h2 className="font-display text-2xl text-ink">Where should we pay you?</h2>
          <p className="mt-1 text-sm text-ink-soft">We send your share of each session here and email you a statement every time. Only the POINT B finance team can see these details.</p>
        </div>
        {editing ? <PayoutDetailsForm value={editing} onChange={setDraft} busy={busy} onSave={save} onCancel={saved.data ? () => setDraft(null) : undefined} />
          : <div className="space-y-3"><PayoutDetailsView d={saved.data ?? null} /><div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => setDraft(saved.data ?? { method: "bank" })}>Change details</Button></div></div>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </aside>
    </div>
  );
}

interface MyReferral { id: string; code: string; percentOff: number; state: "ACTIVE" | "EXPIRED" | "USED_UP"; expiresAt: string | null; maxUses: number | null; uses: number; bookings: number }

/** Company referral codes made for this mentor: they share them, students save, and they're still paid in full. */
function MyReferralCodes() {
  const { data } = useApi<MyReferral[]>("/mentors/me/referral-codes");
  const [copied, setCopied] = useState<string | null>(null);
  const profile = useApi<{ slug: string; user?: { name: string }; name?: string }>(data?.length ? "/mentors/me/profile" : null).data;
  const slug = profile?.slug;
  const first = (profile?.name ?? profile?.user?.name)?.split(" ")[0];
  if (!data?.length) return null;
  const copy = (key: string, text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }).catch(() => undefined);
  return (
    <section className="overflow-hidden rounded-3xl bg-ink text-white">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-lime">Your POINT B referral code</p>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">Share it. Mentees save, you&rsquo;re paid in full.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
            Anyone who books a 1:1 with you using this code gets a discount, and POINT B covers it. Your pay is worked out on your full session price{first ? `, ${first}` : ""}.
          </p>
        </div>
        <div className="space-y-3">
          {data.map((c) => {
            const link = slug ? `${window.location.origin}/mentors/${slug}?code=${c.code}` : "";
            return (
              <div key={c.id} className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 lg:min-w-[22rem]">
                <div className="flex items-center justify-between gap-4">
                  <button type="button" onClick={() => copy(c.id, c.code)} className="text-left" title="Copy code">
                    <span className="block font-mono text-2xl font-semibold tracking-[0.14em]">{c.code}</span>
                    <span className="text-xs text-white/60">{copied === c.id ? "Copied" : `${c.percentOff}% off for mentees · tap to copy`}</span>
                  </button>
                  <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink">{c.state === "ACTIVE" ? `${c.bookings} booked` : c.state === "EXPIRED" ? "Ended" : "Limit reached"}</span>
                </div>
                {link && c.state === "ACTIVE" && (
                  <button type="button" onClick={() => copy(`${c.id}-link`, link)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink transition-transform hover:-translate-y-0.5">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    {copied === `${c.id}-link` ? "Link copied" : "Copy your booking link"}
                  </button>
                )}
                {(c.expiresAt || c.maxUses) && <p className="mt-2 text-center text-[11px] text-white/50">{[c.expiresAt && `Ends ${new Date(c.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, c.maxUses && `${c.uses} of ${c.maxUses} used`].filter(Boolean).join(" · ")}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
