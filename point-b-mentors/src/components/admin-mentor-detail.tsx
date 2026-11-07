"use client";

import { useState } from "react";
import { Alert, Badge, Button, Skeleton, Spinner } from "@/components/ui";
import { FinanceModal, SectionTitle } from "@/components/finance-modal";
import { BookingDetailModal } from "@/components/booking-detail";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { api, errMsg } from "@/lib/api";
import { LEVEL_LABEL, STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Currency, Level } from "@/lib/types";

export interface PayoutDetails { method?: string; accountTitle?: string; bankName?: string; iban?: string; accountNumber?: string; wallet?: string; updatedAt?: string; updatedBy?: string }
interface MentorDetail {
  id: string; slug: string; title: string; organization: string; introduction: string; careerSummary: string; photoUrl: string | null; linkedinUrl: string | null;
  level: Level; status: string; category: "LOCAL" | "INTERNATIONAL"; verified: boolean; createdAt: string; payoutDetails: PayoutDetails | null;
  user: { name: string; email: string; phone: string | null };
  stats: { completed: number; upcoming: number; cancelled: number; noShows: number; rating: number | null; reviews: number; hiddenReviews: number; earnedMinor: number; dueMinor: number; paidMinor: number; forCancelledMinor: number };
  openSlots: number;
  availability: { day: string; open: number; booked: number }[];
  recentBookings: { reference: string; status: string; priceMinor: number; currency: Currency; startAt: string; studentName: string }[];
  payouts: { id: string; createdAt: string; amountMinor: number; currency: Currency; sessions: number; reference: string | null }[];
}

const TONE: Record<string, "neutral" | "brass" | "forest" | "rust"> = { PENDING_PAYMENT: "brass", CONFIRMED: "forest", COMPLETED: "forest", CANCELLED: "rust", NO_SHOW: "rust", ACTIVE: "forest", ONBOARDING: "brass", PAUSED: "rust", SUSPENDED: "rust" };

/** One mentor in full: performance, the next two weeks of availability, profile editing and where to pay them. */
export function MentorDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const d = useApi<MentorDetail>(`/admin/mentors/${id}/profile`);
  const [edit, setEdit] = useState<Partial<MentorDetail> | null>(null);
  const [pay, setPay] = useState<PayoutDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const m = d.data;
  const role = user?.staffRole ?? "OWNER";
  const canEdit = role !== "FINANCE", canPay = role !== "OPERATIONS";
  const currency: Currency = m?.category === "LOCAL" ? "PKR" : "GBP";

  async function save(path: string, body: unknown, msg: string) {
    setBusy(true);
    try { await api(`/admin/mentors/${id}/${path}`, { method: "PATCH", body }); await d.reload(); onChanged(); toast(msg); setEdit(null); setPay(null); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }

  if (booking) return <BookingDetailModal reference={booking} onClose={() => setBooking(null)} onChanged={() => d.reload()} />;
  const maxDay = Math.max(1, ...(m?.availability ?? []).map((a) => a.open + a.booked));

  return (
    <FinanceModal label={m ? `Mentor ${m.user.name}` : "Mentor"} eyebrow={m ? `${LEVEL_LABEL[m.level]} · ${m.category === "LOCAL" ? "Local · PKR" : "International · GBP"}` : "Mentor"} onClose={onClose} wide
      title={m ? <span className="flex items-center gap-3">
        {m.photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={m.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lemon font-display text-lg text-ink">{m.user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-display text-2xl leading-tight text-ink">{m.user.name}{m.verified && <Badge tone="forest">Verified</Badge>}<Badge tone={TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge></span><span className="block truncate text-sm text-ink-soft">{m.title}</span></span>
      </span> : "Loading"}>
      {d.loading && !m ? <Skeleton className="h-72 rounded-2xl" /> : d.error || !m ? <Alert>{d.error}</Alert> : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["Rating", m.stats.rating ? `${m.stats.rating.toFixed(1)} ★` : "—", `${m.stats.reviews} review${m.stats.reviews === 1 ? "" : "s"}${m.stats.hiddenReviews ? `, ${m.stats.hiddenReviews} hidden` : ""}`],
              ["Sessions", String(m.stats.completed), `${m.stats.upcoming} upcoming`],
              ["Cancelled / no-show", `${m.stats.cancelled} / ${m.stats.noShows}`, "all time"],
              ["Owed to mentor", formatMoney(m.stats.dueMinor, currency), `${formatMoney(m.stats.paidMinor, currency)} paid of ${formatMoney(m.stats.earnedMinor, currency)}`],
            ] as const).map(([k, v, note]) => (
              <div key={k} className="rounded-2xl bg-paper px-4 py-3"><p className="text-[11px] text-ink-soft">{k}</p><p className="mt-0.5 font-display text-2xl leading-tight text-ink tabular-nums">{v}</p><p className="text-[11px] text-ink-soft">{note}</p></div>
            ))}
          </section>

          {m.stats.forCancelledMinor > 0 && <Alert tone="info">{formatMoney(m.stats.forCancelledMinor, currency)} already paid to this mentor was for sessions that were later cancelled. Recover it from their next payout, or note it as a goodwill payment.</Alert>}

          <section>
            <SectionTitle aside={<span className={`text-xs ${m.openSlots ? "text-ink-soft" : "font-medium text-rust"}`}>{m.openSlots ? `${m.openSlots} open time${m.openSlots === 1 ? "" : "s"}` : "No open times. Students can't book."}</span>}>Next 14 days</SectionTitle>
            <div className="flex items-end gap-1.5 rounded-2xl bg-paper px-3 pb-2 pt-3" role="img" aria-label={`Availability for the next 14 days: ${m.openSlots} open times`}>
              {m.availability.map((a) => {
                const total = a.open + a.booked;
                return (
                  <div key={a.day} className="flex flex-1 flex-col items-center gap-1" title={`${fmtDay(a.day + "T12:00:00Z")}: ${a.open} open, ${a.booked} booked`}>
                    <div className="flex h-16 w-full flex-col justify-end gap-0.5">
                      {a.booked > 0 && <span className="block w-full rounded-sm bg-ink/70" style={{ height: Math.max(3, (a.booked / maxDay) * 62) }} />}
                      {a.open > 0 && <span className="block w-full rounded-sm bg-forest/60" style={{ height: Math.max(3, (a.open / maxDay) * 62) }} />}
                      {!total && <span className="block h-1 w-full rounded-sm bg-line" />}
                    </div>
                    <span className="text-[10px] text-ink-soft">{new Date(a.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 flex gap-4 text-[11px] text-ink-soft"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-forest/60" />Open</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink/70" />Booked</span></p>
          </section>

          <section>
            <SectionTitle aside={canEdit && !edit ? <button type="button" onClick={() => setEdit({ title: m.title, organization: m.organization, introduction: m.introduction, careerSummary: m.careerSummary, photoUrl: m.photoUrl, linkedinUrl: m.linkedinUrl, verified: m.verified })} className="text-xs font-medium text-ink underline-offset-4 hover:underline">Edit profile</button> : <a href={`/mentors/${m.slug}`} target="_blank" rel="noreferrer" className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline">Public profile ↗</a>}>Profile</SectionTitle>
            {edit ? (
              <div className="space-y-3 rounded-2xl bg-paper p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-ink-soft">Headline<input className="input mt-1 bg-white" value={edit.title ?? ""} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
                  <label className="block text-xs text-ink-soft">Organisation<input className="input mt-1 bg-white" value={edit.organization ?? ""} maxLength={120} onChange={(e) => setEdit({ ...edit, organization: e.target.value })} /></label>
                  <label className="block text-xs text-ink-soft">Photo URL<input className="input mt-1 bg-white" value={edit.photoUrl ?? ""} maxLength={500} onChange={(e) => setEdit({ ...edit, photoUrl: e.target.value })} placeholder="https://…" /></label>
                  <label className="block text-xs text-ink-soft">LinkedIn<input className="input mt-1 bg-white" value={edit.linkedinUrl ?? ""} maxLength={300} onChange={(e) => setEdit({ ...edit, linkedinUrl: e.target.value })} /></label>
                </div>
                <label className="block text-xs text-ink-soft">Introduction<textarea className="input mt-1 min-h-20 bg-white" value={edit.introduction ?? ""} maxLength={2000} onChange={(e) => setEdit({ ...edit, introduction: e.target.value })} /></label>
                <label className="block text-xs text-ink-soft">Career summary<textarea className="input mt-1 min-h-24 bg-white" value={edit.careerSummary ?? ""} maxLength={4000} onChange={(e) => setEdit({ ...edit, careerSummary: e.target.value })} /></label>
                <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4 accent-ink" checked={!!edit.verified} onChange={(e) => setEdit({ ...edit, verified: e.target.checked })} />Show the &ldquo;Verified mentor&rdquo; badge (identity and credentials checked)</label>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit(null)}>Cancel</Button>
                  <Button size="sm" disabled={busy || !edit.title?.trim()} onClick={() => save("profile", edit, "Profile updated on the live site.")}>{busy ? <Spinner /> : "Save profile"}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-ink">{m.organization}</p>
                <p className="whitespace-pre-line leading-relaxed text-ink-soft">{m.introduction}</p>
                <p className="text-xs text-ink-soft">{m.user.email}{m.user.phone ? ` · ${m.user.phone}` : ""} · Mentor since {fmtDay(m.createdAt).replace(/^\w+, /, "")}</p>
              </div>
            )}
          </section>

          <section>
            <SectionTitle aside={canPay && !pay ? <button type="button" onClick={() => setPay(m.payoutDetails ?? { method: "bank" })} className="text-xs font-medium text-ink underline-offset-4 hover:underline">{m.payoutDetails ? "Edit" : "Add"}</button> : undefined}>Where to pay them</SectionTitle>
            {pay ? <PayoutDetailsForm value={pay} onChange={setPay} busy={busy} onCancel={() => setPay(null)} onSave={() => save("payout-details", pay, "Payout details saved.")} />
              : <PayoutDetailsView d={m.payoutDetails} />}
          </section>

          <section>
            <SectionTitle>Recent bookings</SectionTitle>
            {!m.recentBookings.length ? <p className="text-sm text-ink-soft">No bookings yet.</p> : (
              <ul className="divide-y divide-line">{m.recentBookings.map((b) => (
                <li key={b.reference}><button type="button" onClick={() => setBooking(b.reference)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-paper/50">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink">{b.studentName}</span><span className="block text-xs text-ink-soft">{fmtDay(b.startAt).replace(/^\w+, /, "")}, {fmtTime(b.startAt)}</span></span>
                  <span className="whitespace-nowrap text-sm tabular-nums text-ink">{formatMoney(b.priceMinor, b.currency)}</span><Badge tone={TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                </button></li>
              ))}</ul>
            )}
          </section>

          {m.payouts.length > 0 && (
            <section>
              <SectionTitle>Payouts</SectionTitle>
              <ul className="divide-y divide-line text-sm">{m.payouts.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-2"><span className="text-ink">{fmtDay(p.createdAt).replace(/^\w+, /, "")}<span className="text-ink-soft"> · {p.sessions} session{p.sessions === 1 ? "" : "s"}{p.reference ? ` · ref ${p.reference}` : ""}</span></span><span className="tabular-nums text-ink">{formatMoney(p.amountMinor, p.currency)}</span></li>
              ))}</ul>
            </section>
          )}
        </>
      )}
    </FinanceModal>
  );
}

export function PayoutDetailsView({ d, compact = false }: { d: PayoutDetails | null; compact?: boolean }) {
  if (!d) return <p className={`rounded-2xl bg-lemon/50 px-4 py-3 text-sm text-ink ${compact ? "" : ""}`}>No payout details yet. Ask the mentor to add them in their dashboard, under Payouts.</p>;
  const rows = [["Account name", d.accountTitle], ["Bank", d.bankName], ["IBAN", d.iban], ["Account number", d.accountNumber], ["Mobile wallet", d.wallet]].filter(([, v]) => v) as [string, string][];
  return (
    <div className="rounded-2xl bg-paper px-4 py-2 text-sm">
      <dl className="divide-y divide-line/70">{rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 py-2"><dt className="text-ink-soft">{k}</dt><dd className="flex items-center gap-2 text-right font-medium text-ink"><span className={k === "IBAN" || k.includes("number") || k.includes("wallet") ? "font-mono text-[13px]" : ""}>{v}</span>
          <button type="button" onClick={() => navigator.clipboard?.writeText(v).catch(() => undefined)} className="rounded-full px-2 py-0.5 text-[11px] font-normal text-ink-soft ring-1 ring-line hover:text-ink" aria-label={`Copy ${k}`}>Copy</button></dd></div>
      ))}</dl>
      {d.updatedAt && <p className="pb-1 text-[11px] text-ink-soft">Updated {fmtDay(d.updatedAt).replace(/^\w+, /, "")} by {d.updatedBy === "admin" ? "the POINT B team" : "the mentor"}</p>}
    </div>
  );
}

export function PayoutDetailsForm({ value, onChange, onSave, onCancel, busy }: { value: PayoutDetails; onChange: (v: PayoutDetails) => void; onSave: () => void; onCancel?: () => void; busy: boolean }) {
  const wallet = value.method === "wallet";
  const ok = !!value.accountTitle?.trim() && (wallet ? !!value.wallet?.trim() : !!(value.iban?.trim() || value.accountNumber?.trim()));
  return (
    <div className="space-y-3 rounded-2xl bg-paper p-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 text-sm ring-1 ring-line" role="radiogroup" aria-label="Payout method">
        {([["bank", "Bank account"], ["wallet", "Mobile wallet"]] as const).map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={(value.method ?? "bank") === k} onClick={() => onChange({ ...value, method: k })} className={`rounded-full px-3 py-1.5 font-medium transition-colors ${(value.method ?? "bank") === k ? "bg-ink text-white" : "text-ink-soft"}`}>{label}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-ink-soft">Name on the account<input className="input mt-1 bg-white" value={value.accountTitle ?? ""} maxLength={100} onChange={(e) => onChange({ ...value, accountTitle: e.target.value })} /></label>
        {wallet ? <label className="block text-xs text-ink-soft">JazzCash / Easypaisa number<input className="input mt-1 bg-white font-mono" value={value.wallet ?? ""} maxLength={30} onChange={(e) => onChange({ ...value, wallet: e.target.value })} placeholder="03xx xxxxxxx" /></label>
          : <label className="block text-xs text-ink-soft">Bank<input className="input mt-1 bg-white" value={value.bankName ?? ""} maxLength={80} onChange={(e) => onChange({ ...value, bankName: e.target.value })} placeholder="e.g. Meezan Bank, Barclays" /></label>}
        {!wallet && <>
          <label className="block text-xs text-ink-soft">IBAN<input className="input mt-1 bg-white font-mono" value={value.iban ?? ""} maxLength={40} onChange={(e) => onChange({ ...value, iban: e.target.value.toUpperCase() })} placeholder="PK36 SCBL 0000 …" /></label>
          <label className="block text-xs text-ink-soft">Account number (or UK sort code + number)<input className="input mt-1 bg-white font-mono" value={value.accountNumber ?? ""} maxLength={40} onChange={(e) => onChange({ ...value, accountNumber: e.target.value })} /></label>
        </>}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>}
        <Button size="sm" disabled={busy || !ok} onClick={onSave}>{busy ? <Spinner /> : "Save payout details"}</Button>
      </div>
    </div>
  );
}
