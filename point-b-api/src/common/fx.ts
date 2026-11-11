import { Logger } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Automatic local prices. Every mentor has one price in PKR (local mentors) or GBP (international mentors); a visitor
 * sees and pays it in their own country's currency, converted at the day's exchange rate and rounded to a tidy amount.
 * Rates come from open.er-api.com (free, no key), refreshed every 6 hours and saved so a short outage changes nothing.
 */

const log = new Logger('Exchange rates');
const RATES_KEY = 'fx_rates';
const REFRESH_MS = 6 * 3600_000;
const SOURCE = 'https://open.er-api.com/v6/latest/USD';

/** Currencies with three decimal places. Stripe takes these in thousandths; everything here stores hundredths. */
export const THREE_DECIMAL = new Set<Currency>(['OMR', 'KWD', 'BHD', 'JOD'] as Currency[]);

/** Each country's own currency (ISO country code to currency). Countries not listed see US dollars. */
const BY_COUNTRY: Record<string, Currency> = {
  PK: 'PKR', GB: 'GBP', IM: 'GBP', JE: 'GBP', GG: 'GBP',
  US: 'USD', PR: 'USD', EC: 'USD', SV: 'USD', PA: 'USD',
  OM: 'OMR', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', JO: 'JOD', EG: 'EGP',
  IN: 'INR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', MY: 'MYR', HK: 'HKD', CN: 'CNY', PH: 'PHP', TH: 'THB', ID: 'IDR',
  KE: 'KES', NG: 'NGN', ZA: 'ZAR', TR: 'TRY',
  CH: 'CHF', LI: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  // Euro area
  AT: 'EUR', BE: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR',
  LV: 'EUR', LT: 'EUR', LU: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR', AD: 'EUR', ME: 'EUR', XK: 'EUR',
} as Record<string, Currency>;

export const currencyForCountry = (country?: string | null): Currency => (country && BY_COUNTRY[country.toUpperCase()]) || 'USD';

type Rates = { at: number; rates: Record<string, number> };
let cached: Rates | null = null;
let loading: Promise<Rates | null> | null = null;

async function fetchRates(prisma: PrismaService): Promise<Rates | null> {
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(6000) });
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (!res.ok || json.result !== 'success' || !json.rates?.GBP || !json.rates?.PKR) throw new Error(`status ${res.status}`);
    const fresh = { at: Date.now(), rates: json.rates };
    await prisma.setting.upsert({ where: { key: RATES_KEY }, create: { key: RATES_KEY, value: JSON.stringify(fresh) }, update: { value: JSON.stringify(fresh) } });
    return fresh;
  } catch (e) {
    log.warn(`Could not refresh exchange rates (${(e as Error).message}); using the last saved ones`);
    const saved = await prisma.setting.findUnique({ where: { key: RATES_KEY } });
    return saved ? (JSON.parse(saved.value) as Rates) : null;
  }
}

/** Today's rates against the US dollar, or null if none have ever been fetched. */
export async function exchangeRates(prisma: PrismaService): Promise<Rates | null> {
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached;
  if (!cached) {
    const saved = await prisma.setting.findUnique({ where: { key: RATES_KEY } });
    if (saved) cached = JSON.parse(saved.value) as Rates;
    if (cached && Date.now() - cached.at < REFRESH_MS) return cached;
  }
  loading ??= fetchRates(prisma).then((r) => { if (r) cached = r; loading = null; return r; });
  return (await loading) ?? cached;
}

/** A tidy price: small amounts to the nearest half, then whole units, fives, tens and hundreds as amounts grow. */
function tidy(major: number) {
  const step = major < 10 ? 0.5 : major < 200 ? 1 : major < 2000 ? 5 : major < 20000 ? 10 : 100;
  return Math.max(step, Math.round(major / step) * step);
}

/** The visitor's currency and today's rates, so prices can be converted. */
export interface Pricing { currency: Currency; rates: Record<string, number> }

export async function visitorPricing(prisma: PrismaService, country?: string | null): Promise<Pricing | null> {
  if (!country) return null; // location unknown: show the mentor's own PKR or GBP price
  const currency = currencyForCountry(country);
  const r = await exchangeRates(prisma);
  if (!r || !r.rates[currency]) return null;
  return { currency, rates: r.rates };
}

/** Converts an amount in minor units (hundredths) from one currency to another and rounds it. Same currency: unchanged. */
export function convert(minor: number, from: Currency, to: Currency, rates: Record<string, number>): number | null {
  if (from === to) return minor;
  const a = rates[from], b = rates[to];
  if (!a || !b) return null;
  return Math.round(tidy(((minor / 100) / a) * b) * 100);
}
