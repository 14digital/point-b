"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Spinner } from "@/components/ui";
import { Panel } from "@/components/dashboard";
import { useToast } from "@/components/toast";
import { api, apiObjectUrl, errMsg } from "@/lib/api";
import { fmtDay, fmtTime, formatMoney } from "@/lib/format";
import { useApi, useNow } from "@/lib/use-api";
import type { Currency } from "@/lib/types";

interface BankTransfer {
  id: string; amountMinor: number; currency: Currency; txnRef: string | null; senderName: string | null; submittedAt: string;
  reference: string; startAt: string; bookedAt: string; studentName: string; studentEmail: string; studentPhone: string | null; mentorName: string; hasProof: boolean;
  checks: { proofReusedIn: string[]; txnReusedIn: string[]; senderMatchesStudent: boolean | null; sessionStartsSoon: boolean };
}

const REASONS = [
  "No matching transfer found in our account.",
  "The amount received is different from the session price.",
  "This receipt was already used for another booking.",
  "The receipt is unreadable. Please send a clearer screenshot.",
];

const waited = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`;
};

/** Bank / QR transfers students have sent receipts for, waiting to be matched against the account statement. */
export function BankTransfers() {
  const list = useApi<BankTransfer[]>("/payments/admin/bank-transfers");
  if (!list.data?.length) return null;
  return (
    <Panel title="Bank payments to verify" action={<span className="rounded-full bg-lemon px-3 py-1 text-xs font-medium text-ink">{list.data.length} waiting</span>}>
      <p className="-mt-2 mb-5 text-sm text-ink-soft">Open your bank or wallet app and find each transfer by amount, time and transaction ID. The checks below are done automatically to help you spot problems.</p>
      <ul className="space-y-4">{list.data.map((t) => <TransferCard key={t.id} t={t} onDone={(rows) => list.setData(rows)} />)}</ul>
    </Panel>
  );
}

function TransferCard({ t, onDone }: { t: BankTransfer; onDone: (rows: BankTransfer[]) => void }) {
  const toast = useToast();
  const now = useNow();
  const [img, setImg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!t.hasProof) return;
    let url: string | null = null, alive = true;
    apiObjectUrl(`/payments/admin/bank-transfers/${t.id}/proof`).then((u) => { url = u; if (alive) setImg(u); else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [t.id, t.hasProof]);

  const flags = [
    t.checks.txnReusedIn.length > 0 && `Transaction ID already used on ${t.checks.txnReusedIn.join(", ")}`,
    t.checks.proofReusedIn.length > 0 && `Same screenshot as ${t.checks.proofReusedIn.join(", ")}`,
  ].filter(Boolean) as string[];
  const hours = (now - new Date(t.submittedAt).getTime()) / 3_600_000;

  async function act(kind: "approve" | "reject") {
    setBusy(true);
    try {
      onDone(await api<BankTransfer[]>(`/payments/admin/bank-transfers/${t.id}/${kind}`, { body: kind === "reject" ? { reason } : {} }));
      toast(kind === "approve" ? `Approved. ${t.studentName.split(" ")[0]}'s booking is confirmed and both sides have been notified.` : "Rejected. The slot is released and the student has been told why.");
    } catch (e) { toast(errMsg(e), "error"); setBusy(false); }
  }

  return (
    <li className={`overflow-hidden rounded-2xl ring-1 ${flags.length ? "ring-rust/40" : "ring-line"}`}>
      <div className="grid gap-5 p-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:p-5">
        <button type="button" onClick={() => img && setZoom(true)} disabled={!img} aria-label="View receipt full size"
          className="group relative mx-auto h-40 w-[7.5rem] overflow-hidden rounded-xl bg-paper ring-1 ring-line sm:mx-0">
          {img ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt={`Receipt from ${t.studentName}`} className="h-full w-full object-cover object-top" />
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">View full size</span>
          </> : <span className="flex h-full items-center justify-center px-2 text-center text-xs text-ink-soft">{t.hasProof ? <Spinner /> : "No screenshot (sent before receipts were required)"}</span>}
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-3xl leading-none tabular-nums text-ink">{formatMoney(t.amountMinor, t.currency)}</p>
              <p className="mt-2 text-sm text-ink">{t.studentName} <span className="text-ink-soft">· with {t.mentorName}</span></p>
              <p className="text-xs text-ink-soft">{t.studentEmail}{t.studentPhone ? ` · ${t.studentPhone}` : ""}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${hours >= 4 ? "bg-rust-pale text-rust" : hours >= 1 ? "bg-lemon text-ink" : "bg-paper text-ink-soft"}`}>Waiting {waited(t.submittedAt, now)}</span>
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Fact k="Transaction ID" v={t.txnRef ? <span className="font-mono">{t.txnRef}</span> : <span className="text-ink-soft">Not given, check the screenshot</span>} />
            <Fact k="Booking reference" v={<span className="font-mono">{t.reference}</span>} />
            <Fact k="Sent from" v={t.senderName ?? <span className="text-ink-soft">Not given</span>} />
            <Fact k="Submitted" v={`${fmtDay(t.submittedAt).replace(/^\w+, /, "")}, ${fmtTime(t.submittedAt)}`} />
            <Fact k="Session" v={`${fmtDay(t.startAt).replace(/^\w+, /, "")}, ${fmtTime(t.startAt)}`} />
          </dl>

          <ul className="mt-4 flex flex-wrap gap-1.5 text-xs">
            <Check ok={!t.checks.txnReusedIn.length} text={t.txnRef ? (t.checks.txnReusedIn.length ? `ID used on ${t.checks.txnReusedIn.join(", ")}` : "Transaction ID not used before") : "No transaction ID"} neutral={!t.txnRef} />
            {t.hasProof && <Check ok={!t.checks.proofReusedIn.length} text={t.checks.proofReusedIn.length ? `Screenshot reused from ${t.checks.proofReusedIn.join(", ")}` : "Screenshot not seen before"} />}
            {t.checks.senderMatchesStudent != null && <Check ok={t.checks.senderMatchesStudent} warn text={t.checks.senderMatchesStudent ? "Sender name matches student" : "Sender name differs (could be family)"} />}
            {t.checks.sessionStartsSoon && <Check ok={false} warn text="Session is within 6 hours" />}
          </ul>
        </div>
      </div>

      <div className="border-t border-line bg-paper/50 px-4 py-3.5 sm:px-5">
        {mode === "reject" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Why couldn&rsquo;t it be verified? <span className="font-normal text-ink-soft">The student sees this.</span></p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full px-3 py-1.5 text-left text-xs transition-colors ${reason === r ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-line hover:ring-ink/40"}`}>{r.replace(/\.$/, "")}</button>)}
            </div>
            <textarea className="input min-h-16 bg-white" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or write your own reason" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setMode("idle"); setReason(""); }}>Cancel</Button>
              <Button size="sm" variant="danger" disabled={reason.trim().length < 5 || busy} onClick={() => act("reject")}>{busy ? <Spinner /> : "Reject and release slot"}</Button>
            </div>
          </div>
        ) : mode === "approve" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">{flags.length ? <span className="text-rust">{flags.join(". ")}. </span> : null}Approve only if you can see <span className="font-medium">{formatMoney(t.amountMinor, t.currency)}</span> arrive in your account.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode("idle")}>Cancel</Button>
              <Button size="sm" disabled={busy} onClick={() => act("approve")}>{busy ? <Spinner /> : flags.length ? "Approve anyway" : "Yes, the money arrived"}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">Look for {formatMoney(t.amountMinor, t.currency)}{t.txnRef ? <> with ID <span className="font-mono text-ink">{t.txnRef}</span></> : null}, sent around {fmtTime(t.submittedAt)}.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setMode("reject")}>Reject</Button>
              <Button size="sm" onClick={() => setMode("approve")}>Approve and confirm</Button>
            </div>
          </div>
        )}
      </div>

      {zoom && img && <Lightbox src={img} alt={`Receipt from ${t.studentName}`} onClose={() => setZoom(false)} />}
    </li>
  );
}

const Fact = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-line/70 pb-1.5"><dt className="text-ink-soft">{k}</dt><dd className="min-w-0 truncate text-right text-ink">{v}</dd></div>
);

function Check({ ok, text, warn = false, neutral = false }: { ok: boolean; text: string; warn?: boolean; neutral?: boolean }) {
  const tone = neutral ? "bg-paper text-ink-soft" : ok ? "bg-mint/70 text-forest" : warn ? "bg-lemon text-ink" : "bg-rust-pale text-rust";
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tone}`}>
      {neutral ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        : ok ? <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 6v5M10 14v.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>}
      {text}
    </li>
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={alt}>
      <button aria-label="Close" className="absolute inset-0 cursor-zoom-out bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="relative max-h-[90dvh] max-w-full rounded-2xl bg-white object-contain shadow-2xl" />
      <button onClick={onClose} aria-label="Close" autoFocus className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink hover:bg-white">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </div>,
    document.body,
  );
}
