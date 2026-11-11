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
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/constants";
import { FeedbackForm, SubmittedFeedback } from "@/components/feedback";
import { MobileField, WhatsAppIcon } from "@/components/mobile-field";
import { isValidPhone, type CountryCode } from "@/components/phone-input";
import { fmtDay, fmtDayShort, fmtTime, formatMoney } from "@/lib/format";
import { useUrlTab } from "@/lib/use-url-tab";
import { useApi, useNow } from "@/lib/use-api";
import type { Booking, Currency } from "@/lib/types";
import { NoticeText } from "@/lib/policy";
import { MySupport, type SupportPreset } from "@/components/my-support";
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
  const upcoming = (data ?? []).filter((b) => b.status === "CONFIRMED" && new Date(b.endAt).getTime() > now).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const pending = (data ?? []).filter((b) => b.status === "PENDING_PAYMENT");
  const past = (data ?? []).filter((b) => !upcoming.includes(b) && !pending.includes(b)).sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt));
  const completed = past.filter((b) => b.status === "COMPLETED");
  const needsFeedback = past.filter((b) => b.canReview);
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
  const show = (t: (typeof TABS)[number]) => { setTab(t); setTimeout(() => document.getElementById("sessions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const stats = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Upcoming" value={loading ? "–" : upcoming.length} tone="sky" onClick={() => show("Upcoming")} />
      <StatTile label="Completed" value={loading ? "–" : completed.length} tone="mint" delay={60} onClick={() => show("Past")} />
      <StatTile label="Mentors met" value={loading ? "–" : new Set(completed.map((b) => b.mentor.id)).size} tone="peach" delay={120} />
      <StatTile label="Feedback to give" value={loading ? "–" : needsFeedback.length} tone="lemon" delay={180} onClick={() => show("Past")} />
    </div>
  );

  return (
    <>
      <DashboardHero
        eyebrow={<><span>Student &amp; professional dashboard</span><span aria-hidden>·</span><span>{user?.timezone}</span></>}
        title={<>{greeting()}, <Mark>{user?.name.split(" ")[0]}</Mark></>}
        subtitle={next ? `Your next session is ${relative(next.startAt, now)}, with ${next.mentor.name}.` : "Find a mentor who has been where you're going, and book a 30-minute conversation."}
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
              <Tabs tabs={tabs} value={tabs.includes(tab) ? tab : "Upcoming"} onChange={setTab} counts={{ Upcoming: upcoming.length, "Awaiting payment": pending.length, Past: past.length }} />
            </div>

            <div className="space-y-3">
              {loading ? <><Skeleton className="h-28 rounded-3xl" /><Skeleton className="h-28 rounded-3xl" /></> : (
                <>
                  {tab === "Upcoming" && (upcoming.length === 0
                    ? <EmptyState title="No upcoming sessions" description="Book a mentor and your confirmed session will appear here, with a button to join the call." />
                    : upcoming.map((b, i) => <Reveal key={b.id} delay={i * 60}><UpcomingCard b={b} onChange={reload} /></Reveal>))}
                  {tab === "Awaiting payment" && pending.map((b) => <PendingCard key={b.id} b={b} onChange={reload} />)}
                  {tab === "Past" && (past.length === 0
                    ? <EmptyState title="No past sessions yet" description="Your completed sessions will appear here." />
                    : past.map((b, i) => <Reveal key={b.id} delay={i * 50}><PastCard b={b} onChange={reload} onSupport={() => setAsking({ topic: "Reviews", reference: b.reference })} /></Reveal>))}
                </>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <BalanceCard />
            {needsFeedback.length > 0 && tab !== "Past" && (
              <div className="rounded-3xl bg-mint p-6">
                <p className="font-display text-2xl text-ink">How did it go?</p>
                <p className="mt-2 text-sm text-ink/70">You have {needsFeedback.length} session{needsFeedback.length > 1 ? "s" : ""} waiting for feedback. It takes a minute and helps other students and professionals choose.</p>
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

/** Highlighted card for the soonest confirmed session. */
function NextSession({ b, now }: { b: Booking; now: number }) {
  const open = new Date(b.startAt).getTime() - now <= 10 * 60_000;
  return (
    <div className="animate-rise overflow-hidden rounded-[2rem] bg-ink p-6 text-white sm:p-8">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:flex sm:gap-5">
        <DateTile iso={b.startAt} dark />
        <div className="hidden h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white/20 sm:block"><MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-full w-full" initialsClass="text-xl" /></div>
        <div className="min-w-0 sm:flex-1">
          <p className="text-sm text-white/60">Your next session · {relative(b.startAt, now)}</p>
          <p className="mt-1 font-display text-3xl leading-tight">{b.mentor.name}</p>
          <p className="text-sm text-white/70">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.sessionKind === "GROUP" ? "Group" : "1:1"} · {b.agenda}</p>
        </div>
        {b.meetingLink && (
          <SessionButton link={b.meetingLink} startAt={b.startAt} endAt={b.endAt} withName={b.mentor.name} detail={`${b.sessionKind === "GROUP" ? "Group" : "1:1"} · ${b.agenda}`}
            joinClass="col-span-2 whitespace-nowrap rounded-full bg-mint px-6 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-white"
            waitClass="col-span-2 whitespace-nowrap rounded-full bg-white px-6 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-white/90" />
        )}
      </div>
      {!open && <p className="mt-5 border-t border-white/10 pt-4 text-xs text-white/55">The call room opens 10 minutes before the start. You&rsquo;ll get an email reminder 30 minutes ahead.</p>}
    </div>
  );
}

function Who({ b }: { b: Booking }) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <DateTile iso={b.startAt} />
      <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-full sm:block"><MentorPhoto name={b.mentor.name} photoUrl={b.mentor.photoUrl} className="h-full w-full" initialsClass="text-base" /></div>
      <div className="min-w-0">
        <Link href={`/mentors/${b.mentor.slug}`} className="font-display text-xl text-ink hover:underline">{b.mentor.name}</Link>
        <p className="text-sm text-ink-soft">{fmtTime(b.startAt)}–{fmtTime(b.endAt)} · {b.agenda}</p>
        <p className="text-xs text-ink-soft">{b.sessionKind === "GROUP" ? "Group session" : "1:1 session"} · <span className="whitespace-nowrap">{b.reference}</span></p>
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
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { busy, error, run } = useAction(onChange);
  const now = useNow();
  const canMove = !!b.rescheduleBy && new Date(b.rescheduleBy).getTime() > now;
  const moved = useCallback(() => { setMoving(false); onChange(); }, [onChange]);
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line transition-shadow hover:shadow-[0_12px_32px_-20px_rgba(17,17,17,0.35)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} />
        <div className="flex flex-wrap items-center gap-2">
          {b.meetingLink && <SessionButton link={b.meetingLink} startAt={b.startAt} endAt={b.endAt} withName={b.mentor.name} detail={`${b.sessionKind === "GROUP" ? "Group" : "1:1"} · ${b.agenda}`} joinClass="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-white" waitClass="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white" />}
          {canMove && <Button size="sm" variant="secondary" onClick={() => setMoving(true)}>Reschedule</Button>}
          {canMove && <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Cancel</Button>}
          <a href={`/receipt/${b.reference}`} className="px-2 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Receipt</a>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Badge tone="forest">Confirmed</Badge><Badge>{formatMoney(b.priceMinor, b.currency)} paid</Badge>{!!b.rescheduleCount && <Badge tone="brass">Rescheduled</Badge>}
        {b.rescheduleBy && (
          <span className="ml-auto text-xs text-ink-soft">
            {canMove ? <>Cancel or move until {fmtDayShort(b.rescheduleBy)}, {fmtTime(b.rescheduleBy)}</> : <NoticeText text="Less than {notice} to go: no changes or refund" />}
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
      {moving && <RescheduleDialog b={b} onClose={() => setMoving(false)} onDone={moved} />}
    </div>
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

function PastCard({ b, onChange, onSupport }: { b: Booking; onChange: () => void; onSupport: () => void }) {
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const tone = b.status === "COMPLETED" ? "forest" : b.status === "CANCELLED" || b.status === "NO_SHOW" ? "rust" : "neutral";
  const status = b.status === "CONFIRMED" ? "Finished" : STATUS_LABEL[b.status];
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Who b={b} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{status}</Badge>
          {b.canReview && !reviewing && <><Button size="sm" onClick={() => setReviewing(true)}>Leave feedback</Button><Button size="sm" variant="secondary" onClick={onSupport}>Support</Button></>}
          <Button href={`/mentors/${b.mentor.slug}`} size="sm" variant="secondary">Book again</Button>
          {b.canReportMissing && <ReportMissing reference={b.reference} mentorName={b.mentor.name} onDone={onChange} />}
          {(b.status === "COMPLETED" || b.status === "CONFIRMED" || b.status === "NO_SHOW" || b.payment?.status === "REFUNDED") && <a href={`/receipt/${b.reference}`} className="px-2 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Receipt</a>}
        </div>
      </div>
      {b.cancelReason && <p className="mt-3 text-xs text-ink-soft">{b.cancelReason}</p>}
      <ReportStatus status={b.mentorReport} note={b.mentorReportNote} mentorName={b.mentor.name} />
      {b.review && !editing && <div className="mt-4"><SubmittedFeedback review={b.review} onEdit={() => setEditing(true)} onSupport={onSupport} /></div>}
      {b.review && editing && <div className="mt-4"><FeedbackForm b={b} existing={b.review} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} /></div>}
      {reviewing && <div className="mt-4"><FeedbackForm b={b} onDone={() => { setReviewing(false); onChange(); }} onCancel={() => setReviewing(false)} /></div>}
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
