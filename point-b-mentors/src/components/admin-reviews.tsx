"use client";

import { useMemo, useState } from "react";
import { Alert, Button, EmptyState, FilterChips, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { Panel } from "@/components/dashboard";
import { useToast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { fmtDay, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface AdminReview {
  id: string; rating: number; comment: string; status: "APPROVED" | "HIDDEN" | "PENDING"; moderatedAt: string | null; moderatedBy: "ADMIN" | "MENTOR" | null; editedAt: string | null; createdAt: string;
  reference: string; sessionAt: string; studentName: string; mentorName: string; mentorSlug: string;
}

const FILTERS = [["PENDING", "Waiting for approval"], ["APPROVED", "Public"], ["HIDDEN", "Private"], ["low", "3 stars or fewer"], ["all", "All"]] as const;
type Filter = (typeof FILTERS)[number][0];

/**
 * All student feedback. Only the POINT B team decides what is published: new feedback waits here until an admin
 * approves it for the mentor's public profile or keeps it private. Mentors can read it but not change it.
 */
export function Reviews({ onChanged }: { onChanged?: () => void }) {
  const list = useApi<AdminReview[]>("/admin/reviews");
  const all = useMemo(() => list.data ?? [], [list.data]);
  const waiting = all.filter((r) => r.status === "PENDING").length;
  const [chosen, setFilter] = useState<Filter | null>(null);
  const filter: Filter = chosen ?? (waiting ? "PENDING" : "all");
  const rows = useMemo(() => all.filter((r) => filter === "all" ? true : filter === "low" ? r.rating <= 3 : r.status === filter), [all, filter]);
  const published = all.filter((r) => r.status === "APPROVED");
  const avg = published.length ? published.reduce((n, r) => n + r.rating, 0) / published.length : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Waiting for approval", String(waiting), waiting ? "bg-lemon/70" : "bg-white ring-1 ring-line"], ["Public", String(published.length), "bg-white ring-1 ring-line"], ["Private", String(all.filter((r) => r.status === "HIDDEN").length), "bg-white ring-1 ring-line"], ["Public rating", avg ? `${avg.toFixed(1)} ★` : "—", "bg-mint/60"]] as const).map(([k, v, tone]) => (
          <div key={k} className={`rounded-3xl p-5 ${tone}`}><p className="text-sm text-ink/70">{k}</p><p className="mt-2 font-display text-4xl leading-none text-ink">{v}</p></div>
        ))}
      </div>
      <Panel title="Feedback">
        <p className="-mt-2 mb-4 text-sm text-ink-soft">Only the POINT B team decides what is published. Approve fair, genuine feedback, including critical feedback. Keep it private only if it breaks the rules: abuse, personal details, or nothing to do with the session.</p>
        <FilterChips className="mb-4" options={FILTERS} value={filter} onChange={setFilter} counts={{ PENDING: waiting }} highlight="PENDING" label="Filter feedback" />
        {list.loading ? <Skeleton className="h-48 rounded-2xl" /> : list.error ? <Alert>{list.error}</Alert> : !rows.length ? <EmptyState title={filter === "PENDING" ? "Nothing waiting" : "No feedback here"} description={filter === "PENDING" ? "New feedback from mentees appears here for approval." : "Try another filter."} /> : (
          <ul className="space-y-3">{rows.map((r) => <ReviewCard key={r.id} r={r} onChanged={(next) => { list.setData(next); onChanged?.(); }} />)}</ul>
        )}
      </Panel>
    </div>
  );
}

const STATE: Record<AdminReview["status"], [string, string]> = { PENDING: ["Waiting for approval", "bg-lemon text-ink"], APPROVED: ["Public", "bg-mint text-forest"], HIDDEN: ["Private", "bg-paper-dim text-ink"] };

function ReviewCard({ r, onChanged }: { r: AdminReview; onChanged: (rows: AdminReview[]) => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | "APPROVED" | "HIDDEN">(null);

  async function save(status: "APPROVED" | "HIDDEN") {
    setBusy(status);
    try {
      onChanged(await api<AdminReview[]>(`/admin/reviews/${r.id}`, { method: "PATCH", body: { status, note: note || undefined } }));
      toast(status === "APPROVED" ? `Published on ${r.mentorName.split(" ")[0]}'s profile.` : "Kept private. The mentor can still read it.");
    } catch (e) { toast(errMsg(e), "error"); setBusy(null); }
  }

  return (
    <li className={`rounded-2xl p-4 ring-1 sm:p-5 ${r.status === "PENDING" ? "ring-amber/30" : "ring-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-ink" style={{ backgroundColor: pastelFor(r.studentName) }}>{initials(r.studentName)}</span>
          <div className="min-w-0">
            <p className="text-sm text-ink"><span className="font-medium">{r.studentName}</span> <span className="text-ink-soft">on</span> <a href={`/mentors/${r.mentorSlug}`} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline">{r.mentorName}</a></p>
            <p className="text-xs text-ink-soft">Session {fmtDay(r.sessionAt).replace(/^\w+, /, "")} · <span className="whitespace-nowrap font-mono">{r.reference}</span> · sent {fmtDay(r.createdAt).replace(/^\w+, /, "")}{r.editedAt ? ` · edited by the mentee ${fmtDay(r.editedAt).replace(/^\w+, /, "")}` : ""}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE[r.status][1]}`}>{STATE[r.status][0]}</span>
      </div>
      <p className="mt-3 text-lg leading-none tracking-wide" aria-label={`${r.rating} out of 5 stars`}><span className="text-brass">{"★".repeat(r.rating)}</span><span className="text-line">{"★".repeat(5 - r.rating)}</span></p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{r.comment}</p>
      {r.moderatedAt && r.status !== "PENDING" && <p className="mt-2 text-xs text-ink-soft">{r.moderatedBy === "MENTOR" ? "Set by the mentor" : "Decided by POINT B"} on {fmtDay(r.moderatedAt).replace(/^\w+, /, "")}</p>}

      <div className="mt-4 border-t border-line pt-3">
        {confirming ? (
          <div className="space-y-2">
            <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Why it's being kept private, for the audit log" aria-label="Reason" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirming(false)}>Cancel</Button>
              <Button size="sm" variant="danger" disabled={!!busy} onClick={() => save("HIDDEN")}>{busy === "HIDDEN" ? <Spinner /> : "Keep private"}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {r.status !== "HIDDEN" && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setConfirming(true)}>{r.status === "APPROVED" ? "Make private" : "Keep private"}</Button>}
            {r.status !== "APPROVED" && <Button size="sm" disabled={!!busy} onClick={() => save("APPROVED")}>{busy === "APPROVED" ? <Spinner /> : r.status === "PENDING" ? "Approve and publish" : "Publish"}</Button>}
          </div>
        )}
      </div>
    </li>
  );
}
