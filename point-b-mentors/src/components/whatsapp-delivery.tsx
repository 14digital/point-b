"use client";

import { useEffect } from "react";
import { Alert, Skeleton } from "./ui";
import { Panel } from "./dashboard";
import { fmtTime } from "@/lib/format";
import { formatPhone } from "./phone-input";
import { useApi } from "@/lib/use-api";

interface Row { id: string; name: string | null; phone: string; title: string; template: string; status: string; errorCode: number | null; errorTitle: string | null; errorDetail: string | null; createdAt: string; updatedAt: string }
interface Data { enabled: boolean; counts: Record<string, number>; lastUpdate: string | null; rows: Row[] }

const STATUS: Record<string, { label: string; tone: string }> = {
  read: { label: "Read", tone: "bg-mint" },
  delivered: { label: "Delivered", tone: "bg-mint" },
  sent: { label: "Sent", tone: "bg-sky" },
  accepted: { label: "Accepted, waiting", tone: "bg-paper-dim" },
  failed: { label: "Failed", tone: "bg-rust-pale" },
  rejected: { label: "Rejected", tone: "bg-rust-pale" },
};

/** What Meta's error codes mean in practice. */
const REASONS: Record<number, string> = {
  131049: "Meta held this back to limit how many template messages one person gets. Usually a marketing-category template: try again later, or use a utility template.",
  131056: "Too many messages to this number in a short time. Send more slowly.",
  131026: "The number can't receive this: it may not be on WhatsApp, or hasn't accepted WhatsApp's latest terms.",
  131030: "This number isn't on the allowed list for Meta's test number. Add it in WhatsApp > API Setup.",
  131047: "Outside the 24-hour window, so an approved template is required.",
  131042: "A payment problem on the WhatsApp Business account.",
  131031: "The WhatsApp Business account has been restricted.",
  130429: "The account's sending speed limit was reached.",
  130472: "Meta held this back as part of an experiment on this number.",
  132000: "The message's fields don't match the template.",
  132001: "This template doesn't exist in this language, or isn't approved.",
  132015: "The template is paused because of low quality.",
  132016: "The template has been disabled because of low quality.",
  190: "The WhatsApp access token has expired. Add a new one.",
};

export function WhatsAppDelivery() {
  const { data, loading, error, reload } = useApi<Data>("/admin/whatsapp/messages");

  useEffect(() => {
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <Panel title="WhatsApp delivery" action={<span className="text-xs text-ink-soft">Latest 50 · refreshes by itself</span>}>
      {error ? <Alert>{error}</Alert> : !data && loading ? <Skeleton className="h-32" /> : data && (
        <>
          {!data.enabled && <div className="mb-4"><Alert tone="info">WhatsApp isn&rsquo;t configured, so messages are only being logged.</Alert></div>}
          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(STATUS).filter(([k]) => data.counts[k]).map(([k, s]) => (
              <span key={k} className={`rounded-full px-3 py-1.5 text-xs font-medium text-ink ${s.tone}`}>{s.label}: {data.counts[k]}</span>
            ))}
          </div>
          {data.rows.length === 0 ? <p className="py-8 text-center text-sm text-ink-soft">No WhatsApp messages recorded yet.</p> : (
            <ul className="divide-y divide-line">
              {data.rows.map((r) => {
                const s = STATUS[r.status] ?? { label: r.status, tone: "bg-paper-dim" };
                const reason = r.errorCode != null ? REASONS[r.errorCode] : null;
                return (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{r.title}</p>
                        <p className="text-xs text-ink-soft">{r.name ? `${r.name} · ` : ""}{formatPhone(r.phone)} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {fmtTime(r.createdAt)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink ${s.tone}`}>{s.label}</span>
                    </div>
                    {(r.errorCode != null || r.errorTitle) && (
                      <p className="mt-1.5 rounded-xl bg-rust-pale/60 px-3 py-2 text-xs leading-relaxed text-ink">
                        {reason ?? r.errorTitle}{r.errorCode != null && <span className="text-ink-soft"> (Meta error {r.errorCode}{reason && r.errorTitle ? `: ${r.errorTitle}` : ""})</span>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {data.rows.some((r) => r.status === "accepted") && !data.lastUpdate && (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">No delivery updates from Meta yet. Check that the webhook is set up in your Meta app, with the &ldquo;messages&rdquo; field subscribed.</p>
          )}
        </>
      )}
    </Panel>
  );
}
