import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WalletKind = 'CANCELLATION' | 'LATE_PAYMENT' | 'SPEND' | 'RETURN' | 'ADJUSTMENT';
export type Balances = Record<Currency, number>;

/**
 * The student's POINT B balance. Cancelled paid sessions are credited here instead of being refunded, and the
 * balance pays for later sessions in the same currency. Every change is a ledger entry, so the history explains it.
 */
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async balances(userId: string): Promise<Balances> {
    const rows = await this.prisma.walletEntry.groupBy({ by: ['currency'], where: { userId }, _sum: { amountMinor: true } });
    return { PKR: rows.find((r) => r.currency === 'PKR')?._sum.amountMinor ?? 0, GBP: rows.find((r) => r.currency === 'GBP')?._sum.amountMinor ?? 0 };
  }

  entries(userId: string, take = 50) {
    return this.prisma.walletEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take, select: { id: true, currency: true, amountMinor: true, kind: true, reference: true, note: true, createdAt: true } });
  }

  async summary(userId: string) {
    const [balances, entries] = await Promise.all([this.balances(userId), this.entries(userId)]);
    return { balances, entries };
  }

  add(userId: string, currency: Currency, amountMinor: number, kind: WalletKind, extra: { bookingId?: string; reference?: string; note?: string; createdBy?: string } = {}) {
    return this.prisma.walletEntry.create({ data: { userId, currency, amountMinor, kind, ...extra } });
  }

  /** Total held in all students' balances: money owed to students as future sessions. */
  async totalsHeld(): Promise<Balances> {
    const rows = await this.prisma.walletEntry.groupBy({ by: ['currency'], _sum: { amountMinor: true } });
    return { PKR: rows.find((r) => r.currency === 'PKR')?._sum.amountMinor ?? 0, GBP: rows.find((r) => r.currency === 'GBP')?._sum.amountMinor ?? 0 };
  }

  /** An unpaid booking that used some balance was released: put that balance back, once. */
  async returnUnused(booking: { id: string; reference: string; studentId: string; currency: Currency; walletAppliedMinor: number | null }) {
    if (!booking.walletAppliedMinor) return;
    const already = await this.prisma.walletEntry.count({ where: { bookingId: booking.id, kind: 'RETURN' } });
    if (already) return;
    await this.add(booking.studentId, booking.currency, booking.walletAppliedMinor, 'RETURN', { bookingId: booking.id, reference: booking.reference, note: 'Booking not completed, balance returned' });
  }
}
