"use client";

import { VerifyEmail } from "@/components/verify-email";
import { ReportMissing, ReportStatus } from "@/components/report-missing";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/require-role";
import { Alert, Badge, Button, Container, EmptyState, Mark, MentorPhoto, Skeleton, Spinner } from "@/components/ui";
import { DashboardHero, DateTile, StatTile, Tabs, greeting, relative } from "@/components/dashboard";
import { Reveal } from "@/components/motion";
import { CheckoutDialog } from "@/components/checkout";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/constants";
import { FeedbackForm, SubmittedFeedback } from "@/components/feedback";
import { MobileField, WhatsAppIcon } from "@/components/mobile-field";
import { isValidPhone, type CountryCode } from "@/components/phone-input";
import { fmtDay, fmtDayShort, fmtTime, formatMoney } from "@/lib/format";
import { useUrlTab } from "@/lib/use-url-tab";
import { useApi, useNow } from "@/lib/use-api";
import type { Booking, CourseClass, Currency } from "@/lib/types";
import { NoticeText } from "@/lib/policy";
import { MySupport, type SupportPreset } from "@/components/my-support";
import { ClassSessionAction } from "@/components/class-session-action";
import { FinanceModal } from "@/components/finance-modal";
import { SessionButton } from "@/components/session-button";

const TABS = ["Upcoming", "Awaiting payment", "Past"] as const;

export default function StudentDashboardPage() {
  return <RequireRole role="STUDENT"><Suspense><Dashboard /></Suspense></RequireRole>;
}

function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<Booking[]>("/bookings");
  const promos = useApi<{ code: string; percentOff: number; expiresAt: string; note: string; mentorSlug: string | null; mentorName: string }[]>("/bookings/promos");
  const params = useSearchParams();
  const router = useRouter();
  const returned = params.get("paid");
  // Back from a payment method that redirects (e.g. bank authentication): confirm with the API, then tidy the URL.
  useEffect(() => {
    if (!returned) return;
    api(`/payments/${returned}/sync`, { method: "POST" }).catch(() => undefined).finally(() => { reload(); router.replace("/dashboard/student"); });
  }, [returned, reload, router]);
  const now = useNow();
  // Course enrolments stay upcoming until the final class ends (booking.endAt is only the first class).
  const stillOn = (b: Booking) => b.course
    ? remainingClasses(b, now).length > 0 || !!b.course.nextClass || !!b.course.liveClass
    : new Date(b.endAt).getTime() > now;
  const upcoming = (data ?? []).filter((b) => b.status === "CONFIRMED" && stillOn(b)).sort((a, b) => +new Date(nextAt(a)) - +new Date(nextAt(b)));
  const pending = (data ?? []).filter((b) => b.status === "PENDING_PAYMENT");
  const pastEnrolments = (data ?? []).filter((b) => !upcoming.includes(b) && !pending.includes(b)).sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt));
  // Held classes from courses still under way — shown on Past without moving the enrolment off Upcoming.
  const activeCoursePast = upcoming
    .filter((b) => b.course && heldClasses(b, now).length > 0)
    .map((b) => ({ b, classes: heldClasses(b, now) }))
    .sort((a, c) => +new Date(c.classes[c.classes.length - 1].endAt) - +new Date(a.classes[a.classes.length - 1].endAt));
  const pastCount = pastEnrolments.length + activeCoursePast.reduce((n, x) => n + x.classes.length, 0);
  const completed = pastEnrolments.filter((b) => b.status === "COMPLETED");
  const heldClassCount = activeCoursePast.reduce((n, x) => n + x.classes.length, 0);
  const needsFeedback = pastEnrolments.filter((b) => b.canReview);
  const [tab, setTab] = useUrlTab(TABS, "Upcoming");
  const [asking, setAsking] = useState<SupportPreset | null>(null);
  // Opened from the chat's "Talk to the team": start a support request, then tidy the URL.
  const wantsSupport = params.get("support");
  useEffect(() => {
    if (!wantsSupport) return;
    router.replace("/dashboard/student");
    const t = setTimeout(() => { setAsking({}); document.getElementById("support")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 250);
    return () => clearTimeout(t);
  }, [wantsSupport, router]);
  const tabs = TABS.filter((t) => t !== "Awaiting payment" || pending.length > 0);
  const next = upcoming[0];
  const nextFocus = next ? focusClass(next) : null;
  const show = (t: (typeof TABS)[number]) => { setTab(t); setTimeout(() => document.getElementById("sessions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const stats = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Upcoming" value={loading ? "–" : upcoming.length} tone="sky" onClick={() => show("Upcoming")} />
      <StatTile label="Completed" value={loading ? "–" : completed.length + heldClassCount} tone="mint" delay={60} onClick={() => show("Past")} />
      <StatTile label="Mentors met" value={loading ? "–" : new Set([...completed, ...upcoming.filter((b) => heldClasses(b, now).length > 0)].map((b) => b.mentor.id)).size} tone="peach" delay={120} />
      <StatTile label="Feedback to give" value={loading ? "–" : needsFeedback.length} tone="lemon" delay={180} onClick={() => show("Past")} />
    </div>
  );

  return (
    <>
      <DashboardHero
        eyebrow={<><span>Student &amp; professional dashboard</span><span aria-hidden>·</span><span>{user?.timezone}</span></>}
        title={<>{greeting()}, <Mark>{user?.name.split(" ")[0]}</Mark></>}
        subtitle={next && nextFocus
          ? next.course
            ? `Your next class is ${relative(nextFocus.startAt, now)} — ${next.course.title} with ${next.mentor.name}.`
            : `Your next session is ${relative(nextFocus.startAt, now)}, with ${next.mentor.name}.`
          : "Find a mentor who has been where you're going, and book a 30-minute conversation."}
        actions={<><Button href="/mentors">Book a session</Button><Button variant="secondary" onClick={() => setAsking({})}>Get help</Button></>}
      >
        <div className="mt-10 hidden lg:block">{stats}</div>
      </DashboardHero>

      <Container className="py-10 sm:py-12">
        {user?.isMinor && !user.guardianConsent && <div className="mb-6 max-w-2xl"><Alert tone="info">Your parent or guardian still needs to confirm consent before you can book sessions. Contact support if they haven&rsquo;t received our email.</Alert></div>}
        {error && <div className="mb-6"><Alert>{error}</Alert></div>}
        {user?.emailVerified === false && (
          <div className="mb-6 grid gap-6 rounded-3xl bg-white p-6 ring-1 ring-line sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
            <div><p className="font-display text-2xl text-ink">Confirm your email</p><p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">You&rsquo;ll need this before you can book, so your confirmation and call link reach you.</p></div>
            <VerifyEmail focus={false} />
          </div>
        )}
        {user && !user.phone && <AddMobile />}
        {(promos.data ?? []).map((c) => (
          <div key={c.code} className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-mint/60 p-5 ring-1 ring-line sm:p-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/60">Promo code from {c.mentorName}</p>
              <p className="mt-1 font-display text-2xl text-ink">{c.percentOff}% off your next 1:1 with {c.mentorName.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0]}</p>
              <p className="mt-1 text-sm text-ink-soft"><span className="font-mono tracking-wide text-ink">{c.code}</span> · applied for you at checkout · valid until {new Date(c.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</p>
            </div>
            {c.mentorSlug && <Button href={`/mentors/${c.mentorSlug}`}>Book now</Button>}
          </div>
        ))}

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-8">
            {next && <NextSession b={next} now={now} />}
            <div className="lg:hidden">{stats}</div>

            <div id="sessions" className="flex scroll-mt-24 flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-3xl text-ink">Your sessions</h2>
              <Tabs tabs={tabs} value={tabs.includes(tab) ? tab : "Upcoming"} onChange={setTab} counts={{ Upcoming: upcoming.length, "Awaiting payment": pending.length, Past: pastCount }} />
            </div>

            <div className="space-y-4">
              {loading ? <><Skeleton className="h-28 rounded-3xl" /><Skeleton className="h-28 rounded-3xl" /></> : (
                <>
                  {tab === "Upcoming" && (upcoming.length === 0
                    ? <EmptyState title="No upcoming sessions" description="Book a mentor and your confirmed session will appear here, with a button to join the call." />
                    : upcoming.map((b, i) => <Reveal key={b.id} delay={i * 60}>{b.course ? <CourseUpcomingCard b={b} now={now} /> : <UpcomingCard b={b} onChange={reload} />}</Reveal>))}
                  {tab === "Awaiting payment" && pending.map((b) => <PendingCard key={b.id} b={b} onChange={reload} />)}
                  {tab === "Past" && (pastCount === 0
                    ? <EmptyState title="No past sessions yet" description="Your completed sessions and classes will appear here." />
                    : (
                      <div className="space-y-4">
                        {activeCoursePast.map(({ b, classes }, i) => (
                          <Reveal key={`held-${b.id}`} delay={i * 50}>
                            <CoursePastClasses b={b} classes={classes} />
                          </Reveal>
                        ))}
                        {pastEnrolments.map((b, i) => (
                          <Reveal key={b.id} delay={(activeCoursePast.length + i) * 50}>
                            <PastCard b={b} onChange={reload} onSupport={() => setAsking({ topic: "Reviews", reference: b.reference })} />
                          </Reveal>
                        ))}
                      </div>
                    ))}
                </>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <BalanceCard />
            {needsFeedback.length > 0 && tab !== "Past" && (
              <div className="rounded-3xl bg-mint p-6">
                <p className="font-display text-2xl text-ink">How did it go?</p>
                <p className="mt-2 text-sm text-ink/70">
                  {needsFeedback.length === 1
                    ? needsFeedback[0].course
                      ? `Your course ${needsFeedback[0].course.title} has finished — leave one short review.`
                      : "You have a session waiting for feedback."
                    : `You have ${needsFeedback.length} courses or sessions waiting for feedback.`} It takes a minute and helps us improve.
                </p>
                <Button size="sm" className="mt-4" onClick={() => setTab("Past")}>Leave feedback</Button>
              </div>
            )}
            <div id="support"><MySupport compact newRequest={!!asking} preset={asking ?? undefined} onNewRequestClose={() => setAsking(null)} /></div>
          </aside>
        </div>
      </Container>
    </>
  );
}

/** Live or next class for a course enrolment; otherwise the booking slot. */
function focusClass(b: Booking): { startAt: string; endAt: string; number?: number } {
  if (b.course) {
    const k = b.course.liveClass ?? b.course.nextClass;
    if (k) return k;
    const last = b.course.classes[b.course.classes.length - 1];
    if (last) return last;
  }
  return { startAt: b.startAt, endAt: b.endAt };
}
function nextAt(b: Booking) { return focusClass(b).startAt; }
function isClassHeld(k: CourseClass, now: number) {
  return !!k.completedAt || new Date(k.endAt).getTime() <= now;
}
function heldClasses(b: Booking, now: number) {
  return (b.course?.classes ?? []).filter((k) => isClassHeld(k, now));
}
function remainingClasses(b: Booking, now: number) {
  return (b.course?.classes ?? []).filter((k) => !isClassHeld(k, now));
}

/** Highlighted card for the soonest confirmed session or class. */
function NextSession({ b, now }: { b: Booking; now: number }) {
  const focus = focusClass(b);
  const open = new Date(focus.startAt).getTime() - now <= 10 * 60_000 && now <= new Date(focus.endAt).getTime() + 60 * 60_000;
  const detail = b.course
    ? `${b.course.title} · Class ${focus.number ?? 1} of ${b.course.sessionsCount}`
    : `${b.sessionKind === "GROUP" ? "Group" : "1:1"} · ${b.agenda}`;
  return (
    <div className="animate-rise overflow-hidden rounded-[2rem] bg-ink p-6 text-white sm:p-8">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:flex sm:gap-5">
        <DateTile iso={focus.startAt} dark />
        <div className="hidden h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white/20 sm:block"><MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-full w-full" initialsClass="text-xl" /></div>
        <div className="min-w-0 sm:flex-1">
          <p className="text-sm text-white/60">{b.course ? "Your next class" : "Your next session"} · {relative(focus.startAt, now)}</p>
          <p className="mt-1 font-display text-3xl leading-tight">{b.course ? b.course.title : b.mentor.name}</p>
          <p className="text-sm text-white/70">
            {b.course
              ? <>with {b.mentor.name} · Class {focus.number ?? 1} of {b.course.sessionsCount} · {fmtTime(focus.startAt)}–{fmtTime(focus.endAt)}</>
              : <>{fmtTime(focus.startAt)}–{fmtTime(focus.endAt)} · {b.sessionKind === "GROUP" ? "Group" : "1:1"} · {b.agenda}</>}
          </p>
        </div>
        {b.meetingLink && (
          <SessionButton link={b.meetingLink} startAt={focus.startAt} endAt={focus.endAt} withName={b.mentor.name} detail={detail}
            joinClass="col-span-2 whitespace-nowrap rounded-full bg-mint px-6 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-white"
            waitClass="col-span-2 whitespace-nowrap rounded-full bg-white px-6 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-white/90" />
        )}
      </div>
      {!open && <p className="mt-5 border-t border-white/10 pt-4 text-xs text-white/55">The call room opens 10 minutes before the start. You&rsquo;ll get an email reminder 30 minutes ahead.</p>}
    </div>
  );
}

function Who({ b, when }: { b: Booking; when?: string }) {
  const tile = when ?? (b.course ? (b.course.liveClass ?? b.course.nextClass)?.startAt ?? b.course.endsAt : b.startAt);
  return (
    <div className="flex min-w-0 items-center gap-4">
      <DateTile iso={tile} />
      <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-full sm:block"><MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-full w-full" initialsClass="text-base" /></div>
      <div className="min-w-0">
        {b.course
          ? <Link href={`/courses/${b.course.slug}`} className="font-display text-xl text-ink hover:underline">{b.course.title}</Link>
          : <Link href={`/mentors/${b.mentor.slug}`} className="font-display text-xl text-ink hover:underline">{b.mentor.name}</Link>}
        <p className="text-sm text-ink-soft">
          {b.course
            ? <>with <Link href={`/mentors/${b.mentor.slug}`} className="hover:underline">{b.mentor.name}</Link> · {b.course.sessionsCount} classes</>
            : <>{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.agenda}</>}
        </p>
        <p className="text-xs text-ink-soft">{b.course ? "Course" : b.sessionKind === "GROUP" ? "Group session" : "1:1 session"} · <span className="whitespace-nowrap">{b.reference}</span></p>
      </div>
    </div>
  );
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onDone(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function UpcomingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const { busy, error, run } = useAction(onChange);
  const now = useNow();
  const canCancel = !!b.cancelBy && new Date(b.cancelBy).getTime() > now;
  const detail = `${b.sessionKind === "GROUP" ? "Group" : "1:1"} · ${b.agenda}`;
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line transition-shadow hover:shadow-[0_12px_32px_-20px_rgba(17,17,17,0.35)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} when={b.startAt} />
        <div className="flex flex-wrap items-center gap-2">
          {b.meetingLink && <SessionButton link={b.meetingLink} startAt={b.startAt} endAt={b.endAt} withName={b.mentor.name} detail={detail} joinClass="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-white" waitClass="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white" />}
          {canCancel && <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Cancel</Button>}
          <a href={`/receipt/${b.reference}`} className="px-2 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Receipt</a>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Badge tone="forest">Confirmed</Badge><Badge>{formatMoney(b.priceMinor, b.currency)} paid</Badge>
        {b.cancelBy && (
          <span className="ml-auto text-xs text-ink-soft">
            {canCancel ? <>Cancel until {fmtDayShort(b.cancelBy)}, {fmtTime(b.cancelBy)}</> : <NoticeText text="Less than {notice} to go: no changes or refund" />}
          </span>
        )}
      </div>
      {cancelling && (
        <div className="mt-4 rounded-2xl bg-paper p-4">
          <p className="text-sm text-ink">Cancel this session? The full {formatMoney(b.priceMinor, b.currency)} goes back to your POINT B balance, ready for any future session.</p>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelling(false)}>Keep session</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => api(`/bookings/${b.reference}/cancel`, { body: {} }))}>{busy ? <Spinner /> : "Cancel and refund"}</Button>
          </div>
        </div>
      )}
      <ReportStatus status={b.mentorReport} note={b.mentorReportNote} mentorName={b.mentor.name} />
    </div>
  );
}

/** One course enrolment: remaining classes listed under a clear course header. */
function CourseUpcomingCard({ b, now }: { b: Booking; now: number }) {
  const course = b.course!;
  const remaining = remainingClasses(b, now);
  const held = heldClasses(b, now).length;
  const next = course.liveClass ?? course.nextClass ?? remaining[0] ?? null;
  const [syllabus, setSyllabus] = useState(false);
  return (
    <article className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-line transition-shadow hover:shadow-[0_12px_32px_-20px_rgba(17,17,17,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-br from-mint/40 via-white to-sky/30 px-5 py-5 sm:px-6">
        <Who b={b} when={next?.startAt} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="forest">Confirmed</Badge>
          <Badge tone="brass">{held} of {course.sessionsCount} held</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSyllabus(true)}>Course outline</Button>
          <a href={`/receipt/${b.reference}`} className="px-2 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Receipt</a>
        </div>
      </div>
      <div className="border-t border-line px-5 py-4 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Upcoming classes</p>
        {remaining.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No classes left on this course.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {remaining.map((k) => {
              const isNext = next?.number === k.number;
              return (
                <li key={k.number} className={`flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3 sm:px-4 ${isNext ? "bg-paper ring-1 ring-ink/10" : "bg-paper/50"}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white font-display text-lg text-ink ring-1 ring-line">{k.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">Class {k.number}</span>
                      {isNext && <Badge tone="brass">Next</Badge>}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">{fmtDay(k.startAt)} · {fmtTime(k.startAt)}–{fmtTime(k.endAt)}</span>
                    {k.outline && <span className="mt-0.5 block text-xs text-ink">{k.outline}</span>}
                  </span>
                  {b.meetingLink && (
                    <ClassSessionAction
                      href={b.meetingLink}
                      startAt={k.startAt}
                      endAt={k.endAt}
                      classNumber={k.number}
                      sessionsCount={course.sessionsCount}
                      courseTitle={course.title}
                      mentorName={b.mentor.name}
                      outline={k.outline}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {held > 0 && (
          <p className="mt-3 text-xs text-ink-soft">{held} earlier class{held === 1 ? "" : "es"} are under Past while this course continues.</p>
        )}
      </div>
      {syllabus && <CourseSyllabusModal b={b} onClose={() => setSyllabus(false)} />}
    </article>
  );
}

function CourseSyllabusModal({ b, onClose }: { b: Booking; onClose: () => void }) {
  const course = b.course!;
  const topics = course.topics ?? [];
  return (
    <FinanceModal
      label="Course outline"
      eyebrow="Your course"
      title={<span className="font-display text-2xl leading-tight text-ink">{course.title}</span>}
      onClose={onClose}
      wide
      footer={<Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}
    >
      {course.summary && <p className="text-sm leading-relaxed text-ink-soft">{course.summary}</p>}
      {!!topics.length && (
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">What the course covers</p>
          <ol className="mt-3 space-y-2">
            {topics.map((t, i) => (
              <li key={`${t}-${i}`} className="flex gap-3 rounded-2xl bg-paper px-3.5 py-2.5 text-sm">
                <span className="font-display text-base text-brass-dark">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-ink">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Classes</p>
        <ol className="mt-3 space-y-2">
          {course.classes.map((k) => (
            <li key={k.number} className="rounded-2xl px-4 py-3 ring-1 ring-line">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">Class {k.number}</p>
                <p className="text-xs text-ink-soft">{fmtDay(k.startAt)} · {fmtTime(k.startAt)}–{fmtTime(k.endAt)}</p>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{k.outline || "Outline to be confirmed by your teacher."}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-xs text-ink-soft">Taught by {b.mentor.name}. Feedback opens after the final class.</p>
    </FinanceModal>
  );
}

/** Held classes from a course that is still under way. */
function CoursePastClasses({ b, classes }: { b: Booking; classes: CourseClass[] }) {
  const course = b.course!;
  const [syllabus, setSyllabus] = useState(false);
  return (
    <article className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/60 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Past classes</p>
          <Link href={`/courses/${course.slug}`} className="mt-1 block font-display text-xl text-ink hover:underline">{course.title}</Link>
          <p className="text-sm text-ink-soft">with {b.mentor.name} · course continues</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brass">{classes.length} held</Badge>
          <Button size="sm" variant="secondary" onClick={() => setSyllabus(true)}>Course outline</Button>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {[...classes].reverse().map((k) => (
          <li key={k.number} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint/70 font-display text-lg text-ink">{k.number}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink">Class {k.number} of {course.sessionsCount}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">{fmtDay(k.startAt)} · {fmtTime(k.startAt)}–{fmtTime(k.endAt)}{k.completedAt ? " · marked complete" : ""}</span>
              {k.outline && <span className="mt-0.5 block text-xs text-ink">{k.outline}</span>}
            </span>
            <Badge tone="forest">Held</Badge>
          </li>
        ))}
      </ul>
      {syllabus && <CourseSyllabusModal b={b} onClose={() => setSyllabus(false)} />}
    </article>
  );
}

function PendingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const { busy, error, run } = useAction(onChange);
  const [paying, setPaying] = useState(false);
  const paid = useCallback(() => { setPaying(false); onChange(); }, [onChange]);
  return (
    <div className="rounded-3xl border-l-4 border-amber bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} />
        {b.awaitingVerification ? <Badge tone="brass">Checking your payment</Badge> : (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => setPaying(true)}>Pay {formatMoney(b.priceMinor, b.currency)}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/bookings/${b.reference}/cancel`, { body: {} }))}>Release slot</Button>
          </div>
        )}
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">{b.awaitingVerification
        ? <>We&rsquo;re matching your bank transfer of {formatMoney(b.priceMinor, b.currency)}. Your time is held, and you&rsquo;ll get an email once it&rsquo;s confirmed, usually within a few hours.</>
        : <>Held until {b.holdExpiresAt ? fmtTime(b.holdExpiresAt) : "—"}. The slot is released if payment isn&rsquo;t completed.</>}</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {paying && <CheckoutDialog reference={b.reference} title={`Session with ${b.mentor.name}`} subtitle={`${fmtDay(b.startAt)} · ${fmtTime(b.startAt)}`} onClose={() => setPaying(false)} onPaid={paid} />}
    </div>
  );
}

/** True while a course enrolment still has classes left (or the final class hasn’t ended). */
function courseInProgress(b: Booking, now = Date.now()) {
  if (!b.course || b.status !== "CONFIRMED") return false;
  if (b.canReview || b.review) return false;
  return !!b.course.nextClass || !!b.course.liveClass || new Date(b.course.endsAt).getTime() > now;
}

function PastCard({ b, onChange, onSupport }: { b: Booking; onChange: () => void; onSupport: () => void }) {
  // Open the form straight away when end-of-course (or session) feedback is due.
  const [reviewing, setReviewing] = useState(!!b.canReview);
  const [editing, setEditing] = useState(false);
  const now = useNow();
  const midCourse = courseInProgress(b, now);
  const tone = b.status === "COMPLETED" ? "forest" : b.status === "CANCELLED" || b.status === "NO_SHOW" ? "rust" : "neutral";
  const status = midCourse ? "Under way" : b.status === "CONFIRMED" ? "Finished" : STATUS_LABEL[b.status];
  const waitingForFinal = !!b.course && !b.canReview && !b.review && (b.status === "CONFIRMED" || b.status === "COMPLETED");
  // Rebook only once the enrolment is done — not mid-series between classes.
  const showBookAgain = !midCourse;
  return (
    <div className={`overflow-hidden rounded-3xl bg-white ring-1 sm:p-0 ${b.canReview ? "ring-brass/40 shadow-[0_18px_40px_-32px_rgba(17,17,17,0.35)]" : "ring-line"}`}>
      {b.canReview && !b.review && (
        <div className="border-b border-brass/20 bg-gradient-to-r from-lemon/50 via-white to-mint/40 px-5 py-3 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Feedback due</p>
          <p className="mt-0.5 text-sm text-ink">{b.course ? `How was ${b.course.title}?` : `How was your session with ${b.mentor.name.split(" ")[0]}?`}</p>
        </div>
      )}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Who b={b} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={midCourse ? "brass" : tone}>{status}</Badge>
            {b.canReview && !reviewing && <><Button size="sm" onClick={() => setReviewing(true)}>Leave feedback</Button><Button size="sm" variant="secondary" onClick={onSupport}>Support</Button></>}
            {showBookAgain && <Button href={`/mentors/${b.mentor.slug}`} size="sm" variant="secondary">Book again</Button>}
            {b.canReportMissing && <ReportMissing reference={b.reference} mentorName={b.mentor.name} onDone={onChange} />}
            {(b.status === "COMPLETED" || b.status === "CONFIRMED" || b.status === "NO_SHOW" || b.payment?.status === "REFUNDED") && <a href={`/receipt/${b.reference}`} className="px-2 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Receipt</a>}
          </div>
        </div>
        {b.cancelReason && <p className="mt-3 text-xs text-ink-soft">{b.cancelReason}</p>}
        <ReportStatus status={b.mentorReport} note={b.mentorReportNote} mentorName={b.mentor.name} />
        {waitingForFinal && (
          <p className="mt-4 rounded-2xl bg-paper-dim px-4 py-3 text-sm text-ink-soft ring-1 ring-line/70">
            Feedback opens after the final class{b.course?.endsAt ? ` on ${fmtDay(b.course.endsAt)}` : ""}. You’ll get a form here once it’s done.
          </p>
        )}
        {b.course && b.course.classes.length > 0 && !midCourse && (
          <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
            {b.course.classes.map((k) => (
              <li key={k.number} className="flex justify-between gap-3 text-ink-soft">
                <span>Class {k.number}</span>
                <span>{fmtDayShort(k.startAt)} · {fmtTime(k.startAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {b.review && !editing && <div className="mt-4"><SubmittedFeedback review={b.review} onEdit={() => setEditing(true)} onSupport={onSupport} /></div>}
        {b.review && editing && <div className="mt-4"><FeedbackForm b={b} existing={b.review} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} /></div>}
        {reviewing && b.canReview && <div className="mt-4"><FeedbackForm b={b} onDone={() => { setReviewing(false); onChange(); }} onCancel={() => setReviewing(false)} /></div>}
      </div>
    </div>
  );
}

/** Asks students who signed up before mobile numbers were collected to add one, so alerts can reach them on WhatsApp. */
function AddMobile() {
  const { refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [iso, setIso] = useState<CountryCode>("PK");
  const [whatsapp, setWhatsapp] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!isValidPhone(phone)) { setErr(phone ? "That number doesn't look right. Check the country code and digits." : "Please add your mobile number."); document.getElementById("add-mobile")?.focus(); return; }
    setBusy(true); setErr(null);
    try { await api("/auth/me/contact", { method: "PATCH", body: { phone, whatsappAlerts: whatsapp } }); await refresh(); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  }
  return (
    <div className="mb-6 grid gap-6 rounded-3xl bg-white p-6 ring-1 ring-line sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#25D366]/15 text-[#1fa855]"><WhatsAppIcon className="h-6 w-6" /></span>
        <p className="mt-4 font-display text-2xl text-ink">Add your mobile number</p>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">Get booking confirmations and a reminder before every call on WhatsApp, as well as by email, so you never miss a session.</p>
      </div>
      <div>
        <MobileField id="add-mobile" value={phone} onChange={(v) => { setPhone(v); setErr(null); }} iso={iso} onIso={setIso} whatsapp={whatsapp} onWhatsapp={setWhatsapp} error={err} />
        <Button className="mt-4 w-full" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Save number"}</Button>
      </div>
    </div>
  );
}

interface WalletEntry { id: string; currency: Currency; amountMinor: number; kind: string; reference: string | null; note: string | null; createdAt: string }
const WALLET_LABEL: Record<string, string> = { CANCELLATION: "Session cancelled", LATE_PAYMENT: "Payment arrived late", SPEND: "Used for a session", RETURN: "Booking not completed", ADJUSTMENT: "From the POINT B team" };

/** The student's POINT B balance: credit from cancelled sessions, used automatically at checkout. */
function BalanceCard() {
  const w = useApi<{ balances: Record<string, number>; entries: WalletEntry[] }>("/wallet");
  const [open, setOpen] = useState(false);
  if (!w.data || (!w.data.entries.length && !Object.values(w.data.balances).some(Boolean))) return null;
  const held = (Object.keys(w.data.balances) as Currency[]).filter((c) => w.data!.balances[c] > 0);
  return (
    <div className="overflow-hidden rounded-3xl bg-ink text-white">
      <div className="p-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/60">POINT B balance</p>
        {held.length ? held.map((c) => <p key={c} className="mt-1 font-display text-4xl leading-tight tabular-nums">{formatMoney(w.data!.balances[c], c)}</p>) : <p className="mt-1 font-display text-4xl leading-tight">{formatMoney(0, "PKR")}</p>}
        <p className="mt-2 text-xs leading-relaxed text-white/60">{held.length ? "Switch on “Use my POINT B balance” at checkout. It pays all or part of any session in the same currency." : "Credit from cancelled sessions appears here."}</p>
        <div className="mt-4 flex gap-2">
          {held.length > 0 && <Link href="/mentors" className="rounded-full bg-white px-4 py-2 text-xs font-medium text-ink">Book a session</Link>}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-full px-3 py-2 text-xs font-medium text-white/80 ring-1 ring-white/20 hover:text-white">{open ? "Hide history" : "History"}</button>
        </div>
      </div>
      {open && (
        <ul className="divide-y divide-white/10 border-t border-white/10 bg-white/5 px-5 text-xs">
          {w.data.entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0"><span className="block text-white">{WALLET_LABEL[e.kind] ?? e.kind}</span><span className="block truncate text-white/50">{new Date(e.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{e.reference ? ` · ${e.reference}` : ""}{e.kind === "ADJUSTMENT" && e.note ? ` · ${e.note}` : ""}</span></span>
              <span className={`whitespace-nowrap tabular-nums ${e.amountMinor > 0 ? "text-mint" : "text-white/80"}`}>{e.amountMinor > 0 ? "+" : "−"}{formatMoney(Math.abs(e.amountMinor), e.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
