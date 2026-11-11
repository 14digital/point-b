"use client";

import type { ReactNode } from "react";

/** The admin sections, grouped so a dozen of them read at a glance instead of scrolling sideways. */
const GROUPS: { label: string; tabs: string[] }[] = [
  { label: "Home", tabs: ["Overview"] },
  { label: "People", tabs: ["Applications", "Mentors", "Mentees"] },
  { label: "Sessions", tabs: ["Bookings", "Reviews"] },
  { label: "Inbox", tabs: ["Support", "Live chat"] },
  { label: "Growth", tabs: ["Referrals", "User tracking"] },
  { label: "System", tabs: ["Activity", "Settings"] },
];

const path = (d: ReactNode) => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const ICON: Record<string, ReactNode> = {
  Overview: path(<><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></>),
  Applications: path(<><path d="M5.5 2.5h6l3.5 3.5v11.5h-9.5z" /><path d="M11.5 2.5V6H15M8 10h4.5M8 13h4.5" /></>),
  Mentors: path(<><circle cx="10" cy="6.5" r="3" /><path d="M4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" /><path d="M13.8 3.2l.9 1.6 1.8.3-1.3 1.2.3 1.8" /></>),
  Mentees: path(<><circle cx="7.5" cy="7" r="2.6" /><circle cx="13.8" cy="7.8" r="2.1" /><path d="M2.5 16.5c.6-2.8 2.6-4.4 5-4.4s4.4 1.6 5 4.4M12.6 12.2c2.4-.3 4.3 1.1 4.9 4" /></>),
  Bookings: path(<><rect x="3" y="4.5" width="14" height="12.5" rx="2.5" /><path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" /><path d="M7.5 12.5l1.7 1.7 3.3-3.3" /></>),
  Reviews: path(<path d="M10 2.8l2.1 4.4 4.8.6-3.5 3.3.9 4.8L10 13.6l-4.3 2.3.9-4.8-3.5-3.3 4.8-.6z" />),
  Support: path(<><path d="M3.5 9.5a6.5 6.5 0 0113 0v3.5a2 2 0 01-2 2H13v-4.5h3.5M3.5 9.5V13a2 2 0 002 2H7v-4.5H3.5" /><path d="M13 15.5c0 1-1 1.8-3 1.8" /></>),
  "Live chat": path(<><path d="M3.5 9.5a6.5 6 0 116 6c-1 0-2-.2-2.9-.6L3.5 16l.9-3a5.7 5.7 0 01-.9-3.5z" /><path d="M7 9.5h.01M10 9.5h.01M13 9.5h.01" strokeWidth="2.2" /></>),
  Referrals: path(<><path d="M4 7.5h12v9.5H4z" /><path d="M2.5 5h15v2.5h-15zM10 5v12M10 5c-1.5-2.8-4.5-2.8-4.5-.9C5.5 5 7.5 5 10 5zm0 0c1.5-2.8 4.5-2.8 4.5-.9C14.5 5 12.5 5 10 5z" /></>),
  "User tracking": path(<><path d="M3 16.5h14" /><path d="M5 13.5V10M9 13.5V6.5M13 13.5V8.5M17 13.5V4" /></>),
  Activity: path(<path d="M2.5 10h3.2l2-5 3.6 10 2-5h4.2" />),
  Settings: path(<><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2M10 15.5v2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M2.5 10h2M15.5 10h2M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>),
};

/**
 * Grouped admin navigation. Only the sections the team member's role can open are shown, and empty groups disappear.
 * Six even columns on a wide screen, three on a tablet and two on a phone, so nothing ever scrolls sideways.
 */
export function AdminNav<T extends string>({ tabs, value, onChange, counts = {} }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; counts?: Partial<Record<T, number>> }) {
  const allowed = new Set<string>(tabs);
  const groups = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => allowed.has(t)) as T[] })).filter((g) => g.tabs.length);
  // Anything new that isn't in a group yet still gets a home.
  const grouped = new Set(GROUPS.flatMap((g) => g.tabs));
  const extra = tabs.filter((t) => !grouped.has(t));
  if (extra.length) groups.push({ label: "More", tabs: [...extra] });

  return (
    <nav aria-label="Admin sections" className="rounded-[1.75rem] bg-white/70 p-2 shadow-[0_18px_44px_-34px_rgba(17,17,17,0.45)] ring-1 ring-line backdrop-blur">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist">
        {groups.map((g) => {
          const active = g.tabs.includes(value);
          return (
            <div key={g.label} className={`flex min-w-0 flex-col rounded-[1.35rem] px-1.5 pb-1.5 pt-2.5 transition-colors ${active ? "bg-paper-dim/80" : "bg-paper/60"}`}>
              <span className={`px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${active ? "text-brass-dark" : "text-brass/80"}`}>{g.label}</span>
              <div className="flex flex-col gap-0.5">
                {g.tabs.map((t) => {
                  const on = t === value;
                  const n = counts[t];
                  return (
                    <button key={t} type="button" role="tab" aria-selected={on} onClick={() => onChange(t)}
                      className={`group/tab flex w-full items-center gap-2 whitespace-nowrap rounded-full py-2 pl-2.5 pr-2 text-left text-sm font-medium transition-all duration-200 ${on ? "bg-ink text-white shadow-[0_8px_18px_-10px_rgba(17,17,17,0.7)]" : "text-ink-soft hover:bg-white hover:text-ink hover:shadow-sm"}`}>
                      <span className={`transition-colors ${on ? "text-lime" : "text-ink-soft/80 group-hover/tab:text-ink"}`}>{ICON[t] ?? ICON.Overview}</span>
                      <span className="truncate">{t}</span>
                      {n !== undefined && n > 0 && (
                        <span className={`ml-auto min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none tabular-nums ${on ? "bg-lime text-ink" : "bg-rust text-white"}`}>{n}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
