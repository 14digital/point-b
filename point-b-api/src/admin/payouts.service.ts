import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { emailDate, webUrl } from '../common/email-template';
import { commissionRules, feeForBooking } from '../common/pricing';
import { money as formatMoney } from '../common/currency';
import { RecordPayoutDto } from './admin.dto';

const PAID = ['CONFIRMED', 'COMPLETED'] as const;
const unpaid = { OR: [{ payoutId: null }, { payoutId: { isSet: false } }] };
const isObjectId = (id: string) => /^[a-f0-9]{24}$/i.test(id);

@Injectable()
export class PayoutsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  /** A mentor's paid sessions in the period (by when they were booked), with what they earn and whether it has been paid. */
  async mentorSessions(mentorId: string, currency: Currency, from?: Date, to?: Date) {
    if (!isObjectId(mentorId)) throw new NotFoundException('Mentor not found');
    const mentor = await this.prisma.mentorProfile.findUnique({ where: { id: mentorId }, select: { id: true, level: true, photoUrl: true, payoutDetails: true, user: { select: { name: true, email: true } } } });
    if (!mentor) throw new NotFoundException('Mentor not found');
    const rules = await commissionRules(this.prisma);
    const rows = await this.prisma.booking.findMany({
      where: { mentorId, currency, status: { in: [...PAID] }, ...(from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } } : {}) },
      orderBy: { slot: { startAt: 'desc' } },
      select: {
        id: true, reference: true, status: true, sessionKind: true, repeatStudent: true, priceMinor: true, platformFeeMinor: true, listPriceMinor: true, mentorPaidInFull: true, commissionPercent: true, payoutId: true,
        slot: { select: { startAt: true, endAt: true } }, student: { select: { name: true } },
        payout: { select: { id: true, createdAt: true, reference: true, note: true, sessions: true, amountMinor: true } },
      },
    });
    const sessions = rows.map((b) => {
      const percent = b.commissionPercent ?? rules.tier[mentor.level];
      const feeMinor = feeForBooking(b, percent);
      return {
        id: b.id, reference: b.reference, status: b.status, kind: b.sessionKind, returning: !!b.repeatStudent,
        startAt: b.slot.startAt, endAt: b.slot.endAt, studentName: b.student.name,
        priceMinor: b.priceMinor, percent, feeMinor, payoutMinor: feeMinor == null ? null : b.priceMinor - feeMinor,
        payout: b.payout,
      };
    });
    const sum = (list: typeof sessions) => list.reduce((n, s) => n + (s.payoutMinor ?? 0), 0);
    const open = sessions.filter((s) => !s.payout);
    return {
      mentor: { id: mentor.id, name: mentor.user.name, email: mentor.user.email, level: mentor.level, photoUrl: mentor.photoUrl, payoutDetails: mentor.payoutDetails },
      currency, configured: sessions.every((s) => s.payoutMinor != null),
      earnedMinor: sum(sessions), paidMinor: sum(sessions.filter((s) => s.payout)), dueMinor: sum(open), unpaidCount: open.length,
      sessions,
    };
  }

  /** Records one payout covering the chosen sessions. Each session can only ever be in one payout. */
  async record(adminId: string, dto: RecordPayoutDto) {
    const ids = [...new Set(dto.bookingIds)];
    const rules = await commissionRules(this.prisma);
    const rows = await this.prisma.booking.findMany({
      where: { id: { in: ids } },
      select: { id: true, mentorId: true, currency: true, status: true, priceMinor: true, platformFeeMinor: true, listPriceMinor: true, mentorPaidInFull: true, commissionPercent: true, payoutId: true, mentor: { select: { level: true, user: { select: { name: true } } } } },
    });
    if (rows.length !== ids.length || rows.some((b) => b.mentorId !== dto.mentorId)) throw new BadRequestException('Some of these sessions are not this mentor\'s');
    if (rows.some((b) => !(PAID as readonly string[]).includes(b.status))) throw new BadRequestException('Only paid sessions can be paid out');
    if (rows.some((b) => b.payoutId)) throw new ConflictException('Some of these sessions have already been paid. Refresh and try again.');
    const currencies = new Set(rows.map((b) => b.currency));
    if (currencies.size !== 1) throw new BadRequestException('A payout must be in a single currency');

    // Fix the fee on older bookings now, so a later commission change can't alter what was paid.
    let amountMinor = 0;
    for (const b of rows) {
      const percent = b.commissionPercent ?? rules.tier[b.mentor.level];
      if (b.platformFeeMinor == null && percent == null) throw new BadRequestException('Set the commission for this tier before paying out');
      const fee = feeForBooking(b, percent)!;
      if (b.platformFeeMinor == null) await this.prisma.booking.update({ where: { id: b.id }, data: { platformFeeMinor: fee, commissionPercent: percent } });
      amountMinor += b.priceMinor - fee;
    }

    const payout = await this.prisma.mentorPayout.create({
      data: { mentorId: dto.mentorId, currency: [...currencies][0], amountMinor, sessions: ids.length, reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, paidBy: adminId },
    });
    // Claim only sessions that are still unpaid; if another admin got there first, roll this payout back.
    const claimed = await this.prisma.booking.updateMany({ where: { id: { in: ids }, ...unpaid }, data: { payoutId: payout.id } });
    if (claimed.count !== ids.length) {
      await this.prisma.booking.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null } });
      await this.prisma.mentorPayout.delete({ where: { id: payout.id } });
      throw new ConflictException('Some of these sessions were just paid by someone else. Refresh and try again.');
    }
    await this.sendStatement(payout.id);
    await this.prisma.auditLog.create({ data: { adminId, action: 'MENTOR_PAYOUT_RECORDED', entityType: 'MentorPayout', entityId: payout.id, detail: `${rows[0].mentor.user.name}: ${amountMinor} ${payout.currency} for ${ids.length} session(s)${payout.reference ? `, ref ${payout.reference}` : ''}` } });
    return payout;
  }

  /** Emails the mentor a statement: what was paid, for which sessions, and the transfer reference. */
  private async sendStatement(payoutId: string) {
    const p = await this.prisma.mentorPayout.findUnique({
      where: { id: payoutId },
      include: { mentor: { select: { userId: true, user: { select: { name: true, email: true } } } }, bookings: { orderBy: { slot: { startAt: 'asc' } }, select: { reference: true, priceMinor: true, platformFeeMinor: true, listPriceMinor: true, mentorPaidInFull: true, slot: { select: { startAt: true } }, student: { select: { name: true } } } } },
    });
    if (!p) return;
    const money = (minor: number) => formatMoney(minor, p.currency);
    const lines = p.bookings.map((b) => `• ${emailDate(b.slot.startAt, 'Asia/Karachi').replace(/ Pakistan Standard Time$/, '')} with ${b.student.name} (${b.reference}): ${money(b.priceMinor - (b.platformFeeMinor ?? 0))}`).join('\n');
    await this.notify.send(p.mentor.user.email, `Payment sent: ${money(p.amountMinor)}`,
      `Hi ${p.mentor.user.name.split(' ')[0]},\n\nWe have sent you ${money(p.amountMinor)} for ${p.sessions} session${p.sessions === 1 ? '' : 's'}. It may take a working day to reach your account.\n\n${lines}${p.note ? `\n\nNote from our team: ${p.note}` : ''}\n\nThank you for mentoring with POINT B.`,
      p.mentor.userId, { emailOnly: true, cta: { label: 'View your earnings', url: `${webUrl()}/dashboard/mentor` }, facts: [['Amount', money(p.amountMinor)], ['Sessions', String(p.sessions)], ['Sent on', emailDate(p.createdAt, 'Asia/Karachi')], ...(p.reference ? [['Transfer reference', p.reference] as [string, string]] : [])] });
  }

  /** Undoes a payout recorded by mistake: its sessions become unpaid again. */
  async undo(adminId: string, id: string) {
    if (!isObjectId(id)) throw new NotFoundException('Payout not found');
    const payout = await this.prisma.mentorPayout.findUnique({ where: { id }, include: { mentor: { select: { user: { select: { name: true } } } } } });
    if (!payout) throw new NotFoundException('Payout not found');
    await this.prisma.booking.updateMany({ where: { payoutId: id }, data: { payoutId: null } });
    await this.prisma.mentorPayout.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { adminId, action: 'MENTOR_PAYOUT_UNDONE', entityType: 'MentorPayout', entityId: id, detail: `${payout.mentor.user.name}: ${payout.amountMinor} ${payout.currency} for ${payout.sessions} session(s)` } });
    return { ok: true };
  }
}
