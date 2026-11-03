const ALIASES: Record<string, string> = {
  uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  usa: "US", us: "US", "united states of america": "US", america: "US", uae: "AE", ksa: "SA", "saudi": "SA",
};

// Retired or alias codes the browser still names (e.g. DD "Germany", UK "United Kingdom"); never use them for a flag.
const SKIP = new Set(["UK", "DD", "FX", "SU", "YU", "ZR", "TP", "BU", "CS", "NT", "YD", "AN", "EU", "EZ", "UN", "QO", "ZZ", "AC", "CP", "DG", "EA", "IC", "TA", "XA", "XB"]);

let byName: Map<string, string> | null = null;
let displayNames: string[] | null = null;

function buildCountries() {
  if (byName) return byName;
  byName = new Map();
  displayNames = [];
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (SKIP.has(code)) continue;
    try {
      const n = names.of(code);
      if (n && n.toLowerCase() !== code.toLowerCase() && !byName.has(n.toLowerCase())) { byName.set(n.toLowerCase(), code); displayNames.push(n); }
    } catch { /* not a region */ }
  }
  displayNames.sort((x, y) => x.localeCompare(y));
  return byName;
}

/** Every country's English name, alphabetically. */
export function countryNames(): string[] {
  buildCountries();
  return displayNames!;
}

/** Country name -> the short names people search by ("uk", "usa"). */
export function countryAliases(): Record<string, string[]> {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const out: Record<string, string[]> = {};
  for (const [alias, code] of Object.entries(ALIASES)) (out[names.of(code) ?? ""] ??= []).push(alias);
  return out;
}

/** The recognised country at the end of a place ("Lahore, Pakistan" -> "Pakistan"), or "". */
export function countryIn(place: string): string {
  const code = countryCode(place);
  return code ? new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? "" : "";
}

/** ISO 3166 code for an English country name, using the browser's own country list. "Lahore, Pakistan" → "PK". */
export function countryCode(place: string): string | null {
  const name = place.split(",").pop()!.trim().toLowerCase();
  if (!name) return null;
  if (ALIASES[name]) return ALIASES[name];
  if (/^[a-z]{2}$/.test(name)) return name.toUpperCase();
  return buildCountries().get(name) ?? null;
}

/** A small rounded country flag, or nothing if the country isn't recognised. */
export function Flag({ country, className = "h-3.5 w-5" }: { country: string; className?: string }) {
  const code = countryCode(country);
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://flagcdn.com/${code.toLowerCase()}.svg`} alt="" title={country.split(",").pop()!.trim()} loading="lazy"
      className={`inline-block shrink-0 rounded-[3px] object-cover ring-1 ring-black/10 ${className}`} />
  );
}
