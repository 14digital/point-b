"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { Flag, countryAliases } from "./flag";

export type { CountryCode };

const nameOf = (iso: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso;

/** The number as shown beside the code: "332 6070801". A typed local leading 0 is kept until it parses. */
const display = (iso: CountryCode, digits: string) => {
  if (digits.startsWith("0")) return new AsYouType(iso).input(digits);
  const prefix = `+${getCountryCallingCode(iso)}`;
  return new AsYouType().input(prefix + digits).slice(prefix.length).trim();
};

/** Reads a stored number. Older applications may have a local number with no code, assumed to be Pakistani. */
export function parsePhone(value: string) {
  const p = parsePhoneNumberFromString(value, "PK");
  return { iso: (p?.country ?? "PK") as CountryCode, national: p?.country ? display(p.country, p.nationalNumber) : value.replace(/^\+\d{1,3}\s*/, "") };
}

/** Normalises a stored number to international format where possible, so older local numbers validate. */
export const toE164 = (value: string) => parsePhoneNumberFromString(value, "PK")?.number ?? value;

export const isValidPhone = (value: string) => !!parsePhoneNumberFromString(value)?.isValid();

/** "+923326070801" -> "+92 332 6070801", for display. */
export const formatPhone = (value: string) => parsePhoneNumberFromString(value, "PK")?.formatInternational() ?? value;

/** The full number to store: international format when it parses, otherwise code plus digits so far. */
const toFull = (iso: CountryCode, national: string) => {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "";
  return parsePhoneNumberFromString(national, iso)?.number ?? `+${getCountryCallingCode(iso)}${digits}`;
};

/** Country code picker followed by the number, formatted for that country as it's typed. */
export function PhoneInput({ id, value, iso, onIso, onChange, invalid }: { id?: string; value: string; iso: CountryCode; onIso: (iso: CountryCode) => void; onChange: (full: string) => void; invalid?: boolean }) {
  const [national, setNational] = useState(() => parsePhone(value).national);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    if (!open) return [];
    const needle = q.trim().toLowerCase().replace(/^\+/, "");
    const aliases = countryAliases();
    const all = getCountries().map((c) => ({ iso: c, name: nameOf(c), code: getCountryCallingCode(c) })).sort((a, b) => a.name.localeCompare(b.name));
    const found = all.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.code.startsWith(needle) || aliases[c.name]?.includes(needle));
    return [...found.filter((c) => c.iso === "PK"), ...found.filter((c) => c.iso !== "PK")];
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(next: CountryCode) {
    onIso(next);
    const digits = national.replace(/\D/g, "");
    setNational(digits ? display(next, digits) : "");
    onChange(toFull(next, digits));
    setOpen(false); setQ(""); setActive(0);
  }

  function type(text: string) {
    // Pasted full numbers ("+44 20...") switch the code to match.
    if (text.trim().startsWith("+")) {
      const p = parsePhoneNumberFromString(text);
      if (p?.country) { onIso(p.country); setNational(display(p.country, p.nationalNumber)); onChange(p.number); return; }
    }
    const digits = text.replace(/[^\d]/g, "");
    // Formatting only while adding digits, so backspacing over a space or bracket still works.
    const shown = digits.length >= national.replace(/\D/g, "").length ? display(iso, digits) : text;
    setNational(shown);
    onChange(toFull(iso, digits));
  }

  return (
    <div ref={box} className="relative">
      <div className={`flex items-stretch overflow-hidden rounded-xl border bg-white focus-within:border-ink/50 ${invalid ? "border-rust/60" : "border-line"}`}>
        <button type="button" aria-label={`Country code: ${nameOf(iso)} +${getCountryCallingCode(iso)}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); setActive(0); }}
          className="flex shrink-0 items-center gap-1.5 border-r border-line bg-paper/70 pl-3 pr-2.5 text-sm text-ink transition-colors hover:bg-paper-dim">
          <Flag country={nameOf(iso)} />
          <span className="tabular-nums">+{getCountryCallingCode(iso)}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden className={`text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft/60" placeholder="Phone number" value={national} onChange={(e) => type(e.target.value)} />
      </div>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-full min-w-[17rem] animate-[pop_160ms_ease-out] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-20px_rgba(17,17,17,0.35)] ring-1 ring-ink/10">
          <div className="border-b border-line p-2">
            <input autoFocus className="w-full rounded-xl bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft/60" placeholder="Search country or code" value={q} aria-label="Search country or code"
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); if (matches[active]) choose(matches[active].iso); }
              }} />
          </div>
          <ul ref={list} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain p-1">
            {matches.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-soft">No country found</li>}
            {matches.map((c, i) => (
              <li key={c.iso} role="option" aria-selected={c.iso === iso}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(c.iso)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink ${i === active ? "bg-paper" : ""}`}>
                  <Flag country={c.name} /><span className="min-w-0 flex-1 truncate">{c.name}</span><span className="shrink-0 tabular-nums text-ink-soft">+{c.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
