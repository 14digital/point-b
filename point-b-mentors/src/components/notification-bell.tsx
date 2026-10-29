"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { fmtDayShort, fmtTime } from "@/lib/format";

interface Item { id: string; subject: string; body: string; sentAt: string; readAt: string | null }
interface Inbox { items: Item[]; unread: number }

const ic = (d: ReactNode) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

/** Picks an icon and colour from the subject line, so the list scans at a glance. */
function kindOf(subject: string): { tone: string; icon: ReactNode } {
  const s = subject.toLowerCase();
  if (/cancel/.test(s)) return { tone: "bg-peach", icon: ic(<path d="M6 6l12 12M18 6L6 18" />) };
  if (/reschedul/.test(s)) return { tone: "bg-lilac", icon: ic(<><path d="M4 12a8 8 0 0114-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 01-14 5.3L4 15" /><path d="M4 20v-5h5" /></>) };
  if (/starts in|starting in|reminder/.test(s)) return { tone: "bg-sky", icon: ic(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>) };
  if (/how was|feedback|review/.test(s)) return { tone: "bg-lemon", icon: ic(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z" />) };
  if (/confirm|new booking|booked/.test(s)) return { tone: "bg-mint", icon: ic(<path d="M5 12.5l4.5 4.5L19 7.5" />) };
  if (/application|mentor profile|welcome/.test(s)) return { tone: "bg-paper-dim", icon: ic(<><path d="M6 3h9l4 4v14H6z" /><path d="M10 12h6M10 16h4" /></>) };
  return { tone: "bg-paper-dim", icon: ic(<><path d="M12 4a6 6 0 00-6 6v3.5L4.5 17h15L18 13.5V10a6 6 0 00-6-6z" /><path d="M10 20a2 2 0 004 0" /></>) };
}

/** Email bodies start with "Hi Name," — skip it so the preview shows the actual news. */
const preview = (body: string) => body.replace(/^hi [^,\n]*,\s*/i, "").replace(/\s+/g, " ").trim();

function ago(iso: string, now: number) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "Yesterday";
  return `${fmtDayShort(iso)} · ${fmtTime(iso)}`;
}

export function NotificationBell({ light = false }: { light?: boolean }) {
  const [data, setData] = useState<Inbox>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  // Items that were unread when the panel opened stay highlighted until it closes, even though they're marked read.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { api<Inbox>("/notifications").then(setData).catch(() => undefined); }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setNow(Date.now());
    setFresh(new Set(data.items.filter((n) => !n.readAt).map((n) => n.id)));
    if (data.unread > 0) {
      api("/notifications/read", { method: "POST", body: {} })
        .then(() => setData((d) => ({ unread: 0, items: d.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) })))
        .catch(() => undefined);
    }
  }

  const newItems = data.items.filter((n) => fresh.has(n.id));
  const earlier = data.items.filter((n) => !fresh.has(n.id));

  return (
    <div ref={box} className="relative">
      <button onClick={toggle} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`} aria-expanded={open} aria-haspopup="dialog"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${light
          ? "border border-white/30 text-white hover:bg-white/10"
          : open ? "bg-ink text-white" : "border border-line bg-white/60 text-ink-soft hover:border-ink/30 hover:text-ink"}`}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 3a5 5 0 00-5 5v3l-1.5 3h13L15 11V8a5 5 0 00-5-5zM8.5 16.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {data.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rust px-1 text-[10px] font-semibold text-white ring-2 ring-paper">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications"
          className="absolute right-0 z-50 mt-3 w-[min(380px,calc(100vw-2rem))] origin-top-right animate-[pop_160ms_ease-out] overflow-hidden whitespace-normal rounded-3xl bg-white text-left shadow-[0_24px_60px_-20px_rgba(17,17,17,0.35)] ring-1 ring-ink/5">
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <p className="font-display text-xl text-ink">Notifications</p>
              {newItems.length > 0 && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">{newItems.length} new</span>}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close notifications" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </header>

          {data.items.length === 0 ? (
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mint text-ink">{ic(<path d="M5 12.5l4.5 4.5L19 7.5" />)}</span>
              <p className="mt-5 font-display text-2xl text-ink">You&rsquo;re all caught up</p>
              <p className="mt-1.5 max-w-[260px] text-sm leading-relaxed text-ink-soft">Booking confirmations, reminders and updates will appear here.</p>
            </div>
          ) : (
            <div className="max-h-[min(460px,70vh)] overflow-y-auto overscroll-contain">
              {newItems.length > 0 && <Group label="New" items={newItems} fresh now={now} />}
              {earlier.length > 0 && <Group label={newItems.length ? "Earlier" : "Recent"} items={earlier} now={now} />}
            </div>
          )}

          {data.items.length > 0 && (
            <footer className="border-t border-line bg-paper/60 px-5 py-3 text-center text-xs text-ink-soft">
              Copies of these are also sent to your email.
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, items, fresh = false, now }: { label: string; items: Item[]; fresh?: boolean; now: number }) {
  return (
    <section>
      <p className="px-5 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <ul className="px-2 pb-2">
        {items.map((n) => {
          const k = kindOf(n.subject);
          return (
            <li key={n.id} className={`relative flex gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-paper ${fresh ? "bg-sky/20" : ""}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink ${k.tone}`}>{k.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm leading-snug text-ink ${fresh ? "font-semibold" : "font-medium"}`}>{n.subject}</p>
                  {fresh && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink" aria-label="New" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">{preview(n.body)}</p>
                <p className="mt-1 text-[11px] text-ink-soft/80">{ago(n.sentAt, now)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
