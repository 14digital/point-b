import { Currency, MentorCategory, MentorLevel, SessionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const currencyFor = (category: MentorCategory): Currency =>
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

export async function priceFor(
  prisma: PrismaService,
  mentor: { category: MentorCategory; level: MentorLevel; priceOverrideMinor: number | null },
  kind: SessionKind = 'ONE_TO_ONE',
): Promise<{ priceMinor: number; currency: Currency }> {
  const currency = currencyFor(mentor.category);
  let priceMinor: number;
  if (mentor.priceOverrideMinor != null) priceMinor = mentor.priceOverrideMinor;
  else {
    const rule = await prisma.pricingRule.findUnique({ where: { level_currency: { level: mentor.level, currency } } });
    priceMinor = rule?.priceMinor ?? DEFAULT_PRICES[mentor.level][currency];
  }
  if (kind === 'GROUP') priceMinor = groupPriceOf(priceMinor, await groupPercent(prisma));
  return { priceMinor, currency };
}
