"use client";

import { useMemo, useState } from "react";
import { Alert, Button, EmptyState, FilterChips, MentorPhoto, Skeleton, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Currency } from "@/lib/types";

type State = "ACTIVE" | "PAUSED" | "EXPIRED" | "USED_UP";
interface Referral {
  id: string; code: string; percentOff: number; note: string; maxUses: number | null; expiresAt: string | null; createdAt: string; state: State;
  uses: number; bookings: number; lastUsedAt: string | null;
  totals: Partial<Record<Currency, { paidMinor: number; discountMinor: number; mentorMinor: number }>>;
  mentor: { id: string; slug: string; name: string; title: string; photoUrl: string | null; level: string } | null;
}
interface MentorOption { id: string; slug: string; status: string; photoUrl: string | null; title: string; priceMinor?: number; currency?: Currency; user: { name: string } }

const STATE: Record<State, [string, string]> = {
  ACTIVE: ["Active", "bg-mint text-forest"],
  PAUSED: ["Paused", "bg-paper-dim text-ink-soft"],
  EXPIRED: ["Ended", "bg-paper-dim text-ink-soft"],
  USED_UP: ["Limit reached", "bg-lemon text-ink"],
};
const FILTERS = [["all", "All"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["ended", "Ended"]] as const;
type Filter = (typeof FILTERS)[number][0];
const QUICK = [5, 10, 15, 20, 25];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const sumBy = (rows: Referral[], key: "discountMinor" | "paidMinor" | "mentorMinor") => {
  const out: Partial<Record<Currency, number>> = {};
  for (const r of rows) for (const [c, t] of Object.entries(r.totals) as [Currency, { paidMinor: number; discountMinor: number; mentorMinor: number }][]) out[c] = (out[c] ?? 0) + t[key];
  return out;
};
const moneyList = (m: Partial<Record<Currency, number>>) => {
  const parts = (Object.entries(m) as [Currency, number][]).filter(([, v]) => v).map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" · ") : "—";
};

/**
 * Company referral codes. The team makes a code for one mentor, the mentor shares it, and every student who books with
 * it saves the discount. The mentor is still paid their full fee: POINT B covers the discount out of its own fee.
 */
export function ReferralCodes() {
  const list = useApi<Referral[]>("/admin/referral-codes");
  const mentors = useApi<MentorOption[]>("/admin/mentors");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = all.filter((r) => (filter === "all" ? true : filter === "ended" ? r.state === "EXPIRED" || r.state === "USED_UP" : r.state === filter));
  const active = all.filter((r) => r.state === "ACTIVE").length;
  const bookings = all.reduce((n, r) => n + r.bookings, 0);

  return (
    <div className="space-y-6">
      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Active codes", String(active), "bg-mint/60"],
          ["Paid bookings", String(bookings), "bg-sky/60"],
          ["Mentees saved", moneyList(sumBy(all, "discountMinor")), "bg-peach/60"],
          ["Mentors earned", moneyList(sumBy(all, "mentorMinor")), "bg-lilac/60"],
        ] as const).map(([k, v, tone]) => (
          <div key={k} className={`rounded-3xl p-5 ${tone}`}>
            <p className="text-sm text-ink/70">{k}</p>
            <p className={`mt-2 font-display leading-none text-ink ${v.length > 12 ? "text-2xl" : "text-4xl"}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="overflow-hidden rounded-3xl bg-ink text-white">
        <div className="grid gap-px bg-white/10 md:grid-cols-[1.1fr_repeat(3,1fr)]">
          <div className="bg-ink p-6 sm:p-7">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-lime">Company referral codes</p>
            <p className="mt-3 font-display text-2xl leading-tight sm:text-[1.7rem]">Mentees save. Mentors are paid in full.</p>
            {!creating && <Button variant="light" size="sm" className="mt-5" onClick={() => setCreating(true)}>+ New referral code</Button>}
          </div>
          {[
            ["1", "Make a code for a mentor", "Choose the mentor and the discount. We suggest a code from their name, like DENIS10."],
            ["2", "The mentor shares it", "They see it on their dashboard with a link that fills in the code at checkout."],
            ["3", "POINT B covers the discount", "The mentee pays less, and the mentor's pay is worked out on the full price."],
          ].map(([n, t, d]) => (
            <div key={n} className="bg-ink p-6 sm:p-7">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-display text-lg text-lime">{n}</span>
              <p className="mt-4 font-medium">{t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/65">{d}</p>
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <CreateCode mentors={(mentors.data ?? []).filter((m) => m.status === "ACTIVE")} loading={mentors.loading}
          onCancel={() => setCreating(false)} onCreated={(next) => { list.setData(next); setCreating(false); setFilter("all"); }} />
      )}

      <div className="rounded-3xl bg-white p-6 ring-1 ring-line sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-ink">Codes</h2>
          <FilterChips options={FILTERS} value={filter} onChange={setFilter} label="Filter codes" />
        </div>
        {list.loading ? <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-56 rounded-3xl" /></div>
          : list.error ? <Alert>{list.error}</Alert>
          : !rows.length ? <EmptyState title={all.length ? "No codes here" : "No referral codes yet"} description={all.length ? "Try another filter." : "Make the first one for a mentor. They can share it with mentees straight away."} />
          : <div className="grid gap-4 lg:grid-cols-2">{rows.map((r) => <CodeCard key={r.id} r={r} onChanged={list.setData} />)}</div>}
      </div>
    </div>
  );
}

function CreateCode({ mentors, loading, onCancel, onCreated }: { mentors: MentorOption[]; loading: boolean; onCancel: () => void; onCreated: (rows: Referral[]) => void }) {
  const toast = useToast();
  const [mentorId, setMentorId] = useState("");
  const [query, setQuery] = useState("");
  const [percent, setPercent] = useState(10);
  const [code, setCode] = useState("");
  const [limit, setLimit] = useState("");
  const [ends, setEnds] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mentor = mentors.find((m) => m.id === mentorId);
  const first = mentor?.user.name.split(" ").find((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w)) ?? "";
  const suggestion = mentor ? `${first.toUpperCase().replace(/[^A-Z0-9]/g, "")}${percent}` : "";
  const matches = mentors.filter((m) => !query.trim() || `${m.user.name} ${m.title}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);

  async function save() {
    if (!mentorId) { setError("Choose a mentor first."); return; }
    setBusy(true); setError(null);
    try {
      const rows = await api<Referral[]>("/admin/referral-codes", { body: {
        mentorId, percentOff: percent, code: code.trim() || undefined, note: note.trim() || undefined,
        maxUses: limit ? Number(limit) : undefined, expiresAt: ends ? new Date(`${ends}T23:59:59`).toISOString() : undefined,
      } });
      toast(`Referral code ${rows[0]?.code ?? ""} is live for ${mentor?.user.name}.`);
      onCreated(rows);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <div className="animate-rise overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="grid lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl text-ink">New referral code</h3>
              <p className="mt-1 text-sm text-ink-soft">The mentor is paid their full fee on every booking made with it.</p>
            </div>
            <button type="button" onClick={onCancel} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Mentor</p>
            {mentor ? (
              <div className="flex items-center gap-3 rounded-2xl bg-paper/70 p-3 ring-1 ring-line">
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full"><MentorPhoto name={mentor.user.name} photoUrl={mentor.photoUrl} className="h-full w-full" initialsClass="text-sm" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{mentor.user.name}</span><span className="block truncate text-xs text-ink-soft">{mentor.title}</span></span>
                <button type="button" onClick={() => { setMentorId(""); setCode(""); }} className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft ring-1 ring-line hover:text-ink">Change</button>
              </div>
            ) : (
              <div className="rounded-2xl ring-1 ring-line">
                <input className="w-full rounded-t-2xl bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-soft/60" placeholder="Search mentors by name or role" value={query} onChange={(e) => setQuery(e.target.value)} />
                <ul className="max-h-64 overflow-y-auto border-t border-line">
                  {loading ? <li className="p-4"><Skeleton className="h-10" /></li> : !matches.length ? <li className="p-4 text-sm text-ink-soft">No active mentors match.</li> : matches.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => setMentorId(m.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper/70">
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full"><MentorPhoto name={m.user.name} photoUrl={m.photoUrl} className="h-full w-full" initialsClass="text-xs" /></span>
                        <span className="min-w-0"><span className="block truncate text-sm text-ink">{m.user.name}</span><span className="block truncate text-xs text-ink-soft">{m.title}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between"><p className="text-sm font-medium text-ink">Mentee discount</p><p className="font-display text-2xl leading-none text-ink">{percent}%</p></div>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((p) => (
                <button key={p} type="button" onClick={() => setPercent(p)} aria-pressed={percent === p}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${percent === p ? "bg-ink text-white" : "bg-paper text-ink ring-1 ring-line hover:ring-ink/30"}`}>{p}%</button>
              ))}
              <label className="flex items-center gap-1.5 rounded-full bg-paper px-3 ring-1 ring-line">
                <span className="text-xs text-ink-soft">Other</span>
                <input type="number" min={1} max={50} value={QUICK.includes(percent) ? "" : percent} onChange={(e) => setPercent(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-12 bg-transparent py-2 text-sm text-ink outline-none" aria-label="Other discount" />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Code</span>
              <input className="input font-mono uppercase tracking-wider" placeholder={suggestion || "Chosen from the name"} value={code} maxLength={20} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
              <span className="mt-1 block text-xs text-ink-soft">Leave empty to use {suggestion || "one made from the mentor's name"}.</span>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Note for the team <span className="font-normal text-ink-soft">(optional)</span></span>
              <input className="input" placeholder="e.g. LinkedIn campaign, March" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Limit <span className="font-normal text-ink-soft">(optional)</span></span>
              <input className="input" type="number" min={1} placeholder="No limit" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} />
              <span className="mt-1 block text-xs text-ink-soft">Total bookings allowed. Each mentee can use it once.</span>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Ends on <span className="font-normal text-ink-soft">(optional)</span></span>
              <input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={ends} onChange={(e) => setEnds(e.target.value)} />
            </label>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || !mentorId}>{busy ? <Spinner /> : "Create code"}</Button>
          </div>
        </div>

        {/* Live preview of the money */}
        <aside className="border-t border-line bg-paper/60 p-6 sm:p-7 lg:border-l lg:border-t-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">Preview</p>
          <div className="mt-4 rounded-2xl bg-white p-5 shadow-[0_18px_40px_-28px_rgba(17,17,17,0.4)] ring-1 ring-line">
            <p className="font-mono text-2xl font-semibold tracking-[0.12em] text-ink">{code || suggestion || "CODE10"}</p>
            <p className="mt-1 text-sm text-ink-soft">{percent}% off a 1:1 with {mentor?.user.name ?? "this mentor"}</p>
          </div>
          {mentor && <Example mentor={mentor} percent={percent} />}
          <p className="mt-5 text-xs leading-relaxed text-ink-soft">Works for 1:1 sessions. Each mentee can use a code once. You can pause it at any time.</p>
        </aside>
      </div>
    </div>
  );
}

function Example({ mentor, percent }: { mentor: MentorOption; percent: number }) {
  if (!mentor.priceMinor || !mentor.currency) return null;
  const price = mentor.priceMinor, off = Math.round((price * percent) / 100 / 100) * 100;
  return (
    <dl className="mt-4 space-y-2 rounded-2xl bg-white p-5 text-sm ring-1 ring-line">
      <div className="flex justify-between gap-3"><dt className="text-ink-soft">Session price</dt><dd className="tabular-nums text-ink">{formatMoney(price, mentor.currency)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-ink-soft">Mentee pays</dt><dd className="tabular-nums font-medium text-ink">{formatMoney(price - off, mentor.currency)}</dd></div>
      <div className="flex justify-between gap-3 border-t border-dashed border-line pt-2"><dt className="text-ink-soft">Mentor is paid on</dt><dd className="tabular-nums font-medium text-forest">{formatMoney(price, mentor.currency)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-ink-soft">POINT B covers</dt><dd className="tabular-nums text-ink">{formatMoney(off, mentor.currency)}</dd></div>
    </dl>
  );
}

function CodeCard({ r, onChanged }: { r: Referral; onChanged: (rows: Referral[]) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link = r.mentor ? `${typeof window !== "undefined" ? window.location.origin : ""}/mentors/${r.mentor.slug}?code=${r.code}` : "";
  const copy = (what: "code" | "link") => {
    navigator.clipboard?.writeText(what === "code" ? r.code : link).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1500); }).catch(() => undefined);
  };
  async function toggle() {
    setBusy(true);
    try { onChanged(await api<Referral[]>(`/admin/referral-codes/${r.id}`, { method: "PATCH", body: { paused: r.state !== "PAUSED" } })); toast(r.state === "PAUSED" ? `${r.code} is active again.` : `${r.code} is paused.`); }
    catch (e) { toast(errMsg(e), "error"); }
    setBusy(false);
  }
  const live = r.state === "ACTIVE";
  const usage = r.maxUses ? Math.min(100, Math.round((r.uses / r.maxUses) * 100)) : null;

  return (
    <article className={`group relative overflow-hidden rounded-3xl p-5 ring-1 transition-shadow hover:shadow-[0_20px_44px_-30px_rgba(17,17,17,0.45)] sm:p-6 ${live ? "bg-white ring-line" : "bg-paper/50 ring-line/70"}`}>
      {/* Ticket notches */}
      <span aria-hidden className="absolute -left-3 top-[5.25rem] h-6 w-6 rounded-full bg-paper ring-1 ring-line" />
      <span aria-hidden className="absolute -right-3 top-[5.25rem] h-6 w-6 rounded-full bg-paper ring-1 ring-line" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-white">{r.mentor && <MentorPhoto name={r.mentor.name} photoUrl={r.mentor.photoUrl} className="h-full w-full" initialsClass="text-sm" />}</span>
          <span className="min-w-0">
            <a href={r.mentor ? `/mentors/${r.mentor.slug}` : "#"} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink underline-offset-4 hover:underline">{r.mentor?.name ?? "Mentor removed"}</a>
            <span className="block truncate text-xs text-ink-soft">{r.note || r.mentor?.title}</span>
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE[r.state][1]}`}>{STATE[r.state][0]}</span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3 border-b border-dashed border-line pb-5">
        <button type="button" onClick={() => copy("code")} className="group/code text-left" title="Copy code">
          <span className={`block font-mono text-[1.7rem] font-semibold leading-none tracking-[0.12em] ${live ? "text-ink" : "text-ink-soft"}`}>{r.code}</span>
          <span className="mt-1.5 block text-xs text-ink-soft">{copied === "code" ? "Copied" : "Click to copy"}</span>
        </button>
        <span className={`rounded-2xl px-3 py-2 text-center ${live ? "bg-lime/40" : "bg-paper-dim"}`}>
          <span className="block font-display text-2xl leading-none text-ink">{r.percentOff}%</span>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-ink-soft">off</span>
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-ink-soft">Bookings</dt><dd className="mt-0.5 font-medium tabular-nums text-ink">{r.bookings}{r.maxUses ? <span className="text-ink-soft"> / {r.maxUses}</span> : null}</dd></div>
        <div><dt className="text-xs text-ink-soft">Mentees saved</dt><dd className="mt-0.5 truncate font-medium tabular-nums text-ink">{moneyList(sumBy([r], "discountMinor"))}</dd></div>
        <div><dt className="text-xs text-ink-soft">Mentor earned</dt><dd className="mt-0.5 truncate font-medium tabular-nums text-forest">{moneyList(sumBy([r], "mentorMinor"))}</dd></div>
      </dl>
      {usage !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-dim"><div className="h-full rounded-full bg-forest transition-all" style={{ width: `${usage}%` }} /></div>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">{r.expiresAt ? `${r.state === "EXPIRED" ? "Ended" : "Ends"} ${day(r.expiresAt)}` : "No end date"} · made {day(r.createdAt)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => copy("link")} disabled={!link} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line transition-colors hover:ring-ink/30">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            {copied === "link" ? "Link copied" : "Copy share link"}
          </button>
          {(r.state === "ACTIVE" || r.state === "PAUSED") && (
            <button type="button" onClick={toggle} disabled={busy} className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-ink hover:ring-ink/30">
              {busy ? <Spinner /> : r.state === "PAUSED" ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
