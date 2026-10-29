import type { Currency, Slot } from "./types";

export function formatMoney(minor: number, currency: Currency): string {
  const major = minor / 100;
  const n = major.toLocaleString(currency === "PKR" ? "en-PK" : "en-GB", { maximumFractionDigits: 2 });
  return currency === "PKR" ? `Rs ${n}` : `£${n}`;
}

export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", " ");

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const fmtDayShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function groupByDay(slots: Slot[]): { key: string; iso: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = dayKey(s.startAt);
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return [...map.entries()].map(([key, list]) => ({ key, iso: list[0].startAt, slots: list }));
}

export const initials = (name: string) =>
  name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
