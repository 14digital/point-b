import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { commissionRules, feeOf } from '../common/pricing';

const KINDS = ['bookings', 'payouts', 'refunds'] as const;
export type ExportKind = (typeof KINDS)[number];
export const isExportKind = (k: string): k is ExportKind => (KINDS as readonly string[]).includes(k);

/** Spreadsheet-safe CSV: quoted cells, and no leading = + - @ that a spreadsheet would run as a formula. */
const cell = (v: unknown) => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 16) : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
const major = (minor: number | null | undefined) => (minor == null ? null : (minor / 100).toFixed(2));

/** CSV exports for the accountant: bookings with the full money split, mentor payouts, and refunds. */
@Injectable()
export class ExportsService {
  constructor(private prisma: PrismaService) {}

  async build(kind: ExportKind, from?: Date, to?: Date) {
    if (!isExportKind(kind)) throw new BadRequestException('Unknown export');
    const range = from || to ? { ...(from && { gte: from }), ...(to && { lt: to }) } : undefined;
    if (kind === 'payouts') {
      const rows = await this.prisma.mentorPayout.findMany({ where: range ? { createdAt: range } : {}, orderBy: { createdAt: 'asc' }, include: { mentor: { select: { user: { select: { name: true, email: true } } } }, bookings: { select: { reference: true } } } });
      const admins = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.paidBy))] } }, select: { id: true, name: true } });
      return csv(['Paid on', 'Mentor', 'Mentor email', 'Currency', 'Amount', 'Sessions', 'Bookings', 'Transfer reference', 'Note', 'Recorded by'],
        rows.map((r) => [r.createdAt, r.mentor.user.name, r.mentor.user.email, r.currency, major(r.amountMinor), r.sessions, r.bookings.map((b) => b.reference).join(' '), r.reference, r.note, admins.find((a) => a.id === r.paidBy)?.name]));
    }
    const rules = await commissionRules(this.prisma);
    const rows = await this.prisma.booking.findMany({
      where: { ...(range ? { createdAt: range } : {}), ...(kind === 'refunds' ? { status: 'CANCELLED', payments: { some: { status: 'REFUNDED' } } } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        slot: { select: { startAt: true } }, student: { select: { name: true, email: true } },
        mentor: { select: { level: true, user: { select: { name: true } } } },
        payments: { orderBy: { createdAt: 'desc' } }, payout: { select: { createdAt: true, reference: true } },
      },
    });
    if (kind === 'refunds') {
      return csv(['Cancelled on', 'Booking', 'Student', 'Student email', 'Mentor', 'Currency', 'Amount refunded', 'Paid by', 'Reason'],
        rows.map((b) => { const p = b.payments.find((x) => x.status === 'REFUNDED'); return [b.cancelledAt, b.reference, b.student.name, b.student.email, b.mentor.user.name, b.currency, major(b.priceMinor), p?.bankSubmittedAt ? 'Bank / QR' : p?.provider === 'stripe' ? 'Card (refunded automatically)' : p?.provider, b.cancelReason]; }));
    }
    return csv(['Booked on', 'Booking', 'Session date', 'Status', 'Student', 'Student email', 'Mentor', 'Tier', 'Type', 'Currency', 'List price', 'Discount', 'Paid', 'Commission %', 'Company revenue', 'Mentor earns', 'Payment method', 'Payment status', 'Transaction ID', 'Mentor paid on', 'Payout reference', 'Cancel reason'],
      rows.map((b) => {
        const paid = b.status === 'CONFIRMED' || b.status === 'COMPLETED';
        const pct = b.commissionPercent ?? rules.tier[b.mentor.level];
        const fee = paid ? (b.platformFeeMinor ?? (pct == null ? null : feeOf(b.priceMinor, pct))) : null;
        const p = b.payments.find((x) => x.status !== 'FAILED') ?? b.payments[0];
        return [b.createdAt, b.reference, b.slot.startAt, b.status, b.student.name, b.student.email, b.mentor.user.name, b.mentor.level, b.sessionKind === 'GROUP' ? 'Group' : '1:1', b.currency,
          major(b.listPriceMinor ?? b.priceMinor), major(b.discountMinor ?? 0), major(b.priceMinor), paid ? pct : null, major(fee), fee == null ? null : major(b.priceMinor - fee),
          p ? (p.bankSubmittedAt ? 'Bank / QR' : p.provider === 'stripe' ? 'Card' : p.provider === 'mock' ? 'Demo' : p.provider) : null, p?.status, p?.bankTxnRef, b.payout?.createdAt, b.payout?.reference, b.cancelReason];
      }));
  }
}
