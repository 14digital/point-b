import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { feeForBooking } from '../common/pricing';
import { CreateReferralDto, UpdateReferralDto } from './referrals.dto';

const PAID: BookingStatus[] = ['CONFIRMED', 'COMPLETED'];
type Totals = Partial<Record<Currency, { paidMinor: number; discountMinor: number; mentorMinor: number }>>;

/** Company referral codes: made by the team for one mentor; students save, the mentor is paid in full. */
@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService) {}

  private async uniqueCode(base: string) {
    const clean = base.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16) || 'POINTB';
    for (let i = 0; i < 50; i++) {
      const code = i === 0 ? clean : `${clean}${i + 1}`;
      const taken = (await this.prisma.referralCode.findUnique({ where: { code } })) || (await this.prisma.promoCode.findUnique({ where: { code } }));
      if (!taken) return code;
    }
    throw new ConflictException('Could not make a free code. Please type one.');
  }

  /** Every code with its mentor and what it has done: bookings, what students paid and saved, what mentors earned. */
  async list() {
    const codes = await this.prisma.referralCode.findMany({ orderBy: { createdAt: 'desc' } });
    const [mentors, bookings] = await Promise.all([
      this.prisma.mentorProfile.findMany({ where: { id: { in: [...new Set(codes.map((c) => c.mentorId))] } }, select: { id: true, slug: true, level: true, photoUrl: true, title: true, user: { select: { name: true } } } }),
      this.prisma.booking.findMany({ where: { referralCodeId: { in: codes.map((c) => c.id) } }, select: { referralCodeId: true, status: true, currency: true, priceMinor: true, listPriceMinor: true, discountMinor: true, platformFeeMinor: true, mentorPaidInFull: true, commissionPercent: true, createdAt: true } }),
    ]);
    const now = new Date();
    return codes.map((c) => {
      const mine = bookings.filter((b) => b.referralCodeId === c.id);
      const paid = mine.filter((b) => PAID.includes(b.status));
      const totals: Totals = {};
      for (const b of paid) {
        const t = (totals[b.currency] ??= { paidMinor: 0, discountMinor: 0, mentorMinor: 0 });
        t.paidMinor += b.priceMinor;
        t.discountMinor += b.discountMinor ?? 0;
        const fee = feeForBooking(b, b.commissionPercent);
        t.mentorMinor += fee == null ? b.listPriceMinor ?? b.priceMinor : b.priceMinor - fee;
      }
      const used = mine.filter((b) => b.status === 'PENDING_PAYMENT' || PAID.includes(b.status)).length;
      const state = c.pausedAt ? 'PAUSED' : c.expiresAt && c.expiresAt < now ? 'EXPIRED' : c.maxUses != null && used >= c.maxUses ? 'USED_UP' : 'ACTIVE';
      const m = mentors.find((x) => x.id === c.mentorId);
      return {
        id: c.id, code: c.code, percentOff: c.percentOff, note: c.note, maxUses: c.maxUses, expiresAt: c.expiresAt, createdAt: c.createdAt, state,
        uses: used, bookings: paid.length, lastUsedAt: paid.length ? paid.reduce((a, b) => (b.createdAt > a ? b.createdAt : a), paid[0].createdAt) : null, totals,
        mentor: m ? { id: m.id, slug: m.slug, name: m.user.name, title: m.title, photoUrl: m.photoUrl, level: m.level } : null,
      };
    });
  }

  async create(adminId: string, dto: CreateReferralDto) {
    const mentor = await this.prisma.mentorProfile.findUnique({ where: { id: dto.mentorId }, select: { id: true, user: { select: { name: true } } } });
    if (!mentor) throw new NotFoundException('Mentor not found');
    let code: string;
    if (dto.code) {
      code = dto.code.toUpperCase();
      if ((await this.prisma.referralCode.findUnique({ where: { code } })) || (await this.prisma.promoCode.findUnique({ where: { code } }))) throw new ConflictException('That code is already in use. Try another.');
    } else {
      code = await this.uniqueCode(`${mentor.user.name.split(' ').find((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w)) ?? 'POINTB'}${dto.percentOff}`);
    }
    if (dto.expiresAt && new Date(dto.expiresAt) < new Date()) throw new BadRequestException('The end date must be in the future.');
    await this.prisma.referralCode.create({ data: { code, mentorId: mentor.id, percentOff: dto.percentOff, note: dto.note?.trim() ?? '', maxUses: dto.maxUses ?? null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, createdBy: adminId } });
    await this.prisma.auditLog.create({ data: { adminId, action: 'REFERRAL_CODE_CREATED', entityType: 'ReferralCode', entityId: code, detail: JSON.stringify(dto) } }).catch(() => undefined);
    return this.list();
  }

  async update(adminId: string, id: string, dto: UpdateReferralDto) {
    const c = await this.prisma.referralCode.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Code not found');
    if (dto.expiresAt && new Date(dto.expiresAt) < new Date()) throw new BadRequestException('The end date must be in the future.');
    await this.prisma.referralCode.update({ where: { id }, data: {
      ...(dto.paused !== undefined ? { pausedAt: dto.paused ? new Date() : null } : {}),
      ...(dto.percentOff !== undefined ? { percentOff: dto.percentOff } : {}),
      ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
      ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
      ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
    } });
    await this.prisma.auditLog.create({ data: { adminId, action: 'REFERRAL_CODE_UPDATED', entityType: 'ReferralCode', entityId: c.code, detail: JSON.stringify(dto) } }).catch(() => undefined);
    return this.list();
  }

  /** A mentor's own live codes, to share with students. */
  async forMentor(userId: string) {
    const m = await this.prisma.mentorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!m) return [];
    const all = await this.list();
    return all.filter((c) => c.mentor?.id === m.id && c.state !== 'PAUSED').map(({ id, code, percentOff, state, expiresAt, maxUses, uses, bookings }) => ({ id, code, percentOff, state, expiresAt, maxUses, uses, bookings }));
  }
}
