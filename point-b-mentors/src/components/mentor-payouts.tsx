"use client";

import { useMemo, useState } from "react";
import { Alert, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Empty, FinanceModal, SectionTitle, Sum, plural } from "@/components/finance-modal";
import { api, errMsg } from "@/lib/api";
import { LEVEL_LABEL } from "@/lib/constants";
import { formatMoney, initials, currencyLabel } from "@/lib/format";
import { useApi, useNow } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { PayoutDetailsView, type PayoutDetails } from "@/components/admin-mentor-detail";
import type { Currency, Level } from "@/lib/types";

export interface MentorDue { id: string; name: string; level: Level; sessions: number; grossMinor: number; payoutMinor: number | null; paidOutMinor: number | null; dueMinor: number | null; unpaidSessions: number }
interface PayoutInfo { id: string; createdAt: string; reference: string | null; note: string | null; sessions: number; amountMinor: number }
interface MentorSession {
  id: string; reference: string; status: "CONFIRMED" | "COMPLETED"; kind: "ONE_TO_ONE" | "GROUP"; returning: boolean;
  startAt: string; endAt: string; studentName: string; priceMinor: number; percent: number | null; feeMinor: number | null; payoutMinor: number | null; payout: PayoutInfo | null;
}
interface MentorLedger { mentor: { id: string; name: string; email: string; level: Level; payoutDetails: PayoutDetails | null }; currency: Currency; configured: boolean; earnedMinor: number; paidMinor: number; dueMinor: number; unpaidCount: number; sessions: MentorSession[] }

const NOT_SET = "Not configured";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

function Avatar({ name, size = "h-10 w-10 text-xs" }: { name: string; size?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-ink ${size}`} style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>;
}

/** Mentor payouts for the period: who is owed what, then each mentor's sessions, where they can be marked as paid. */
export function MentorPayoutsModal({ currency, period, query, mentors, grossMinor, revenueMinor, payoutMinor, paidMinor, dueMinor, onChanged, onClose }: {
  currency: Currency; period: string; query: string; mentors: MentorDue[];
  grossMinor: number; revenueMinor: number | null; payoutMinor: number | null; paidMinor: number | null; dueMinor: number | null;
  onChanged: () => void; onClose: () => void;
}) {
  const [picked, setPickedMentor] = useState<MentorDue | null>(null);
  const money = (v: number | null) => (v == null ? NOT_SET : formatMoney(v, currency));
  const eyebrow = `${currencyLabel(currency)} · ${period}`;

  if (picked) return <MentorLedgerView mentor={picked} currency={currency} eyebrow={eyebrow} query={query} onBack={() => setPickedMentor(null)} onChanged={onChanged} onClose={onClose} />;

  const sorted = [...mentors].sort((a, b) => (b.dueMinor ?? 0) - (a.dueMinor ?? 0) || b.grossMinor - a.grossMinor);
  return (
    <FinanceModal label="Mentor payouts due" eyebrow={eyebrow} title="Mentor payouts due" total={money(dueMinor)} onClose={onClose}
      totalNote={paidMinor ? `${money(paidMinor)} already paid` : mentors.length ? `Across ${plural(mentors.length, "mentor")}` : undefined}>
      {!mentors.length ? <Empty>No payouts for this period.</Empty> : (
        <>
          <section>
            <SectionTitle>How it adds up</SectionTitle>
            <Sum lines={[
              ["Gross booking value", money(grossMinor)],
              ["Company revenue", revenueMinor == null ? NOT_SET : `− ${money(revenueMinor)}`],
              ["Mentor earnings", money(payoutMinor), true],
              ["Already paid", paidMinor == null ? NOT_SET : `− ${money(paidMinor)}`],
              ["Still to pay", money(dueMinor), true],
            ]} />
          </section>
          <section>
            <SectionTitle>By mentor</SectionTitle>
            <ul className="-mx-3">
              {sorted.map((m) => {
                const settled = m.unpaidSessions === 0;
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setPickedMentor(m)} className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-paper">
                      <Avatar name={m.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                        <span className="block truncate text-xs text-ink-soft">{LEVEL_LABEL[m.level]} · {plural(m.sessions, "session")}{settled ? "" : ` · ${m.unpaidSessions} unpaid`}</span>
                      </span>
                      <span className="text-right">
                        {settled
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-forest"><Tick />Paid</span>
                          : <span className="block whitespace-nowrap text-sm font-medium text-ink tabular-nums">{money(m.dueMinor)}</span>}
                        <span className="block whitespace-nowrap text-xs text-ink-soft tabular-nums">{settled ? money(m.paidOutMinor) : m.paidOutMinor ? `${money(m.paidOutMinor)} paid` : "due"}</span>
                      </span>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </FinanceModal>
  );
}

const Tick = () => <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function MentorLedgerView({ mentor, currency, eyebrow, query, onBack, onChanged, onClose }: { mentor: MentorDue; currency: Currency; eyebrow: string; query: string; onBack: () => void; onChanged: () => void; onClose: () => void }) {
  const toast = useToast();
  const now = useNow();
  const mentorId = mentor.id;
  const { user } = useAuth();
  const canPay = (user?.staffRole ?? "OWNER") !== "OPERATIONS";
  const ledger = useApi<MentorLedger>(`/admin/payouts/mentors/${mentorId}?currency=${currency}${query ? `&${query}` : ""}`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const money = (v: number | null) => (v == null ? NOT_SET : formatMoney(v, currency));

  const l = ledger.data;
  const unpaid = useMemo(() => (l?.sessions ?? []).filter((s) => !s.payout), [l]);
  const byId = useMemo(() => new Map((l?.sessions ?? []).map((s) => [s.id, s])), [l]);
  const total = (ids: string[]) => ids.reduce((n, id) => n + (byId.get(id)?.payoutMinor ?? 0), 0);
  const selection = [...picked].filter((id) => unpaid.some((s) => s.id === id));
  const target = selection.length ? selection : unpaid.map((s) => s.id);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = unpaid.length > 0 && selection.length === unpaid.length;

  async function pay(ids: string[]) {
    setBusy(true);
    try {
      await api("/admin/payouts", { method: "POST", body: { mentorId, bookingIds: ids, reference: reference || undefined, note: note || undefined } });
      toast(`Payout of ${money(total(ids))} recorded for ${l!.mentor.name}.`);
      setConfirming(null); setPicked(new Set()); setReference(""); setNote("");
      await ledger.reload(); onChanged();
    } catch (e) { toast(errMsg(e), "error"); await ledger.reload(); } finally { setBusy(false); }
  }

  async function undo(p: PayoutInfo) {
    setBusy(true);
    try {
      await api(`/admin/payouts/${p.id}`, { method: "DELETE" });
      toast(`Payout of ${money(p.amountMinor)} undone. ${plural(p.sessions, "session")} marked unpaid.`);
      setUndoing(null);
      await ledger.reload(); onChanged();
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }

  const upcomingIn = (ids: string[]) => ids.filter((id) => new Date(byId.get(id)?.startAt ?? 0).getTime() > now).length;

  const footer = !canPay || !l || !l.sessions.length || !unpaid.length ? undefined : confirming ? (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm text-ink">Record a payout of <span className="font-medium tabular-nums">{money(total(confirming))}</span> to {l.mentor.name} for {plural(confirming.length, "session")}</p>
      </div>
      {upcomingIn(confirming) > 0 && <p className="rounded-xl bg-lemon/60 px-3 py-2 text-xs text-ink">{plural(upcomingIn(confirming), "session")} {upcomingIn(confirming) === 1 ? "hasn't" : "haven't"} taken place yet.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder="Transfer reference (optional)" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Transfer reference" />
        <input className="input" placeholder="Note (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line hover:ring-ink/40">Cancel</button>
        <button type="button" disabled={busy} onClick={() => pay(confirming)} className="inline-flex min-w-36 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? <Spinner /> : "Confirm payout"}</button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" className="h-4 w-4 accent-ink" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(unpaid.map((s) => s.id)))} />
        {selection.length ? `${selection.length} of ${unpaid.length} selected` : `Select unpaid (${unpaid.length})`}
      </label>
      <button type="button" disabled={!l.configured} onClick={() => setConfirming(target)} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
        {selection.length ? `Mark ${selection.length} as paid` : "Mark all as paid"} · <span className="tabular-nums">{money(total(target))}</span>
      </button>
    </div>
  );

  return (
    <FinanceModal label={`Payouts for ${mentor.name}`} eyebrow={eyebrow} onBack={onBack} backLabel="All mentors" onClose={onClose}
      title={<span className="flex items-center gap-2"><Avatar name={mentor.name} size="h-6 w-6 text-[0.6rem]" /><span className="font-medium text-ink">{mentor.name}</span><span>· {LEVEL_LABEL[mentor.level]}</span></span>}
      total={money(l ? l.dueMinor : mentor.dueMinor)}
      totalNote={l ? (l.unpaidCount ? `Due for ${plural(l.unpaidCount, "session")}${l.paidMinor ? ` · ${money(l.paidMinor)} already paid` : ""}` : l.sessions.length ? "Everything in this period has been paid" : undefined) : undefined}
      footer={footer}>
      {ledger.loading && !l ? <Skeleton className="h-48 rounded-2xl" /> : ledger.error || !l ? <Alert>{ledger.error}</Alert> : !l.sessions.length ? <Empty>No paid sessions for this mentor in this period.</Empty> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([["Earned", l.earnedMinor, "bg-paper"], ["Paid", l.paidMinor, l.paidMinor ? "bg-mint/60" : "bg-paper"], ["Due", l.dueMinor, l.dueMinor ? "bg-lemon/60" : "bg-paper"]] as const).map(([k, v, bg]) => (
              <div key={k} className={`rounded-2xl px-2 py-3 ${bg}`}>
                <p className="text-xs text-ink-soft">{k}</p>
                <p className="mt-0.5 text-sm font-medium text-ink tabular-nums">{money(v)}</p>
              </div>
            ))}
          </div>
          {!l.configured && <Alert tone="info">Set the commission for this mentor&apos;s tier under Pricing &amp; settings before recording payouts.</Alert>}
          <section>
            <SectionTitle>Where to pay {mentor.name.split(" ")[0]}</SectionTitle>
            <PayoutDetailsView d={l.mentor.payoutDetails} />
          </section>
          <section>
            <SectionTitle aside={<a href={`mailto:${l.mentor.email}`} className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline">{l.mentor.email}</a>}>Sessions</SectionTitle>
            <ul className="divide-y divide-line/70">
              {l.sessions.map((s) => {
                const upcoming = new Date(s.startAt).getTime() > now;
                const status = s.status === "COMPLETED" ? "Completed" : upcoming ? "Upcoming" : "Took place";
                return (
                  <li key={s.id} className={`-mx-3 rounded-2xl px-3 py-3.5 transition-colors ${confirming?.includes(s.id) ? "bg-lemon/40" : ""}`}>
                    <div className="flex items-start gap-3">
                      <span className="pt-0.5">
                        {s.payout ? <span className="flex h-4 w-4 items-center justify-center rounded-full bg-forest text-white"><Tick /></span>
                          : canPay && <input type="checkbox" className="h-4 w-4 accent-ink" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select session on ${day(s.startAt)}`} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink"><span className="font-medium">{day(s.startAt)}</span> · {time(s.startAt)}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-soft">{s.studentName} · {s.kind === "GROUP" ? "Group" : "1:1"} · {status}{s.returning ? " · Returning student" : ""} · {s.reference}</p>
                        <p className="mt-1 text-xs text-ink-soft tabular-nums">{money(s.priceMinor)} − {s.percent == null ? "commission not set" : `${s.percent}% commission`}{s.feeMinor != null ? ` (${money(s.feeMinor)})` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="whitespace-nowrap text-sm font-medium text-ink tabular-nums">{money(s.payoutMinor)}</p>
                        {s.payout
                          ? <p className="mt-1 whitespace-nowrap text-xs text-forest">Paid {day(s.payout.createdAt)}</p>
                          : canPay && <button type="button" disabled={!l.configured || busy} onClick={() => setConfirming([s.id])} className="mt-1 rounded-full px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-line hover:ring-ink/40 disabled:opacity-50">Mark paid</button>}
                      </div>
                    </div>
                    {s.payout && (
                      <div className="ml-7 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">
                        <span className="min-w-0">{s.payout.reference ? `Ref ${s.payout.reference}` : "No reference"}{s.payout.sessions > 1 ? ` · part of a ${money(s.payout.amountMinor)} payout for ${s.payout.sessions} sessions` : ""}{s.payout.note ? ` · ${s.payout.note}` : ""}</span>
                        {undoing === s.payout.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-ink">{s.payout.sessions > 1 ? `Undo all ${s.payout.sessions}?` : "Undo?"}</span>
                            <button type="button" onClick={() => setUndoing(null)} className="rounded-full px-2.5 py-1 font-medium text-ink ring-1 ring-line">Keep</button>
                            <button type="button" disabled={busy} onClick={() => undo(s.payout!)} className="rounded-full bg-rust px-2.5 py-1 font-medium text-white disabled:opacity-60">Undo payout</button>
                          </span>
                        ) : canPay && <button type="button" onClick={() => setUndoing(s.payout!.id)} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Undo</button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </FinanceModal>
  );
}
