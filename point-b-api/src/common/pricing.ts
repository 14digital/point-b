import { Currency, MentorCategory, MentorLevel, SessionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Pricing, convert } from './fx';

export { visitorPricing } from './fx';

/** The two base currencies. A mentor's price is always set in one of these; visitors see it converted into their own. */
export type BaseCurrency = 'PKR' | 'GBP';

export const currencyFor = (category: MentorCategory): BaseCurrency =>
  category === 'LOCAL' ? 'PKR' : 'GBP';

/** Provisional launch prices in minor units (paisa / pence). Overridable in the PricingRule table. */
export const DEFAULT_PRICES: Record<MentorLevel, { PKR: number; GBP: number }> = {
  PROFESSIONAL: { PKR: 100_000, GBP: 2_500 },
  SENIOR_SPECIALIST: { PKR: 150_000, GBP: 4_000 },
  EXECUTIVE: { PKR: 250_000, GBP: 6_000 },
};

/** A group seat costs this percentage of the 1:1 price unless an admin sets `group_price_percent`. */
export const DEFAULT_GROUP_PERCENT = 40;
export const MAX_GROUP_SEATS = 10;

export async function groupPercent(prisma: PrismaService): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: 'group_price_percent' } });
  const n = s ? Number(s.value) : DEFAULT_GROUP_PERCENT;
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_GROUP_PERCENT;
}

/** Per-seat group price, rounded to a whole major unit (100 minor units). */
export const groupPriceOf = (oneToOneMinor: number, percent: number) => Math.max(100, Math.round((oneToOneMinor * percent) / 100 / 100) * 100);

/** Provisional allowed range per tier, in minor units. Admins change these under Pricing & settings. */
export const DEFAULT_RANGES: Record<MentorLevel, { PKR: [number, number]; GBP: [number, number] }> = {
  PROFESSIONAL: { PKR: [100_000, 200_000], GBP: [2_500, 3_500] },
  SENIOR_SPECIALIST: { PKR: [150_000, 300_000], GBP: [4_000, 5_500] },
  EXECUTIVE: { PKR: [250_000, 500_000], GBP: [6_000, 9_000] },
};

export interface TierRule { level: MentorLevel; currency: BaseCurrency; priceMinor: number; minMinor: number; maxMinor: number; isDefault: boolean }

/** The tier's standard price and allowed range, falling back to the defaults for anything not saved yet. */
export async function tierRule(prisma: PrismaService, level: MentorLevel, currency: BaseCurrency): Promise<TierRule> {
  const r = await prisma.pricingRule.findUnique({ where: { level_currency: { level, currency } } });
  const [dMin, dMax] = DEFAULT_RANGES[level][currency];
  const priceMinor = r?.priceMinor ?? DEFAULT_PRICES[level][currency];
  const minMinor = Math.min(r?.minMinor ?? dMin, priceMinor);
  const maxMinor = Math.max(r?.maxMinor ?? dMax, priceMinor);
  return { level, currency, priceMinor, minMinor, maxMinor, isDefault: !r };
}

/** Every price charged stays inside its tier's range, even if the range was narrowed after a mentor's price was set. */
export const clampToRange = (minor: number, r: { minMinor: number; maxMinor: number }) => Math.min(r.maxMinor, Math.max(r.minMinor, minor));

/**
 * What a visitor pays: the mentor's own price (or their tier's), in PKR or GBP, converted into the visitor's currency
 * at today's rate when one is given. convertedFrom says which currency it was converted from, or null if not converted.
 */
export async function priceFor(
  prisma: PrismaService,
  mentor: { category: MentorCategory; level: MentorLevel; priceOverrideMinor: number | null },
  kind: SessionKind = 'ONE_TO_ONE',
  visitor: Pricing | null = null,
): Promise<{ priceMinor: number; currency: Currency; convertedFrom: BaseCurrency | null }> {
  const base = currencyFor(mentor.category);
  const rule = await tierRule(prisma, mentor.level, base);
  let priceMinor = clampToRange(mentor.priceOverrideMinor ?? rule.priceMinor, rule);
  if (kind === 'GROUP') priceMinor = groupPriceOf(priceMinor, await groupPercent(prisma));
  if (visitor && visitor.currency !== base) {
    const shown = convert(priceMinor, base, visitor.currency, visitor.rates);
    if (shown != null) return { priceMinor: shown, currency: visitor.currency, convertedFrom: base };
  }
  return { priceMinor, currency: base, convertedFrom: null };
}

/** Promo codes can never take more than this off a session. */
export const MAX_PROMO_PERCENT = 50;
/** Platform fee on a returning student's session with the same mentor, unless an admin sets `repeat_commission_percent`. */
export const DEFAULT_REPEAT_COMMISSION = 15;
export const TIER_COMMISSION_KEY: Record<MentorLevel, string> = {
  PROFESSIONAL: 'commission_professional',
  SENIOR_SPECIALIST: 'commission_senior_specialist',
  EXECUTIVE: 'commission_executive',
};

export interface CommissionRules { tier: Record<MentorLevel, number | null>; repeat: number }

const pct = (v: string | undefined) => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** Platform fee rates: one per tier (falling back to the old single `commission_percent`), plus the lower repeat-student rate. */
export async function commissionRules(prisma: PrismaService): Promise<CommissionRules> {
  const rows = await prisma.setting.findMany();
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const legacy = pct(get('commission_percent'));
  const tier = Object.fromEntries((Object.keys(TIER_COMMISSION_KEY) as MentorLevel[]).map((l) => [l, pct(get(TIER_COMMISSION_KEY[l])) ?? legacy])) as Record<MentorLevel, number | null>;
  return { tier, repeat: pct(get('repeat_commission_percent')) ?? DEFAULT_REPEAT_COMMISSION };
}

/**
 * The fee rate for one booking: the mentor's tier rate, lowered to the repeat rate when a returning student books a 1:1
 * with the same mentor (it never raises a tier that is already cheaper). null while the tier has no rate configured.
 */
export function commissionFor(rules: CommissionRules, level: MentorLevel, kind: SessionKind, repeat: boolean): number | null {
  const base = rules.tier[level];
  if (base == null) return null;
  return repeat && kind === 'ONE_TO_ONE' ? Math.min(base, rules.repeat) : base;
}

export const feeOf = (paidMinor: number, percent: number) => Math.round((paidMinor * percent) / 100);

/**
 * POINT B's fee on a booking. On a company referral booking the mentor is paid as if the student paid the full price,
 * so the fee is what POINT B would have kept at full price, less the discount it gave (it can go below zero).
 */
export function bookingFee(paidMinor: number, percent: number, opts: { listPriceMinor?: number | null; mentorPaidInFull?: boolean | null } = {}) {
  if (!opts.mentorPaidInFull) return feeOf(paidMinor, percent);
  const full = opts.listPriceMinor ?? paidMinor;
  return feeOf(full, percent) - (full - paidMinor);
}

/** The fee on a saved booking: the one recorded when it was made, or today's tier rate if none was recorded yet. */
export function feeForBooking(
  b: { priceMinor: number; platformFeeMinor: number | null; listPriceMinor?: number | null; mentorPaidInFull?: boolean | null },
  percent: number | null | undefined,
): number | null {
  if (b.platformFeeMinor != null) return b.platformFeeMinor;
  return percent == null ? null : bookingFee(b.priceMinor, percent, b);
}
