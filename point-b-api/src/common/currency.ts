import { Currency } from '@prisma/client';

export const CURRENCIES = Object.values(Currency);

const SYMBOL: Record<Currency, string> = {
  PKR: 'Rs ', GBP: '£', USD: '$', EUR: '€', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$',
  INR: '₹', BDT: '৳', KES: 'KSh ', NGN: '₦', ZAR: 'R ', SGD: 'S$', MYR: 'RM ', TRY: '₺',
  OMR: 'OMR ', KWD: 'KWD ', BHD: 'BHD ', JOD: 'JOD ', EGP: 'EGP ', LKR: 'LKR ', NPR: 'NPR ', HKD: 'HK$', CNY: 'CN¥', PHP: '₱',
  THB: '฿', IDR: 'Rp ', CHF: 'CHF ', SEK: 'SEK ', NOK: 'NOK ', DKK: 'DKK ',
};

/** "Rs 1,000", "£25", "$40.50". Amounts are stored in minor units (paisa, pence, cents). */
export const money = (minor: number, currency: Currency) =>
  `${SYMBOL[currency]}${(minor / 100).toLocaleString(currency === 'PKR' ? 'en-PK' : 'en-GB', { maximumFractionDigits: 2 })}`;

/** PKR and GBP always appear in reports; any other currency appears once something has been charged in it. */
export const reportCurrencies = (rows: { currency: Currency }[]): Currency[] => [...new Set<Currency>(['PKR', 'GBP', ...rows.map((r) => r.currency)])];

/** Every currency the student holds or could hold, zero where there is nothing. */
export const emptyBalances = () => Object.fromEntries(CURRENCIES.map((c) => [c, 0])) as Record<Currency, number>;
