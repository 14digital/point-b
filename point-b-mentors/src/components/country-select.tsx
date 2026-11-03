"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, countryAliases, countryNames } from "./flag";

export const isLocalCountry = (country: string) => /pakistan/i.test(country);

/** Tells people what their country means for how they're listed. */
export const listingNote = (country: string) =>
  isLocalCountry(country) ? "You'll be listed as a local mentor, with prices in PKR." : "You'll be listed as an international mentor, with prices in GBP and your flag on your profile.";

/** Searchable country picker. Pakistan comes first because most mentors are there. */
export function CountrySelect({ value, onChange, invalid, id }: { value: string; onChange: (country: string) => void; invalid?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    if (!open) return [];
    const needle = q.trim().toLowerCase();
    const aliases = countryAliases();
    const all = countryNames().filter((n) => !needle || n.toLowerCase().includes(needle) || aliases[n]?.includes(needle));
    return [...all.filter((n) => n === "Pakistan"), ...all.filter((n) => n !== "Pakistan")];
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

  function choose(name: string) {
    onChange(name);
    setOpen(false); setQ(""); setActive(0);
  }

  return (
    <div ref={box} className="relative">
      <button type="button" id={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); setActive(0); }}
        className={`input flex items-center justify-between gap-2 text-left ${invalid ? "border-rust/60" : ""}`}>
        <span className="flex min-w-0 items-center gap-2">
          {value && <Flag country={value} />}
          <span className={`truncate ${value ? "text-ink" : "text-ink-soft/60"}`}>{value || "Select your country"}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 animate-[pop_160ms_ease-out] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-20px_rgba(17,17,17,0.35)] ring-1 ring-ink/10">
          <div className="border-b border-line p-2">
            <input autoFocus className="w-full rounded-xl bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft/60" placeholder="Search countries" value={q} aria-label="Search countries"
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); if (matches[active]) choose(matches[active]); }
              }} />
          </div>
          <ul ref={list} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain p-1">
            {matches.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-soft">No country found</li>}
            {matches.map((n, i) => (
              <li key={n} role="option" aria-selected={n === value}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(n)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink ${i === active ? "bg-paper" : ""}`}>
                  <Flag country={n} /><span className="min-w-0 flex-1 truncate">{n}</span>
                  {n === value && <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
