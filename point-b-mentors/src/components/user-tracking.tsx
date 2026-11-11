"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, Skeleton, pastelFor } from "./ui";
import { Panel, StatTile } from "./dashboard";
import { useToast } from "./toast";
import { api, errMsg } from "@/lib/api";
import { fmtDay, fmtTime, formatMoney, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Currency } from "@/lib/types";

type Kind = "awaiting_payment" | "payment_abandoned" | "payment_failed" | "bank_pending" | "booking_abandoned" | "guest_booking" | "application_abandoned" | "high_interest" | "never_booked" | "mentor_stuck";
interface Trigger { id: string; kind: Kind; severity: "high" | "medium" | "low"; userId: string; name: string; email: string; title: string; detail: string; at: string; reference?: string }
type Stage = { label: string; count: number; members: number; guests: number };
interface Overview { days: number; activeToday: number; guestsToday: number; liveNow: number; signInsToday: number; triggers: Trigger[]; dropOffs: { page: string; count: number }[]; funnel: Stage[] }
interface Person { id: string; name: string; email: string; role: string; lastSeen: string; events: number; lastPage: string | null }
interface Event { id: string; type: string; page: string | null; label: string | null; reference: string | null; createdAt: string }
interface Journey { user: { id: string; name: string; email: string; role: string; phone: string | null; createdAt: string }; events: Event[]; bookings: Record<string, number>; triggers: Trigger[]; device: string | null; referrer: string | null; ip: string | null; country: string | null; city: string | null }
type Money = { currency: Currency; amountMinor: number };
type Ranked = { label: string; count: number };
interface CountryRow { code: string; name: string; visitors: number; members: number; guests: number; visits: number; pageViews: number; bookings: number; payers: number; conversion: number; revenue: Money[]; cities: Ranked[] }
interface Visitor { id: string; name: string; email: string; role: string; ip: string | null; country: string; countryName: string; city: string | null; device: string | null; source: string | null; visits: number; pageViews: number; bookings: number; firstSeen: string; lastSeen: string; lastPage: string | null }
interface AudienceData {
  days: number;
  totals: { visitors: number; members: number; guests: number; returning: number; visits: number; pageViews: number; pagesPerVisit: number; avgVisitSeconds: number; countries: number; located: number; bookings: number; conversion: number; revenue: Money[] };
  countries: CountryRow[]; cities: { city: string; code: string; country: string; count: number }[]; devices: Ranked[]; browsers: Ranked[]; sources: Ranked[];
  pages: { page: string; views: number; people: number }[]; daily: { date: string; visitors: number; pageViews: number }[]; visitors: Visitor[];
}

const KINDS: Record<Kind, { label: string; tone: string }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "bg-lemon" },
  payment_abandoned: { label: "Didn't pay", tone: "bg-peach" },
  payment_failed: { label: "Payment failed", tone: "bg-rust-pale" },
  bank_pending: { label: "Bank transfer", tone: "bg-sky" },
  booking_abandoned: { label: "Stopped booking", tone: "bg-lilac" },
  guest_booking: { label: "Guest didn't sign up", tone: "bg-lilac" },
  application_abandoned: { label: "Mentor application", tone: "bg-sky" },
  high_interest: { label: "Keen, not booked", tone: "bg-mint" },
  never_booked: { label: "Never booked", tone: "bg-mint" },
  mentor_stuck: { label: "Mentor onboarding", tone: "bg-paper-dim" },
};

const VISIT_GAP = 30 * 60_000;
const ONLINE = 5 * 60_000;

const ago = (iso: string, now: number) => {
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
};

/** Turns a path into something readable: "/mentors/zainab-malik" -> "Mentor profile: zainab-malik". */
export function pageName(path: string | null) {
  if (!path) return "No page recorded yet";
  const fixed: Record<string, string> = {
    "/": "Home page", "/mentors": "Mentor directory", "/how-it-works": "How it works", "/pricing": "Pricing", "/contact": "Contact", "/about": "About", "/academy": "Academy", "/legal": "Policies",
    "/sign-in": "Sign in", "/forgot-password": "Forgot password", "/reset-password": "Set password", "/dashboard/student": "Mentee dashboard", "/dashboard/mentor": "Mentor dashboard",
    "/become-a-mentor": "Become a mentor", "/become-a-mentor/apply": "Mentor application",
  };
  if (fixed[path]) return fixed[path];
  const [, first, rest] = path.split("/");
  if (first === "mentors") return `Mentor profile: ${rest}`;
  if (first === "session") return `Call room: ${rest}`;
  if (first === "interview") return "Interview room";
  return path;
}

const STEP: Record<string, string> = { agenda: "Choosing a focus", prepare: "Writing preparation notes", review: "Reviewing the booking", payment: "Payment step", done: "Booking finished", auth: "Signing in to book" };

function describe(e: Event): { text: string; tone: string; important?: boolean } {
  switch (e.type) {
    case "page_view": return { text: pageName(e.page), tone: "bg-paper-dim" };
    case "signed_in": return { text: "Signed in", tone: "bg-mint", important: true };
    case "registered": return { text: "Created an account", tone: "bg-mint", important: true };
    case "signed_out": return { text: "Signed out", tone: "bg-paper-dim" };
    case "searched": return { text: `Searched for "${e.label ?? ""}"`, tone: "bg-sky" };
    case "slot_selected": return { text: `Chose a time${e.label ? ` with ${e.label}` : ""}`, tone: "bg-lilac" };
    case "auth_prompted": return { text: "Asked to sign in or sign up to book", tone: "bg-peach", important: true };
    case "application_step": return { text: `Mentor application: ${e.label ?? "step"}`, tone: "bg-sky" };
    case "application_submitted": return { text: "Submitted a mentor application", tone: "bg-mint", important: true };
    case "contact_sent": return { text: `Sent a contact message${e.label ? `: ${e.label}` : ""}`, tone: "bg-sky", important: true };
    case "booking_started": return { text: `Started booking${e.label ? ` with ${e.label}` : ""}`, tone: "bg-lilac", important: true };
    case "booking_step": return { text: STEP[e.label ?? ""] ?? "Booking step", tone: "bg-lilac" };
    case "booking_held": return { text: "Held a time and reached payment", tone: "bg-lemon", important: true };
    case "checkout_opened": return { text: "Opened checkout", tone: "bg-lemon" };
    case "payment_attempted": return { text: `Tried to pay${e.label ? ` (${e.label.toLowerCase()})` : ""}`, tone: "bg-lemon", important: true };
    case "payment_failed": return { text: `Payment failed${e.label ? `: ${e.label}` : ""}`, tone: "bg-rust-pale", important: true };
    case "payment_succeeded": return { text: `Payment successful${e.label ? `, session with ${e.label}` : ""}`, tone: "bg-mint", important: true };
    case "hold_expired": return { text: "Didn't pay in time, so the hold expired", tone: "bg-rust-pale", important: true };
    case "bank_transfer_submitted": return { text: "Sent bank transfer details", tone: "bg-sky", important: true };
    case "bank_transfer_rejected": return { text: `Bank transfer rejected${e.label ? `: ${e.label}` : ""}`, tone: "bg-rust-pale", important: true };
    case "booking_cancelled": return { text: `Booking cancelled${e.label ? ` (${e.label.toLowerCase()})` : ""}`, tone: "bg-peach", important: true };
    case "mentor_reported": return { text: "Reported that the mentor didn't join", tone: "bg-peach", important: true };
    case "rescheduled": return { text: "Rescheduled a session", tone: "bg-sky", important: true };
    case "session_joined": return { text: "Joined the call", tone: "bg-mint", important: true };
    case "review_left": return { text: "Left feedback", tone: "bg-mint", important: true };
    default: return { text: e.type.replaceAll("_", " "), tone: "bg-paper-dim" };
  }
}

function Avatar({ name, size = "h-10 w-10 text-xs" }: { name: string; size?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-ink ${size}`} style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>;
}

export function UserTracking() {
  const [days, setDays] = useState(30);
  const overview = useApi<Overview>(`/admin/activity/overview?days=${days}`);
  const people = useApi<Person[]>("/admin/activity/people");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const d = overview.data;

  if (!d && overview.loading) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}</div>;
  if (overview.error || !d) return <Alert>{overview.error}</Alert>;
  const high = d.triggers.filter((t) => t.severity === "high").length;
  const worst = d.dropOffs[0];

  function view(id: string) {
    setOpenId(id);
    setTimeout(() => document.getElementById("people")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active in last 24 hours" value={d.activeToday} note={`${d.guestsToday} guest${d.guestsToday === 1 ? "" : "s"} · ${d.liveNow} on the site now`} tone="mint" />
        <StatTile label="Sign-ins in last 24 hours" value={d.signInsToday} tone="sky" delay={60} />
        <StatTile label="Open triggers" value={d.triggers.length} note={high ? `${high} about payments` : "Nothing urgent"} tone="peach" delay={120} />
        <StatTile label="Most people stop at" value={<span className="block truncate text-2xl leading-tight sm:text-3xl">{worst ? pageName(worst.page) : "—"}</span>} note={worst ? `${worst.count} visit${worst.count === 1 ? "" : "s"} in ${d.days} days` : "No drop-offs yet"} tone="lilac" delay={180} />
      </div>

      <Audience days={days} onDays={setDays} now={now} onView={view} />

      <Funnel stages={d.funnel} days={days} onDays={setDays} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Triggers items={d.triggers} now={now} onView={view} onChanged={overview.reload} />
        <DropOffs rows={d.dropOffs} days={d.days} />
      </div>

      <section id="people" className="scroll-mt-24">
        <h2 className="font-display text-3xl text-ink">People</h2>
        <p className="mt-1 text-sm text-ink-soft">Members and guests. Choose someone to see their full journey and where they stopped.</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <PeopleList rows={people.data ?? []} loading={people.loading} selected={openId} now={now} onSelect={setOpenId} />
          <div className="min-w-0">
            {openId ? <JourneyView key={openId} id={openId} now={now} /> : (
              <div className="rounded-3xl border border-dashed border-ink/15 px-8 py-20 text-center">
                <p className="font-display text-2xl text-ink">Choose a person</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">Their journey appears here, visit by visit, with the last place they stopped.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** A country's flag, built from its two-letter code. */
const flag = (code: string) => (/^[A-Za-z]{2}$/.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "");
const moneyText = (rows: Money[]) => (rows.length ? rows.map((r) => formatMoney(r.amountMinor, r.currency)).join(" + ") : "—");
const percent = (n: number) => `${n >= 10 || n === 0 ? Math.round(n) : n.toFixed(1)}%`;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function DaysToggle({ days, onDays }: { days: number; onDays: (d: number) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-paper-dim p-1" role="group" aria-label="Time period">
      {[7, 30, 90].map((n) => (
        <button key={n} type="button" aria-pressed={days === n} onClick={() => onDays(n)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${days === n ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{n} days</button>
      ))}
    </div>
  );
}

/** Who visits and from where: headline numbers, countries, daily traffic, breakdowns and every visitor. */
function Audience({ days, onDays, now, onView }: { days: number; onDays: (d: number) => void; now: number; onView: (id: string) => void }) {
  const { data: d, error } = useApi<AudienceData>(`/admin/activity/audience?days=${days}`);
  const [country, setCountry] = useState<string | null>(null);
  if (error) return <Alert>{error}</Alert>;
  if (!d) return <Skeleton className="h-96 rounded-[2rem]" />;
  const t = d.totals;
  const leader = d.countries.find((c) => c.code && c.visitors);

  return (
    <section id="audience" className="scroll-mt-24 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl leading-tight text-ink">Audience</h2>
          <p className="mt-1 text-sm text-ink-soft">Who visited, where they came from and what they booked in the last {d.days} days.</p>
        </div>
        <DaysToggle days={days} onDays={onDays} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Visitors" value={t.visitors} note={`${plural(t.members, "member")} · ${plural(t.guests, "guest")}`} tone="sky" />
        <StatTile label="Countries" value={t.countries} note={leader ? `${flag(leader.code)} ${leader.name} leads with ${leader.visitors}` : "None recorded yet"} tone="mint" delay={60} />
        <StatTile label="Paid bookings" value={t.bookings} note={moneyText(t.revenue)} tone="peach" delay={120} />
        <StatTile label="Visits" value={t.visits} note={`${plural(t.returning, "visitor")} came back`} tone="lilac" delay={180} />
        <StatTile label="Pages per visit" value={t.pagesPerVisit.toFixed(1)} note={`${plural(t.pageViews, "page view")} · ${duration(t.avgVisitSeconds)} average visit`} tone="lemon" delay={240} />
        <StatTile label="Visitors who paid" value={percent(t.conversion)} note="Share of visitors with a paid booking" tone="sky" delay={300} />
      </div>

      {t.located < t.visitors && (
        <p className="rounded-2xl bg-lemon/60 px-5 py-3 text-sm text-ink">
          {plural(t.visitors - t.located, "visitor")} {t.visitors - t.located === 1 ? "has" : "have"} no location yet. IP addresses and locations are recorded from each visitor&rsquo;s next visit onwards, and earlier visits stay under &ldquo;Not recorded&rdquo;.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <CountryTable rows={d.countries} selected={country} onSelect={setCountry} />
        <Panel title="Top cities" action={<span className="text-xs text-ink-soft">By visitors</span>}>
          {d.cities.length === 0 ? <p className="text-sm text-ink-soft">No cities recorded yet.</p> : <Bars rows={d.cities.map((c) => ({ label: `${flag(c.code)} ${c.city}`, count: c.count, hint: c.country }))} />}
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">Locations are estimated from the IP address, so cities are approximate and a VPN can change them.</p>
        </Panel>
      </div>

      <DailyChart rows={d.daily} />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Panel title="Devices">
          <Bars rows={d.devices} />
          <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">Browsers</p>
          <Bars rows={d.browsers} />
        </Panel>
        <Panel title="Traffic sources"><Bars rows={d.sources} empty="No sources recorded yet." /></Panel>
        <Panel title="Top pages"><Bars rows={d.pages.map((p) => ({ label: pageName(p.page), count: p.views, hint: plural(p.people, "person").replace("persons", "people") }))} empty="No page views recorded yet." /></Panel>
      </div>

      <VisitorTable rows={d.visitors} country={country} countries={d.countries} onCountry={setCountry} now={now} onView={onView} />
    </section>
  );
}

function CountryTable({ rows, selected, onSelect }: { rows: CountryRow[]; selected: string | null; onSelect: (code: string | null) => void }) {
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3 p-6 pb-4 sm:p-7 sm:pb-4">
        <div>
          <h3 className="font-display text-2xl text-ink">Countries</h3>
          <p className="mt-0.5 text-sm text-ink-soft">Choose a country to see its visitors.</p>
        </div>
        <div className="flex items-center gap-4 pt-1.5 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEMBER }} />Members</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GUEST }} />Guests</span>
        </div>
      </div>
      {rows.length === 0 ? <p className="px-7 pb-8 text-sm text-ink-soft">No visitors in this period.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="border-y border-line text-xs text-ink-soft">
              <th scope="col" className="py-2.5 pl-6 pr-3 font-medium sm:pl-7">Country</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Visitors</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Visits</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Bookings</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Revenue</th>
              <th scope="col" className="py-2.5 pl-3 pr-6 text-right font-medium sm:pr-7">Paid</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const on = selected === c.code;
                return (
                  <tr key={c.code || "none"} onClick={() => onSelect(on ? null : c.code)} className={`cursor-pointer transition-colors ${on ? "bg-sky/30" : "hover:bg-paper/70"}`}>
                    <td className="py-3.5 pl-6 pr-3 sm:pl-7">
                      <button type="button" aria-pressed={on} onClick={(e) => { e.stopPropagation(); onSelect(on ? null : c.code); }} className="flex items-center gap-2.5 text-left font-medium text-ink">
                        <span className="text-lg leading-none" aria-hidden>{flag(c.code) || "·"}</span>{c.name}
                      </button>
                      {on && c.cities.length > 0 && <p className="mt-1 max-w-[220px] text-xs font-normal leading-relaxed text-ink-soft">{c.cities.slice(0, 4).map((x) => `${x.label} ${x.count}`).join(" · ")}</p>}
                    </td>
                    <td className="w-[34%] px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-7 shrink-0 font-display text-xl tabular-nums leading-none text-ink">{c.visitors}</span>
                        <div className="flex h-2.5 flex-1 gap-0.5" title={`${plural(c.members, "member")} · ${plural(c.guests, "guest")}`}>
                          <div className="flex gap-0.5" style={{ width: `${Math.max((c.visitors / top) * 100, c.visitors ? 2 : 0)}%` }}>
                            {c.members > 0 && <span className="h-full rounded-l-[1px] last:rounded-r" style={{ flexGrow: c.members, backgroundColor: MEMBER, minWidth: 3 }} />}
                            {c.guests > 0 && <span className="h-full rounded-r first:rounded-l-[1px]" style={{ flexGrow: c.guests, backgroundColor: GUEST, minWidth: 3 }} />}
                          </div>
                        </div>
                      </div>
                      <p className="ml-10 mt-1 text-[11px] text-ink-soft">{plural(c.members, "member")} · {plural(c.guests, "guest")}</p>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-ink">{c.visits}</td>
                    <td className="px-3 py-3.5 text-right font-medium tabular-nums text-ink">{c.bookings}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-ink">{moneyText(c.revenue)}</td>
                    <td className="py-3.5 pl-3 pr-6 text-right tabular-nums text-ink-soft sm:pr-7">{c.visitors ? percent(c.conversion) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A ranked list where each row is a label, its count and a thin bar. */
function Bars({ rows, empty = "Nothing recorded yet." }: { rows: { label: string; count: number; hint?: string }[]; empty?: string }) {
  const top = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((n, r) => n + r.count, 0) || 1;
  if (!rows.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink" title={r.label}>{r.label}{r.hint && <span className="ml-1.5 text-xs text-ink-soft">{r.hint}</span>}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">{r.count} <span className="text-xs">· {Math.round((r.count / total) * 100)}%</span></span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-paper-dim"><div className="h-full rounded-full" style={{ width: `${(r.count / top) * 100}%`, backgroundColor: MEMBER }} /></div>
        </li>
      ))}
    </ul>
  );
}

const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function DailyChart({ rows }: { rows: AudienceData["daily"] }) {
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  const peak = rows.reduce((best, r) => (r.visitors > best.visitors ? r : best), rows[0]);
  return (
    <Panel title="Visitors per day" action={peak?.visitors ? <span className="text-xs text-ink-soft">Busiest: {shortDate(peak.date)}, {plural(peak.visitors, "visitor")}</span> : undefined}>
      <div className={`flex h-44 items-end border-b border-line ${rows.length > 45 ? "gap-px" : "gap-1"}`}>
        {rows.map((r, i) => {
          const side = i < rows.length * 0.15 ? "left-0" : i > rows.length * 0.85 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <div key={r.date} className="group relative flex h-full min-w-0 flex-1 items-end">
              <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-70" style={{ height: r.visitors ? `${Math.max((r.visitors / top) * 100, 2)}%` : 0, backgroundColor: MEMBER }} />
              <span role="tooltip" className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:block ${side}`}>
                {shortDate(r.date)} · {plural(r.visitors, "visitor")} · {plural(r.pageViews, "page view")}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-soft"><span>{rows[0] && shortDate(rows[0].date)}</span><span>{rows.length > 0 && shortDate(rows[rows.length - 1].date)}</span></div>
    </Panel>
  );
}

const PAGE = 10;

function VisitorTable({ rows, country, countries, onCountry, now, onView }: { rows: Visitor[]; country: string | null; countries: CountryRow[]; onCountry: (code: string | null) => void; now: number; onView: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"all" | "members" | "guests">("all");
  const [limit, setLimit] = useState(PAGE);
  const term = q.trim().toLowerCase();
  const shown = rows.filter((v) => (country === null || v.country === country) && (group === "all" || (group === "guests") === (v.role === "GUEST")) && (!term || `${v.name} ${v.email} ${v.ip ?? ""} ${v.city ?? ""} ${v.countryName}`.toLowerCase().includes(term)));
  const place = country === null ? null : countries.find((c) => c.code === country);
  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="space-y-3 px-6 pb-3 pt-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-2xl leading-tight text-ink">{place ? <>Visitors from {flag(place.code)} {place.name}</> : "Every visitor"}</h3>
          <span className="text-sm tabular-nums text-ink-soft">{plural(shown.length, "visitor")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-56"><input className="input" placeholder="Search name, email, IP or city" aria-label="Search visitors" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} /></div>
          <div className="w-52 shrink-0"><select className="input" aria-label="Filter by country" value={country ?? "all"} onChange={(e) => { onCountry(e.target.value === "all" ? null : e.target.value); setLimit(PAGE); }}>
            <option value="all">All countries</option>
            {countries.filter((c) => c.visitors).map((c) => <option key={c.code || "none"} value={c.code}>{c.name} ({c.visitors})</option>)}
          </select></div>
          <div className="grid shrink-0 grid-cols-3 gap-1 rounded-full bg-paper-dim p-1">
            {(["all", "members", "guests"] as const).map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => { setGroup(g); setLimit(PAGE); }} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${group === g ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{g}</button>)}
          </div>
        </div>
      </div>
      {shown.length === 0 ? <p className="px-7 pb-8 pt-2 text-sm text-ink-soft">Nobody matches.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead><tr className="border-y border-line text-xs text-ink-soft">
              {["Visitor", "Location", "IP address", "Device", "Source"].map((h, i) => <th key={h} scope="col" className={`py-1.5 pr-3 font-medium ${i ? "pl-3" : "pl-6 sm:pl-7"}`}>{h}</th>)}
              {["Visits", "Pages", "Bookings"].map((h) => <th key={h} scope="col" className="px-3 py-1.5 text-right font-medium">{h}</th>)}
              <th scope="col" className="py-1.5 pl-3 pr-6 text-right font-medium sm:pr-7">Last seen</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {shown.slice(0, limit).map((v) => (
                <tr key={v.id} onClick={() => onView(v.id)} className="cursor-pointer transition-colors hover:bg-paper/70">
                  <td className="py-1.5 pl-6 pr-3 sm:pl-7">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onView(v.id); }} className="flex min-w-0 items-center gap-2.5 text-left">
                      <span className="relative">
                        <Avatar name={v.name} size="h-7 w-7 text-[10px]" />
                        {now - new Date(v.lastSeen).getTime() < ONLINE && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-forest ring-2 ring-white" aria-label="Active now" />}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block max-w-[180px] truncate font-medium text-ink">{v.name}</span>
                        <span className="block max-w-[180px] truncate text-[11px] text-ink-soft">{v.role === "GUEST" ? "Guest" : v.email}</span>
                      </span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink">{v.country ? <>{flag(v.country)} {v.city ? `${v.city}, ` : ""}{v.countryName}</> : <span className="text-ink-soft">Not recorded</span>}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-ink-soft">{v.ip ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-soft">{v.device ?? "—"}</td>
                  <td className="max-w-[130px] truncate px-3 py-1.5 text-ink-soft" title={v.source ?? "Direct"}>{v.source ?? "Direct"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{v.visits}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{v.pageViews}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums text-ink">{v.bookings || "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 pr-6 text-right text-xs text-ink-soft sm:pr-7">{ago(v.lastSeen, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > limit && <div className="border-t border-line p-2.5 text-center"><button type="button" onClick={() => setLimit((n) => n + PAGE)} className="text-sm font-medium text-ink underline-offset-4 hover:underline">Show {Math.min(PAGE, shown.length - limit)} more</button></div>}
    </div>
  );
}

function Triggers({ items, now, onView, onChanged }: { items: Trigger[]; now: number; onView: (id: string) => void; onChanged: () => void | Promise<void> }) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const counts = useMemo(() => items.reduce<Partial<Record<Kind, number>>>((c, t) => ({ ...c, [t.kind]: (c[t.kind] ?? 0) + 1 }), {}), [items]);
  const rows = items.filter((t) => !kind || t.kind === kind);

  async function handled(t: Trigger) {
    setBusy(t.id);
    try { await api(`/admin/activity/triggers/${encodeURIComponent(t.id)}/handled`, { method: "POST" }); await onChanged(); toast("Marked as handled."); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }

  return (
    <Panel title="Triggers" action={<span className="text-sm text-ink-soft">{items.length} open</span>}>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 py-1">
        <Chip on={!kind} onClick={() => setKind("")}>All <Count n={items.length} on={!kind} /></Chip>
        {(Object.keys(KINDS) as Kind[]).filter((k) => counts[k]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KINDS[k].label} <Count n={counts[k]!} on={kind === k} /></Chip>)}
      </div>
      {rows.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-display text-2xl text-ink">All clear</p>
          <p className="mt-1 text-sm text-ink-soft">Nobody needs following up right now.</p>
        </div>
      ) : (
        <ul className="-mx-2 max-h-[620px] divide-y divide-line overflow-y-auto px-2">
          {rows.map((t) => (
            <li key={t.id} className="flex gap-3 py-3.5">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.severity === "high" ? "bg-rust" : t.severity === "medium" ? "bg-amber" : "bg-ink/25"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  <span className="text-xs text-ink-soft">{ago(t.at, now)}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-ink">{t.name}{t.email && <span className="text-ink-soft"> · {t.email}</span>}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{t.detail}{t.reference ? ` Ref. ${t.reference}.` : ""}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium text-ink ${KINDS[t.kind].tone}`}>{KINDS[t.kind].label}</span>
                  <button type="button" onClick={() => onView(t.userId)} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink hover:border-ink/40">View journey</button>
                  {t.email && <a href={`mailto:${t.email}`} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink hover:border-ink/40">Email</a>}
                  <button type="button" disabled={busy === t.id} onClick={() => handled(t)} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-50">Mark handled</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30 hover:bg-paper/60"}`}>{children}</button>
);
const Count = ({ n, on }: { n: number; on: boolean }) => <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${on ? "bg-white/20" : "bg-paper-dim text-ink-soft"}`}>{n}</span>;

const MEMBER = "#3b6fb5";
const GUEST = "#c08a3e";

function Funnel({ stages, days, onDays }: { stages: Stage[]; days: number; onDays: (d: number) => void }) {
  const top = stages[0]?.count ?? 0;
  const paid = stages[stages.length - 1]?.count ?? 0;
  const rate = top ? (paid / top) * 100 : 0;
  // The step that loses the most people.
  let leak: { from: string; to: string; lost: number; pct: number } | null = null;
  stages.forEach((s, i) => {
    const prev = stages[i - 1];
    if (!prev || !prev.count) return;
    const lost = prev.count - s.count;
    if (lost > 0 && (!leak || lost > leak.lost)) leak = { from: prev.label, to: s.label, lost, pct: Math.round((lost / prev.count) * 100) };
  });
  const biggest = leak as { from: string; to: string; lost: number; pct: number } | null;

  return (
    <section className="overflow-hidden rounded-[2rem] bg-white ring-1 ring-line">
      <div className="border-b border-line p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl leading-tight text-ink">Booking funnel</h2>
            <p className="mt-1 text-sm text-ink-soft">From first visit to paid session. Each person counts once.</p>
          </div>
          <DaysToggle days={days} onDays={onDays} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-2xl bg-mint/60 px-5 py-4">
            <p className="font-display text-4xl leading-none text-ink">{percent(rate)}</p>
            <p className="min-w-0 text-sm leading-snug text-ink/70">of visitors paid<span className="block text-xs">{paid} of {top} people</span></p>
          </div>
          {biggest && (
            <div className="flex items-center gap-4 rounded-2xl bg-peach/60 px-5 py-4">
              <p className="font-display text-4xl leading-none text-ink">{biggest.lost}</p>
              <p className="min-w-0 text-sm leading-snug text-ink/70">lost before &ldquo;{biggest.to}&rdquo;<span className="block text-xs">{biggest.pct}% left here, the biggest drop</span></p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {top === 0 ? (
          <div className="py-10 text-center">
            <p className="font-display text-2xl text-ink">Waiting for the first visitors</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">Tracking has only just started. The funnel fills in as people browse and book.</p>
          </div>
        ) : (
          <ol>
            {stages.map((s, i) => {
              const prev = stages[i - 1];
              const kept = prev?.count ? Math.round((s.count / prev.count) * 100) : null;
              const lost = prev ? prev.count - s.count : 0;
              const isLeak = !!biggest && biggest.to === s.label;
              return (
                <li key={s.label}>
                  {prev && (
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-1.5 sm:grid-cols-[160px_minmax(0,1fr)_64px]">
                      <span />
                      <p className={`text-xs ${isLeak ? "font-medium text-rust" : "text-ink-soft"}`}>
                        {kept === null ? "No one reached this step" : `${kept}% continued${lost ? `, ${lost} left` : ""}`}{isLeak ? " · biggest drop" : ""}
                      </p>
                    </div>
                  )}
                  <div className="group relative grid grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-3 sm:grid-cols-[160px_minmax(0,1fr)_64px]">
                    <span className="text-sm text-ink">{s.label}</span>
                    <div className="flex h-6 gap-0.5" style={{ width: top ? `${Math.max((s.count / top) * 100, s.count ? 1 : 0)}%` : 0 }}>
                      {s.members > 0 && <span className="h-full rounded-l-[1px] last:rounded-r" style={{ flexGrow: s.members, backgroundColor: MEMBER, minWidth: 3 }} />}
                      {s.guests > 0 && <span className="h-full first:rounded-l-[1px] rounded-r" style={{ flexGrow: s.guests, backgroundColor: GUEST, minWidth: 3 }} />}
                      {s.count === 0 && <span className="h-full w-px bg-line" />}
                    </div>
                    <span className="text-right font-display text-2xl tabular-nums leading-none text-ink">{s.count}</span>
                    <span role="tooltip" className="pointer-events-none absolute left-[120px] top-full z-10 mt-1 hidden whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:block sm:left-[172px]">
                      {s.members} member{s.members === 1 ? "" : "s"} · {s.guests} guest{s.guests === 1 ? "" : "s"} · {top ? Math.round((s.count / top) * 100) : 0}% of visitors
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {top > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEMBER }} />Members</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GUEST }} />Guests</span>
            <span>Guests who sign up count as members from then on, with their earlier steps included.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function DropOffs({ rows, days }: { rows: Overview["dropOffs"]; days: number }) {
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Panel title="Where people stop" action={<span className="text-xs text-ink-soft">Last {days} days</span>}>
      {rows.length === 0 ? <p className="text-sm text-ink-soft">No drop-offs recorded yet.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.page}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink" title={r.page}>{pageName(r.page)}</span>
                <span className="tabular-nums text-ink-soft">{r.count}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper-dim"><div className="h-full rounded-full" style={{ width: `${(r.count / top) * 100}%`, backgroundColor: MEMBER }} /></div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">The last page of each visit that ended without a payment.</p>
    </Panel>
  );
}

function PeopleList({ rows, loading, selected, now, onSelect }: { rows: Person[]; loading: boolean; selected: string | null; now: number; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"all" | "members" | "guests">("all");
  const shown = rows.filter((p) => (group === "all" || (group === "guests") === (p.role === "GUEST")) && `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <input className="input mb-3" placeholder="Search by name or email" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-full bg-paper-dim p-1">
        {(["all", "members", "guests"] as const).map((g) => (
          <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={`rounded-full py-1.5 text-xs font-medium capitalize transition-colors ${group === g ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{g}</button>
        ))}
      </div>
      {loading ? <Skeleton className="h-64 rounded-3xl" /> : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-center text-sm text-ink-soft ring-1 ring-line">{rows.length ? "Nobody matches." : "No activity recorded yet."}</p>
      ) : (
        <ul className="space-y-2 lg:-m-1 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:p-1">
          {shown.map((p) => {
            const online = now - new Date(p.lastSeen).getTime() < ONLINE;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => onSelect(p.id)} className={`flex w-full gap-3 rounded-2xl bg-white p-3.5 text-left transition-all ${selected === p.id ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/30"}`}>
                  <span className="relative">
                    <Avatar name={p.name} />
                    {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-forest ring-2 ring-white" aria-label="Active now" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{p.name}{p.role === "GUEST" && <span className="ml-1.5 rounded-full bg-paper-dim px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">Guest</span>}</span>
                      <span className="shrink-0 text-[11px] text-ink-soft">{ago(p.lastSeen, now)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-soft">Last on: {pageName(p.lastPage)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function JourneyView({ id, now }: { id: string; now: number }) {
  const { data: j, loading, error } = useApi<Journey>(`/admin/activity/people/${id}`);
  const visits = useMemo(() => {
    const out: Event[][] = [];
    for (const e of j?.events ?? []) { // newest first
      const cur = out[out.length - 1];
      if (cur && new Date(cur[cur.length - 1].createdAt).getTime() - new Date(e.createdAt).getTime() <= VISIT_GAP) cur.push(e);
      else out.push([e]);
    }
    return out;
  }, [j]);
  if (loading) return <Skeleton className="h-96 rounded-3xl" />;
  if (error || !j) return <Alert>{error}</Alert>;
  const lastPage = j.events.find((e) => e.page)?.page ?? null;
  const last = j.events[0];
  // Things that happen without the person, like an admin approving their payment, don't mean they were here.
  const seen = j.events.find((e) => !["hold_expired", "payment_succeeded", "booking_cancelled", "bank_transfer_rejected"].includes(e.type)) ?? last;
  const online = seen && now - new Date(seen.createdAt).getTime() < ONLINE;
  const guest = j.user.role === "GUEST";

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="border-b border-line p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={j.user.name} size="h-14 w-14 text-lg" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-3xl leading-tight text-ink">{j.user.name}</p>
            <p className="truncate text-sm text-ink-soft">{guest ? "Not signed up yet, so no contact details" : `${j.user.email}${j.user.phone ? ` · ${j.user.phone}` : ""}`}</p>
            {(j.device || j.referrer || j.country || j.ip) && <p className="mt-0.5 truncate text-xs text-ink-soft">{[j.country && `${flag(j.country)} ${j.city ? `${j.city}, ` : ""}${new Intl.DisplayNames(["en"], { type: "region" }).of(j.country)}`, j.ip && `IP ${j.ip}`, j.device, j.referrer && `Came from ${j.referrer}`].filter(Boolean).join(" · ")}</p>}
          </div>
          <Badge tone={j.user.role === "MENTOR" ? "brass" : "neutral"}>{guest ? "Guest" : j.user.role === "MENTOR" ? "Mentor" : "Mentee"}</Badge>
        </div>
        <div className={`mt-6 grid gap-3 ${guest ? "" : "sm:grid-cols-3"}`}>
          <div className={`rounded-2xl bg-ink p-4 text-white ${guest ? "" : "sm:col-span-2"}`}>
            {lastPage ? (
              <>
                <p className="text-xs text-white/60">{online ? "Right now on" : "Stopped at"}</p>
                <p className="mt-1 font-display text-2xl leading-tight">{pageName(lastPage)}</p>
              </>
            ) : last ? (
              <>
                <p className="text-xs text-white/60">{online ? "Latest step" : "Last step"}</p>
                <p className="mt-1 font-display text-2xl leading-tight">{describe(last).text}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-white/60">Where they stopped</p>
                <p className="mt-1 font-display text-2xl leading-tight">Not recorded yet</p>
                <p className="mt-1 text-xs leading-relaxed text-white/60">They haven&rsquo;t been active since tracking started. Anything below comes from their earlier bookings.</p>
              </>
            )}
            {last && <p className="mt-1 text-xs text-white/60">{online ? "Active now" : `Last seen ${ago(seen.createdAt, now)}`} · {describe(last).text}</p>}
          </div>
          {!guest && <div className="rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-soft">Bookings</p>
            <p className="mt-1 font-display text-2xl leading-tight text-ink">{(j.bookings.CONFIRMED ?? 0) + (j.bookings.COMPLETED ?? 0)} paid</p>
            <p className="mt-1 text-xs text-ink-soft">{j.bookings.PENDING_PAYMENT ?? 0} awaiting · {j.bookings.CANCELLED ?? 0} cancelled</p>
          </div>}
        </div>
        {j.triggers.length > 0 && (
          <ul className="mt-3 space-y-2">
            {j.triggers.map((t) => (
              <li key={t.id} className={`rounded-2xl px-4 py-3 text-sm text-ink ${KINDS[t.kind].tone}`}>
                <span className="font-medium">{t.title}.</span> <span className="text-ink/70">{t.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-8 p-6 sm:p-8">
        {visits.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">No pages or actions recorded yet. Their journey will appear here the next time they sign in.</p>}
        {visits.map((v) => (
          <section key={v[0].id}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-xl text-ink">{fmtDay(v[v.length - 1].createdAt)}</h3>
              <p className="text-xs text-ink-soft">{fmtTime(v[v.length - 1].createdAt)} to {fmtTime(v[0].createdAt)} · {v.length} step{v.length === 1 ? "" : "s"}</p>
            </div>
            <ol className="relative space-y-3 border-l border-line pl-6">
              {v.map((e, i) => {
                const info = describe(e);
                return (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[30px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${info.tone}`} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className={`text-sm ${info.important ? "font-medium text-ink" : "text-ink-soft"}`}>{info.text}{i === 0 && <span className="ml-2 rounded-full bg-paper-dim px-2 py-0.5 text-[11px] font-normal text-ink-soft">Last step of visit</span>}</p>
                      <p className="text-xs tabular-nums text-ink-soft">{fmtTime(e.createdAt)}</p>
                    </div>
                    {e.reference && <p className="text-xs text-ink-soft">Ref. {e.reference}</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {j.events.length >= 500 && <p className="text-center text-xs text-ink-soft">Showing the latest 500 events.</p>}
      </div>
    </div>
  );
}
