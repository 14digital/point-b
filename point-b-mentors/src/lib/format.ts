import type { Currency, Slot } from "./types";

const SYMBOL: Record<Currency, string> = {
  PKR: "Rs ", GBP: "£", USD: "$", EUR: "€", AED: "AED ", SAR: "SAR ", QAR: "QAR ", CAD: "CA$", AUD: "A$", NZD: "NZ$",
  INR: "₹", BDT: "৳", KES: "KSh ", NGN: "₦", ZAR: "R ", SGD: "S$", MYR: "RM ", TRY: "₺",
  OMR: "OMR ", KWD: "KWD ", BHD: "BHD ", JOD: "JOD ", EGP: "EGP ", LKR: "LKR ", NPR: "NPR ", HKD: "HK$", CNY: "CN¥", PHP: "₱",
  THB: "฿", IDR: "Rp ", CHF: "CHF ", SEK: "SEK ", NOK: "NOK ", DKK: "DKK ",
};
export const CURRENCIES = Object.keys(SYMBOL) as Currency[];
export const currencySymbol = (currency: Currency) => SYMBOL[currency];

export function formatMoney(minor: number, currency: Currency): string {
  const major = minor / 100;
  return `${SYMBOL[currency]}${major.toLocaleString(currency === "PKR" ? "en-PK" : "en-GB", { maximumFractionDigits: 2 })}`;
}

/** "British Pound · GBP" */
export const currencyLabel = (currency: Currency) => `${new Intl.DisplayNames(["en"], { type: "currency" }).of(currency)} · ${currency}`;

/** A country's flag, built from its two-letter code. */
export const countryFlag = (code: string) => (/^[A-Za-z]{2}$/.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "");
export const countryName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;

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
