"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Skeleton, Spinner } from "@/components/ui";
import { FinanceModal, SectionTitle, Sum } from "@/components/finance-modal";
import { useToast } from "@/components/toast";
import { api, apiObjectUrl, errMsg } from "@/lib/api";
import { LEVEL_LABEL, STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtTime, formatMoney } from "@/lib/format";
import { useApi, useNow } from "@/lib/use-api";
import type { Currency, Level } from "@/lib/types";

interface DetailPayment {
  id: string; provider: string; providerRef: string; amountMinor: number; status: string; processedAt: string | null; createdAt: string;
  bankTxnRef: string | null; bankSenderName: string | null; bankSubmittedAt: string | null; reviewedAt: string | null; reviewNote: string | null; reviewedByName: string | null; hasProof: boolean;
}
interface BookingDetailData {
  id: string; reference: string; status: string; sessionKind: "ONE_TO_ONE" | "GROUP"; agenda: string; currentSituation: string; usefulOutcome: string; materialsToReview: string;
  currency: Currency; walletAppliedMinor: number | null; repeatStudent: boolean | null; awaitingVerification: boolean | null; hostStartedAt: string | null; mentorReportStatus: string | null; mentorReportedAt: string | null; mentorReportNote: string | null; rescheduleCount: number; rescheduledAt: string | null;
  cancelledAt: string | null; cancelReason: string | null; completedAt: string | null; createdAt: string;
  slot: { startAt: string; endAt: string; capacity: number };
  student: { id: string; name: string; email: string; phone: string | null };
  mentor: { slug: string; level: Level; user: { name: string; email: string } };
  promo: { code: string; percentOff: number } | null;
  money: { listPriceMinor: number; discountMinor: number; paidMinor: number; commissionPercent: number | null; feeMinor: number | null; payoutMinor: number | null; feeIsEstimate: boolean };
  payments: DetailPayment[];
  payout: { createdAt: string; reference: string | null; note: string | null; amountMinor: number; sessions: number } | null;
  review: { rating: number; comment: string; status: string | null; createdAt: string } | null;
  history: { action: string; detail: string; at: string; by: string }[];
}

const TONE: Record<string, "neutral" | "brass" | "forest" | "rust"> = { PENDING_PAYMENT: "brass", CONFIRMED: "forest", COMPLETED: "forest", CANCELLED: "rust", NO_SHOW: "rust" };
const METHOD: Record<string, string> = { stripe: "Card", bank: "Bank app / QR", mock: "Demo checkout", wallet: "POINT B balance" };
const when = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)}`;
const short = (iso: string) => `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${fmtTime(iso)}`;

/** Why a booking ended, in plain words: the admin's rejection note when a bank payment was refused. */
export function cancelExplanation(b: { status: string; cancelReason: string | null; payments: { reviewNote?: string | null }[] }) {
  if (b.status !== "CANCELLED") return null;
  const note = b.payments.find((p) => p.reviewNote)?.reviewNote;
  if (note) return `Payment rejected: ${note}`;
  return b.cancelReason ?? null;
}

export function BookingDetailModal({ reference, onClose, onChanged }: { reference: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const now = useNow();
  const d = useApi<BookingDetailData>(`/admin/bookings/${reference}`);
  const [action, setAction] = useState<null | "cancel" | "complete" | "no-show" | "approve-report" | "decline-report">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const b = d.data;
  const money = (v: number | null) => (v == null ? "Not configured" : formatMoney(v, b?.currency ?? "PKR"));

  async function run() {
    if (!action || !b) return;
    setBusy(true);
    try {
      if (action === "approve-report" || action === "decline-report") {
        await api(`/bookings/${b.reference}/mentor-report`, { body: { approve: action === "approve-report", note: reason.trim() || undefined } });
        toast(action === "approve-report" ? "Approved. The price was added to the student\u2019s balance and they\u2019ve been emailed." : "Declined. No refund was issued and the student has been emailed.");
        setAction(null); setReason(""); await d.reload(); onChanged();
        return;
      }
      if (action === "cancel") await api(`/bookings/${b.reference}/cancel`, { body: { reason: reason.trim() || "Cancelled by POINT B" } });
      else await api(`/bookings/${b.reference}/${action}`, { method: "POST" });
      toast(action === "cancel" ? (b.status === "CONFIRMED" ? "Booking cancelled and the price added to the student\u2019s balance. They\u2019ve been emailed." : "Booking cancelled and the slot released.") : action === "complete" ? "Marked as completed. The student has been asked for feedback." : "Marked as a no-show.");
      setAction(null); setReason("");
      await d.reload(); onChanged();
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }

  const started = !!b && (new Date(b.slot.startAt).getTime() <= now || !!b.hostStartedAt);
  const footer = !b ? undefined : action ? (
    <div className="space-y-3">
      {action === "cancel" && (
        <>
          <p className="text-sm text-ink">{b.status === "CONFIRMED"
            ? <>Cancel this session and add <span className="font-medium">{money(b.money.paidMinor)}</span> to {b.student.name.split(" ")[0]}&rsquo;s POINT B balance. Nothing is refunded to their card or bank; the balance pays for their next session.</>
            : "Cancel this booking and release the slot. Nothing has been paid, and any balance it used goes back to the student."}</p>
          {b.payout && <p className="rounded-xl bg-lemon/60 px-3 py-2 text-xs text-ink">The mentor was already paid {money(b.money.payoutMinor)} for this session on {short(b.payout.createdAt)}. Cancelling won&rsquo;t take that back, so plan to recover it from their next payout.</p>}
          <textarea className="input min-h-16" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the student), e.g. Mentor unavailable due to illness" />
        </>
      )}
      {(action === "approve-report" || action === "decline-report") && (
        <>
          <p className="text-sm text-ink">{action === "approve-report" ? <>Confirm that the mentor didn&rsquo;t join, cancel this session and add <span className="font-medium">{money(b.money.paidMinor)}</span> to {b.student.name.split(" ")[0]}&rsquo;s POINT B balance?</> : <>Decline this report? No refund is issued and the session stays as it is.</>}</p>
          {action === "approve-report" && b.payout && <p className="rounded-xl bg-lemon/60 px-3 py-2 text-xs text-ink">The mentor was already paid {money(b.money.payoutMinor)} for this session on {short(b.payout.createdAt)}. Approving won&rsquo;t take that back, so plan to recover it from their next payout.</p>}
          <textarea className="input min-h-16" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Note for the student (optional)" />
        </>
      )}
      {action === "complete" && <p className="text-sm text-ink">Mark this session as completed? The student will be asked for feedback.</p>}
      {action === "no-show" && <p className="text-sm text-ink">Mark the student as a no-show? No refund is issued.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => setAction(null)} className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line hover:ring-ink/40">Back</button>
        <button type="button" disabled={busy} onClick={run} className={`inline-flex min-w-36 items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${action === "complete" || action === "approve-report" ? "bg-ink" : "bg-rust"}`}>
          {busy ? <Spinner /> : action === "approve-report" ? "Approve and refund" : action === "decline-report" ? "Decline report" : action === "cancel" ? (b.status === "CONFIRMED" ? "Cancel and credit balance" : "Cancel booking") : action === "complete" ? "Mark completed" : "Mark no-show"}
        </button>
      </div>
    </div>
  ) : b.mentorReportStatus === "PENDING" && (b.status === "CONFIRMED" || b.status === "COMPLETED") ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={() => setAction("decline-report")} className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line hover:ring-ink/40">Decline report</button>
      <button type="button" onClick={() => setAction("approve-report")} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">Approve refund</button>
    </div>
  ) : (b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED") ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {b.status === "CONFIRMED" && started && <>
        <button type="button" onClick={() => setAction("no-show")} className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line hover:ring-ink/40">Mark no-show</button>
        <button type="button" onClick={() => setAction("complete")} className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line hover:ring-ink/40">Mark completed</button>
      </>}
      <button type="button" onClick={() => setAction("cancel")} className="rounded-full px-4 py-2 text-sm font-medium text-rust ring-1 ring-rust/30 hover:bg-rust-pale">{b.status === "CONFIRMED" ? "Cancel and credit balance" : "Cancel booking"}</button>
    </div>
  ) : undefined;

  const explanation = b ? cancelExplanation(b) : null;
  return (
    <FinanceModal label={`Booking ${reference}`} eyebrow={`Booking · ${reference}`} onClose={onClose} footer={footer}
      title={b ? <span className="flex flex-wrap items-center gap-2"><Badge tone={TONE[b.status]}>{b.awaitingVerification ? "Checking payment" : STATUS_LABEL[b.status]}</Badge><span>{b.sessionKind === "GROUP" ? "Group session" : "1:1 session"} · {short(b.slot.startAt)}</span></span> : "Loading"}
      total={b ? money(b.money.paidMinor) : "…"}
      totalNote={b ? `${b.student.name} with ${b.mentor.user.name}` : undefined}>
      {d.loading && !b ? <Skeleton className="h-64 rounded-2xl" /> : d.error || !b ? <Alert>{d.error}</Alert> : (
        <>
          {b.mentorReportStatus && (
            <div className={`rounded-2xl px-4 py-3 text-sm ${b.mentorReportStatus === "PENDING" ? "bg-lemon/60" : "bg-paper"}`}>
              <p className="font-medium text-ink">{b.mentorReportStatus === "PENDING" ? "Needs your review: student says the mentor didn\u2019t join" : b.mentorReportStatus === "APPROVED" ? "Mentor report approved and refunded" : "Mentor report declined"}</p>
              <p className="mt-0.5 text-ink-soft">{b.mentorReportedAt ? `Reported ${short(b.mentorReportedAt)}. ` : ""}Our records show the mentor {b.hostStartedAt ? `opened the call room ${short(b.hostStartedAt)}` : "never opened the call room"}.{b.mentorReportNote ? ` Note: ${b.mentorReportNote}` : ""}</p>
            </div>
          )}
          {explanation && (
            <div className="rounded-2xl bg-rust-pale px-4 py-3 text-sm text-rust">
              <p className="font-medium">{explanation.startsWith("Payment rejected") ? "Payment rejected" : "Cancelled"}{b.cancelledAt ? ` · ${short(b.cancelledAt)}` : ""}</p>
              <p className="mt-0.5 text-ink">{explanation.replace(/^Payment rejected: /, "")}</p>
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <Person label="Student" name={b.student.name} lines={[b.student.email, b.student.phone ?? "No phone"]} />
            <Person label="Mentor" name={b.mentor.user.name} lines={[b.mentor.user.email, LEVEL_LABEL[b.mentor.level]]} href={`/mentors/${b.mentor.slug}`} />
          </section>

          <section>
            <SectionTitle>Session</SectionTitle>
            <Rows rows={[
              ["When", `${when(b.slot.startAt)} – ${fmtTime(b.slot.endAt)}`],
              ["Type", b.sessionKind === "GROUP" ? `Group (up to ${b.slot.capacity})` : "1:1, 30 minutes"],
              ["Focus", b.agenda],
              ["Rescheduled", b.rescheduleCount ? `${b.rescheduleCount}×${b.rescheduledAt ? `, last on ${short(b.rescheduledAt)}` : ""}` : "No"],
              ["Call room", b.hostStartedAt ? `Mentor opened it ${short(b.hostStartedAt)}` : "Not opened yet"],
              ["Returning student", b.repeatStudent ? "Yes" : "No"],
            ]} />
          </section>

          <section>
            <SectionTitle>Student&rsquo;s preparation notes</SectionTitle>
            <div className="space-y-2 text-sm">
              <Note label="Where they are now" text={b.currentSituation} />
              <Note label="What would help" text={b.usefulOutcome} />
              {b.materialsToReview && <Note label="To review" text={b.materialsToReview} />}
            </div>
          </section>

          <section>
            <SectionTitle>Money</SectionTitle>
            <Sum lines={[
              ["Price before discounts", money(b.money.listPriceMinor)],
              [b.promo ? `Promo ${b.promo.code} (${b.promo.percentOff}% off)` : "Promo discount", `− ${money(b.money.discountMinor)}`],
              ["Student paid", money(b.money.paidMinor), true],
              [`Company revenue${b.money.commissionPercent != null ? ` (${b.money.commissionPercent}%${b.repeatStudent ? ", returning student" : ""})` : ""}`, b.money.feeMinor == null ? "Not configured" : `− ${money(b.money.feeMinor)}`],
              ["Mentor earns", money(b.money.payoutMinor), true],
            ]} />
            <p className="mt-2 text-xs text-ink-soft">
              {b.payout ? <>Paid to the mentor on {short(b.payout.createdAt)}{b.payout.reference ? `, ref ${b.payout.reference}` : ""}{b.payout.sessions > 1 ? ` (part of a ${money(b.payout.amountMinor)} payout for ${b.payout.sessions} sessions)` : ""}.</>
                : b.status === "CONFIRMED" || b.status === "COMPLETED" ? "Not paid to the mentor yet." : "No mentor payout for this booking."}
              {b.walletAppliedMinor ? ` ${money(b.walletAppliedMinor)} of the price was paid from the student's POINT B balance.` : ""}
              {b.money.feeIsEstimate && b.money.feeMinor != null ? " Commission uses today's tier rate, as this booking was made before rates were saved on bookings." : ""}
            </p>
            {(b.status === "CONFIRMED" || b.status === "COMPLETED" || b.status === "NO_SHOW" || b.payments.some((p) => p.status === "REFUNDED")) && <a href={`/receipt/${b.reference}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-ink underline-offset-4 hover:underline">Student&rsquo;s receipt ↗</a>}
          </section>

          <section>
            <SectionTitle>Payment</SectionTitle>
            {!b.payments.length ? <p className="text-sm text-ink-soft">No payment recorded.</p> : (
              <div className="space-y-3">{b.payments.map((p) => <PaymentCard key={p.id} p={p} currency={b.currency} />)}</div>
            )}
          </section>

          {b.review && (
            <section>
              <SectionTitle>Student&rsquo;s review</SectionTitle>
              <div className="rounded-2xl bg-paper px-4 py-3 text-sm">
                <p className="text-ink"><span className="text-brass">{"★".repeat(b.review.rating)}</span><span className="text-line">{"★".repeat(5 - b.review.rating)}</span> <span className="text-xs text-ink-soft">· {b.review.status === "HIDDEN" ? "Hidden by the mentor" : b.review.status === "PENDING" ? "Waiting for the mentor" : "Public"}</span></p>
                <p className="mt-1 text-ink-soft">{b.review.comment}</p>
              </div>
            </section>
          )}

          <section>
            <SectionTitle>History</SectionTitle>
            <Timeline b={b} />
          </section>
        </>
      )}
    </FinanceModal>
  );
}

function Person({ label, name, lines, href }: { label: string; name: string; lines: string[]; href?: string }) {
  return (
    <div className="rounded-2xl bg-paper px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{href ? <a href={href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{name}</a> : name}</p>
      {lines.map((l) => <p key={l} className="truncate text-xs text-ink-soft">{l}</p>)}
    </div>
  );
}

const Rows = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="divide-y divide-line/70 text-sm">
    {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-ink-soft">{k}</dt><dd className="text-right text-ink">{v}</dd></div>)}
  </dl>
);

const Note = ({ label, text }: { label: string; text: string }) => (
  <div className="rounded-2xl bg-paper px-4 py-3"><p className="text-xs text-ink-soft">{label}</p><p className="mt-0.5 whitespace-pre-line text-ink">{text}</p></div>
);

function PaymentCard({ p, currency }: { p: DetailPayment; currency: Currency }) {
  const [img, setImg] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!p.hasProof) return;
    let url: string | null = null, alive = true;
    apiObjectUrl(`/payments/admin/bank-transfers/${p.id}/proof`).then((u) => { url = u; if (alive) setImg(u); else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [p.id, p.hasProof]);
  const bank = !!p.bankSubmittedAt;
  const tone = p.status === "SUCCEEDED" ? "bg-mint text-forest" : p.status === "FAILED" ? "bg-rust-pale text-rust" : p.status === "REFUNDED" ? "bg-lilac text-ink" : "bg-lemon text-ink";
  return (
    <div className="rounded-2xl ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-sm font-medium text-ink">{bank ? "Bank app / QR" : METHOD[p.provider] ?? p.provider} · {formatMoney(p.amountMinor, currency)}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{p.status === "FAILED" && bank ? "Rejected" : p.status === "REFUNDED" ? "Credited to balance" : p.status.charAt(0) + p.status.slice(1).toLowerCase()}</span>
      </div>
      <div className={`grid gap-4 p-4 ${img ? "sm:grid-cols-[5.5rem_minmax(0,1fr)]" : ""}`}>
        {img && (
          <button type="button" onClick={() => setBig(!big)} className={`overflow-hidden rounded-xl ring-1 ring-line ${big ? "sm:col-span-2" : "h-28 w-[5.5rem]"}`} aria-label={big ? "Shrink receipt" : "Enlarge receipt"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Payment receipt" className={big ? "w-full" : "h-full w-full object-cover object-top"} />
          </button>
        )}
        <Rows rows={[
          ...(bank ? [
            ["Transaction ID", p.bankTxnRef ? <span className="font-mono">{p.bankTxnRef}</span> : "Not given"],
            ["Sent from", p.bankSenderName ?? "Not given"],
            ["Receipt sent", short(p.bankSubmittedAt!)],
            ["Checked by", p.reviewedAt ? `${p.reviewedByName ?? "Admin"}, ${short(p.reviewedAt)}` : "Waiting to be checked"],
          ] as [string, ReactNode][] : [
            ["Reference", <span key="r" className="font-mono text-xs">{p.providerRef}</span>],
          ] as [string, ReactNode][]),
          ...(p.processedAt ? [["Settled", short(p.processedAt)] as [string, ReactNode]] : []),
          ...(p.reviewNote ? [["Rejection reason", <span key="n" className="text-rust">{p.reviewNote}</span>] as [string, ReactNode]] : []),
        ]} />
      </div>
    </div>
  );
}

function Timeline({ b }: { b: BookingDetailData }) {
  const events: [string, string, string?][] = [["Booked, time held", b.createdAt]];
  for (const p of b.payments) {
    if (p.bankSubmittedAt) events.push(["Bank receipt submitted", p.bankSubmittedAt]);
    if (p.reviewedAt) events.push([p.status === "FAILED" ? "Bank payment rejected" : "Bank payment approved", p.reviewedAt, p.reviewedByName ?? undefined]);
    else if (p.processedAt && p.status === "SUCCEEDED") events.push(["Paid", p.processedAt]);
  }
  if (b.rescheduledAt) events.push(["Rescheduled", b.rescheduledAt]);
  if (b.hostStartedAt) events.push(["Mentor opened the call", b.hostStartedAt]);
  if (b.completedAt) events.push([b.status === "NO_SHOW" ? "Marked no-show" : "Completed", b.completedAt]);
  if (b.cancelledAt) events.push([`Cancelled${b.cancelReason ? `: ${b.cancelReason}` : ""}`, b.cancelledAt]);
  if (b.payout) events.push(["Mentor paid", b.payout.createdAt]);
  for (const h of b.history) if (/CANCEL|REFUND/.test(h.action)) events.push([h.action.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), h.at, h.by]);
  events.sort((x, y) => new Date(x[1]).getTime() - new Date(y[1]).getTime());
  return (
    <ol className="relative space-y-3 border-l border-line pl-5">
      {events.map(([label, at, by], i) => (
        <li key={i} className="relative text-sm">
          <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-ink ring-4 ring-white" />
          <p className="text-ink">{label}</p>
          <p className="text-xs text-ink-soft">{short(at)}{by ? ` · ${by}` : ""}</p>
        </li>
      ))}
    </ol>
  );
}
