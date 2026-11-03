"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

const DEFAULT_HOURS = 48;
const STORE = "pointb.notice-hours";
let cached: number | null = null;
let inflight: Promise<number> | null = null;

/** "3 days" for whole days, otherwise "36 hours". */
export const noticeLabel = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`);

const remembered = () => {
  try { const n = Number(localStorage.getItem(STORE)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
};

function load() {
  inflight ??= api<{ rescheduleNoticeHours: number }>("/bookings/policy")
    .then((r) => { cached = r.rescheduleNoticeHours; try { localStorage.setItem(STORE, String(cached)); } catch { /* storage unavailable */ } return cached; })
    .catch(() => { inflight = null; return cached ?? DEFAULT_HOURS; });
  return inflight;
}

/** The rescheduling window set by admins (one request per page load, shared by every caller). */
export function useNoticeHours() {
  const [hours, setHours] = useState<number>(cached ?? DEFAULT_HOURS);
  useEffect(() => {
    let alive = true;
    const quick = cached ?? remembered();
    const t = setTimeout(() => { if (alive && quick) setHours(quick); }, 0);
    load().then((h) => { if (alive) setHours(h); });
    return () => { alive = false; clearTimeout(t); };
  }, []);
  return hours;
}

export function useNoticeLabel() { return noticeLabel(useNoticeHours()); }

/** Renders text with "{notice}" replaced by the current window, e.g. "up to {notice} before" -> "up to 3 days before". */
export function NoticeText({ text }: { text: string }) {
  const label = useNoticeLabel();
  return <>{text.replaceAll("{notice}", label)}</>;
}
