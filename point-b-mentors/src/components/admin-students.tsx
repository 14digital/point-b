"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, EmptyState, FilterChips, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { Panel } from "@/components/dashboard";
import { FinanceModal, SectionTitle } from "@/components/finance-modal";
import { BookingDetailModal } from "@/components/booking-detail";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { api, errMsg } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/constants";
import { fmtDay, fmtTime, formatMoney, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Currency } from "@/lib/types";

interface StudentRow {
  id: string; name: string; email: string; phone: string | null; age: number | null; minor: boolean; guardianEmail: string | null; guardianConsent: boolean; needsConsent: boolean;
  isActive: boolean; suspendedReason: string | null; anonymized: boolean; joinedAt: string; bookings: number; paidSessions: number; spent: Record<Currency, number>; lastBookingAt: string | null;
}
interface StudentDetail {
  id: string; name: string; email: string; phone: string | null; timezone: string; age: number | null; minor: boolean; guardianEmail: string | null; guardianConsent: boolean; whatsappAlerts: boolean;
  isActive: boolean; suspendedReason: string | null; anonymizedAt: string | null; createdAt: string;
  bookings: { reference: string; status: string; priceMinor: number; currency: Currency; awaitingVerification: boolean | null; cancelReason: string | null; createdAt: string; slot: { startAt: string }; mentor: { user: { name: string } } }[];
  tickets: { id: string; number: string; topic: string; status: string; urgent: boolean; createdAt: string }[];
  history: { action: string; detail: string; at: string; by: string }[];
  wallet: { balances: Record<Currency, number>; entries: { id: string; currency: Currency; amountMinor: number; kind: string; reference: string | null; note: string | null; createdAt: string }[] };
}

const FILTERS = [["all", "All"], ["consent", "Needs guardian consent"], ["minors", "Under 18"], ["suspended", "Suspended"], ["active", "Have booked"]] as const;
type Filter = (typeof FILTERS)[number][0];
const TONE: Record<string, "neutral" | "brass" | "forest" | "rust"> = { PENDING_PAYMENT: "brass", CONFIRMED: "forest", COMPLETED: "forest", CANCELLED: "rust", NO_SHOW: "rust" };
const spentLabel = (s: Record<Currency, number>) => [s.PKR ? formatMoney(s.PKR, "PKR") : null, s.GBP ? formatMoney(s.GBP, "GBP") : null].filter(Boolean).join(" + ") || "—";

function StudentStatus({ s }: { s: StudentRow }) {
  return s.anonymized ? <Badge>Erased</Badge> : !s.isActive ? <Badge tone="rust">Suspended</Badge> : s.needsConsent ? <Badge tone="brass">Needs consent</Badge> : s.minor ? <Badge tone="forest">Under 18 · consent given</Badge> : <Badge tone="forest">Active</Badge>;
}

function Avatar({ name, size = "h-9 w-9 text-xs" }: { name: string; size?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-ink ${size}`} style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>;
}

/** Every student account: search, guardian consent for under-18s, suspension and erasure on request. */
export function Students({ onChanged }: { onChanged?: () => void }) {
  const list = useApi<StudentRow[]>("/admin/students");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((s) => {
      if (term && !`${s.name} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(term)) return false;
      if (filter === "consent") return s.needsConsent;
      if (filter === "minors") return s.minor;
      if (filter === "suspended") return !s.isActive && !s.anonymized;
      if (filter === "active") return s.bookings > 0;
      return true;
    }).sort((a, b) => Number(b.needsConsent) - Number(a.needsConsent));
  }, [list.data, q, filter]);
  const waiting = (list.data ?? []).filter((s) => s.needsConsent).length;

  return (
    <div className="space-y-6">
      {waiting > 0 && (
        <button type="button" onClick={() => setFilter("consent")} className="flex w-full items-center gap-4 rounded-3xl bg-lemon/70 px-5 py-4 text-left ring-1 ring-brass/20 transition-colors hover:bg-lemon">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5l6-2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M10 7v4M10 13.5v.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></span>
          <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{waiting} under-18 student{waiting === 1 ? " is" : "s are"} waiting for guardian consent</span><span className="block text-sm text-ink-soft">They can&rsquo;t book until you record consent from their parent or guardian.</span></span>
          <span className="text-sm font-medium text-ink">Review</span>
        </button>
      )}
      <Panel title="Students" action={<span className="text-sm text-ink-soft">{rows.length} of {list.data?.length ?? 0}</span>}>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[14rem] flex-1">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <input className="input" style={{ paddingLeft: "2.5rem" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search students" />
          </label>
          <FilterChips options={FILTERS} value={filter} onChange={setFilter} counts={{ consent: waiting }} highlight="consent" label="Filter students" />
        </div>
        {list.loading ? <Skeleton className="h-64 rounded-2xl" /> : list.error ? <Alert>{list.error}</Alert> : !rows.length ? <EmptyState title="No students found" description="Try a different search or filter." /> : (
          <>
          {/* Phones: one compact row per student. */}
          <ul className="-mx-6 divide-y divide-line border-y border-line sm:hidden">{rows.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setOpen(s.id)} className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors active:bg-paper/60">
                <Avatar name={s.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="truncate font-medium text-ink">{s.name}</span><span className="shrink-0 text-xs tabular-nums text-ink-soft">{s.paidSessions} paid</span></span>
                  <span className="block truncate text-xs text-ink-soft">{s.email}</span>
                  <span className="mt-1.5 block"><StudentStatus s={s} /></span>
                </span>
              </button>
            </li>
          ))}</ul>
          <div className="-mx-6 hidden overflow-x-auto sm:-mx-7 sm:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs text-ink-soft"><tr className="border-y border-line bg-paper/60">{["Student", "Contact", "Sessions", "Spent", "Joined", "Status"].map((h) => <th key={h} className="px-4 py-3 font-medium first:pl-6 last:pr-6 sm:first:pl-7 sm:last:pr-7">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{rows.map((s) => (
                <tr key={s.id} onClick={() => setOpen(s.id)} className="cursor-pointer transition-colors hover:bg-paper/60">
                  <td className="py-3 pl-6 pr-4 sm:pl-7"><span className="flex items-center gap-3"><Avatar name={s.name} /><span className="min-w-0"><button type="button" onClick={(e) => { e.stopPropagation(); setOpen(s.id); }} className="block truncate text-left font-medium text-ink underline-offset-4 hover:underline">{s.name}</button><span className="block text-xs text-ink-soft">{s.age != null ? `${s.age} years old` : "Age not given"}</span></span></span></td>
                  <td className="px-4 py-3"><span className="block max-w-[16rem] truncate text-ink">{s.email}</span><span className="block text-xs text-ink-soft">{s.phone ?? "No phone"}</span></td>
                  <td className="px-4 py-3 tabular-nums text-ink">{s.paidSessions}<span className="text-ink-soft"> / {s.bookings}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink">{spentLabel(s.spent)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{new Date(s.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="py-3 pl-4 pr-6 sm:pr-7">
                    <StudentStatus s={s} />
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
      {open && <StudentModal id={open} onClose={() => setOpen(null)} onChanged={() => { list.reload(); onChanged?.(); }} />}
    </div>
  );
}

function StudentModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const d = useApi<StudentDetail>(`/admin/students/${id}`);
  const [mode, setMode] = useState<null | "suspend" | "erase">(null);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const s = d.data;
  const owner = user?.staffRole === "OWNER";

  async function act(fn: () => Promise<StudentDetail>, msg: string) {
    setBusy(true);
    try { d.setData(await fn()); toast(msg); setMode(null); setReason(""); setConfirmText(""); onChanged(); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }
  const patch = (path: string, body: unknown) => api<StudentDetail>(`/admin/students/${id}/${path}`, { method: "PATCH", body });

  if (booking) return <BookingDetailModal reference={booking} onClose={() => setBooking(null)} onChanged={() => d.reload()} />;

  const footer = !s || s.anonymizedAt ? undefined : mode === "suspend" ? (
    <div className="space-y-3">
      <p className="text-sm text-ink">Suspend {s.name.split(" ")[0]}? They&rsquo;ll be signed out and can&rsquo;t sign in or book until you reactivate the account.</p>
      <textarea className="input min-h-16" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, for the team (the student doesn't see this)" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode(null)}>Back</Button>
        <Button size="sm" variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => act(() => patch("suspension", { suspend: true, reason }), "Account suspended.")}>{busy ? <Spinner /> : "Suspend account"}</Button>
      </div>
    </div>
  ) : mode === "erase" ? (
    <div className="space-y-3">
      <p className="text-sm text-ink">This permanently removes {s.name}&rsquo;s name, email, phone, date of birth and activity. Bookings and payments stay for the accounts, under &ldquo;Erased student&rdquo;. This can&rsquo;t be undone.</p>
      <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type ERASE to confirm" aria-label="Type ERASE to confirm" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode(null)}>Back</Button>
        <Button size="sm" variant="danger" disabled={busy || confirmText !== "ERASE"} onClick={() => act(() => api<StudentDetail>(`/admin/students/${id}/erase`, { body: {} }), "Personal data erased.")}>{busy ? <Spinner /> : "Erase personal data"}</Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {owner && <button type="button" onClick={() => setMode("erase")} className="mr-auto text-xs text-ink-soft underline-offset-4 hover:text-rust hover:underline">Erase personal data</button>}
      {s.isActive
        ? <Button size="sm" variant="secondary" onClick={() => setMode("suspend")}>Suspend account</Button>
        : <Button size="sm" disabled={busy} onClick={() => act(() => patch("suspension", { suspend: false }), "Account reactivated.")}>{busy ? <Spinner /> : "Reactivate account"}</Button>}
    </div>
  );

  return (
    <FinanceModal label={s ? `Student ${s.name}` : "Student"} eyebrow="Student" onClose={onClose} footer={footer} wide
      title={s ? <span className="flex items-center gap-3"><Avatar name={s.name} size="h-11 w-11 text-sm" /><span className="min-w-0"><span className="block font-display text-2xl leading-tight text-ink">{s.name}</span><span className="block text-sm text-ink-soft">{s.email}</span></span></span> : "Loading"}>
      {d.loading && !s ? <Skeleton className="h-64 rounded-2xl" /> : d.error || !s ? <Alert>{d.error}</Alert> : (
        <>
          {s.anonymizedAt && <Alert tone="info">This account&rsquo;s personal data was erased on {fmtDay(s.anonymizedAt)}.</Alert>}
          {!s.isActive && !s.anonymizedAt && <div className="rounded-2xl bg-rust-pale px-4 py-3 text-sm"><p className="font-medium text-rust">Suspended</p><p className="mt-0.5 text-ink">{s.suspendedReason}</p></div>}

          {s.minor && !s.anonymizedAt && (
            <section className={`rounded-2xl p-4 ring-1 ${s.guardianConsent ? "bg-mint/40 ring-forest/15" : "bg-lemon/50 ring-brass/20"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{s.guardianConsent ? "Guardian consent recorded" : "Waiting for guardian consent"}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{s.name.split(" ")[0]} is {s.age}. {s.guardianConsent ? "They can book sessions." : "They can't book until a parent or guardian agrees."}</p>
                  <p className="mt-1 text-sm text-ink">Guardian: {s.guardianEmail ? <a href={`mailto:${s.guardianEmail}`} className="underline underline-offset-4">{s.guardianEmail}</a> : "not given"}</p>
                </div>
                {s.guardianConsent
                  ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => patch("consent", { consent: false }), "Consent withdrawn. They can no longer book.")}>Withdraw consent</Button>
                  : <Button size="sm" disabled={busy} onClick={() => act(() => patch("consent", { consent: true }), "Consent recorded. The student has been emailed.")}>{busy ? <Spinner /> : "Record consent"}</Button>}
              </div>
              {!s.guardianConsent && <p className="mt-3 text-xs text-ink-soft">Record consent only once the guardian has confirmed by email or in writing. It&rsquo;s logged with your name.</p>}
            </section>
          )}

          <section className="grid gap-2 sm:grid-cols-4">
            {([["Phone", s.phone ?? "—"], ["Age", s.age != null ? String(s.age) : "—"], ["Timezone", s.timezone.replace("_", " ")], ["WhatsApp alerts", s.whatsappAlerts ? "On" : "Off"]] as const).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-paper px-4 py-3"><p className="text-[11px] text-ink-soft">{k}</p><p className="mt-0.5 truncate text-sm font-medium text-ink">{v}</p></div>
            ))}
          </section>

          <BalanceSection s={s} canAdjust={user?.staffRole === "OWNER" || user?.staffRole === "FINANCE"} onSaved={(next) => { d.setData(next); onChanged(); }} />

          <section>
            <SectionTitle aside={<span className="text-xs text-ink-soft">Joined {fmtDay(s.createdAt)}</span>}>Bookings</SectionTitle>
            {!s.bookings.length ? <p className="text-sm text-ink-soft">No bookings yet.</p> : (
              <ul className="divide-y divide-line">{s.bookings.map((b) => (
                <li key={b.reference}>
                  <button type="button" onClick={() => setBooking(b.reference)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-paper/50">
                    <span className="min-w-0 flex-1"><span className="block text-sm text-ink">{b.mentor.user.name} · {fmtDay(b.slot.startAt).replace(/^\w+, /, "")}, {fmtTime(b.slot.startAt)}</span><span className="block font-mono text-xs text-ink-soft">{b.reference}{b.cancelReason ? <span className="font-sans text-rust"> · {b.cancelReason}</span> : null}</span></span>
                    <span className="whitespace-nowrap text-sm tabular-nums text-ink">{formatMoney(b.priceMinor, b.currency)}</span>
                    <Badge tone={b.awaitingVerification ? "brass" : TONE[b.status]}>{b.awaitingVerification ? "Checking payment" : STATUS_LABEL[b.status]}</Badge>
                  </button>
                </li>
              ))}</ul>
            )}
          </section>

          {s.tickets.length > 0 && (
            <section>
              <SectionTitle>Support messages</SectionTitle>
              <ul className="space-y-2">{s.tickets.map((t) => (
                <li key={t.id}><a href={`/admin?tab=support&ticket=${t.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 text-sm hover:bg-paper-dim"><span><span className="font-mono text-xs text-ink-soft">{t.number}</span> · {t.topic}</span><Badge tone={t.urgent ? "rust" : t.status === "RESOLVED" ? "forest" : "brass"}>{t.status === "IN_PROGRESS" ? "In progress" : t.status.charAt(0) + t.status.slice(1).toLowerCase()}</Badge></a></li>
              ))}</ul>
            </section>
          )}

          {s.history.length > 0 && (
            <section>
              <SectionTitle>Account history</SectionTitle>
              <ol className="space-y-2 text-sm">{s.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-4"><span className="text-ink">{h.action.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}{h.detail ? <span className="text-ink-soft"> · {h.detail}</span> : null}</span><span className="whitespace-nowrap text-xs text-ink-soft">{h.by}, {fmtDay(h.at).replace(/^\w+, /, "")}</span></li>
              ))}</ol>
            </section>
          )}
        </>
      )}
    </FinanceModal>
  );
}

const WALLET_LABEL: Record<string, string> = { CANCELLATION: "Session cancelled", LATE_PAYMENT: "Payment arrived late", SPEND: "Used for a session", RETURN: "Booking not completed", ADJUSTMENT: "Adjusted by the team" };

/** The student's POINT B balance, its history, and (for owners and finance) adding or removing credit with a reason. */
function BalanceSection({ s, canAdjust, onSaved }: { s: StudentDetail; canAdjust: boolean; onSaved: (d: StudentDetail) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<{ currency: Currency; sign: 1 | -1; amount: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { balances, entries } = s.wallet;
  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const amountMinor = Math.round(Number(form.amount) * 100) * form.sign;
      onSaved(await api<StudentDetail>(`/admin/students/${s.id}/wallet`, { body: { currency: form.currency, amountMinor, note: form.note } }));
      toast(form.sign > 0 ? "Credit added. The student has been emailed." : "Balance reduced."); setForm(null);
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }
  return (
    <section>
      <SectionTitle aside={canAdjust && !form && !s.anonymizedAt ? <button type="button" onClick={() => setForm({ currency: "PKR", sign: 1, amount: "", note: "" })} className="text-xs font-medium text-ink underline-offset-4 hover:underline">Adjust balance</button> : undefined}>POINT B balance</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {(["PKR", "GBP"] as const).map((c) => <div key={c} className={`rounded-2xl px-4 py-3 ${balances[c] > 0 ? "bg-mint/50" : "bg-paper"}`}><p className="text-[11px] text-ink-soft">{c === "PKR" ? "Local · PKR" : "International · GBP"}</p><p className="mt-0.5 font-display text-2xl text-ink tabular-nums">{formatMoney(balances[c], c)}</p></div>)}
      </div>
      {form && (
        <div className="mt-3 space-y-2 rounded-2xl bg-paper p-4">
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-full bg-white p-1 text-xs ring-1 ring-line">{([[1, "Add credit"], [-1, "Remove"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setForm({ ...form, sign: v })} className={`rounded-full px-3 py-1.5 font-medium ${form.sign === v ? "bg-ink text-white" : "text-ink-soft"}`}>{l}</button>)}</div>
            <div className="flex rounded-full bg-white p-1 text-xs ring-1 ring-line">{(["PKR", "GBP"] as const).map((c) => <button key={c} type="button" onClick={() => setForm({ ...form, currency: c })} className={`rounded-full px-3 py-1.5 font-medium ${form.currency === c ? "bg-ink text-white" : "text-ink-soft"}`}>{c}</button>)}</div>
            <input className="input w-32 bg-white" style={{ width: "8rem" }} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder={form.currency === "PKR" ? "Rs" : "£"} aria-label="Amount" />
          </div>
          <input className="input bg-white" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={form.sign > 0 ? "Reason, shown to the student, e.g. Goodwill credit for the late start" : "Reason, for the record"} aria-label="Reason" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setForm(null)}>Cancel</Button>
            <Button size="sm" disabled={busy || !(Number(form.amount) > 0) || form.note.trim().length < 3} onClick={save}>{busy ? <Spinner /> : form.sign > 0 ? `Add ${form.amount ? formatMoney(Math.round(Number(form.amount) * 100), form.currency) : "credit"}` : "Remove"}</Button>
          </div>
        </div>
      )}
      {entries.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">{entries.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0"><span className="block text-ink">{WALLET_LABEL[e.kind] ?? e.kind}</span><span className="block truncate text-xs text-ink-soft">{fmtDay(e.createdAt).replace(/^\w+, /, "")}{e.reference ? ` · ${e.reference}` : ""}{e.note ? ` · ${e.note}` : ""}</span></span>
            <span className={`whitespace-nowrap tabular-nums ${e.amountMinor > 0 ? "text-forest" : "text-ink"}`}>{e.amountMinor > 0 ? "+" : "−"}{formatMoney(Math.abs(e.amountMinor), e.currency)}</span>
          </li>
        ))}</ul>
      )}
    </section>
  );
}
