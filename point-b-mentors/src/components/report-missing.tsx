"use client";

import { useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";

/** Lets a student report that the mentor never joined. The POINT B team reviews it before any refund. */
export function ReportMissing({ reference, mentorName, onDone, label = "My mentor didn't join" }: { reference: string; mentorName: string; onDone: () => void; label?: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = mentorName.split(" ")[0];

  async function report() {
    setBusy(true); setError(null);
    try { await api(`/bookings/${reference}/report-mentor-missing`, { body: {} }); onDone(); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  if (!asking) return <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>{label}</Button>;
  return (
    <div className="w-full rounded-2xl bg-paper p-4 text-left">
      <p className="text-sm text-ink">Report that {first} didn&rsquo;t join? The POINT B team will check what happened. If it&rsquo;s confirmed, the full price is added to your POINT B balance.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>Not now</Button>
        <Button size="sm" disabled={busy} onClick={report}>{busy ? <Spinner /> : "Send report"}</Button>
      </div>
    </div>
  );
}

/** What the student sees once they've reported a session. */
export function ReportStatus({ status, note, mentorName }: { status?: string | null; note?: string | null; mentorName: string }) {
  const first = mentorName.split(" ")[0];
  if (status === "PENDING") return <p className="mt-3 rounded-2xl bg-lemon/60 px-4 py-3 text-sm text-ink">You reported that {first} didn&rsquo;t join. The POINT B team is reviewing it and will email you the outcome.</p>;
  if (status === "DECLINED") return <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-sm text-ink-soft">We reviewed your report and couldn&rsquo;t confirm that {first} didn&rsquo;t join, so no refund was issued.{note ? ` ${note}` : ""}</p>;
  return null;
}
