import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { groupPercent, groupPriceOf, priceFor } from '../common/pricing';
import { BookingsService, sessionUrl } from '../bookings/bookings.service';
import { CreateSlotsDto, ListMentorsQuery, UpdateMentorProfileDto } from './mentors.dto';

export const SLOT_MINUTES = 30;
const HORIZON_DAYS = 45;

@Injectable()
export class MentorsService {
  constructor(private prisma: PrismaService, private bookings: BookingsService) {}

  private async decorate(m: Prisma.MentorProfileGetPayload<{ include: { user: { select: { name: true } } } }>) {
    const [{ priceMinor, currency }, agg, completed, next] = await Promise.all([
      priceFor(this.prisma, m),
      this.prisma.review.aggregate({ where: { booking: { mentorId: m.id } }, _avg: { rating: true }, _count: true }),
      this.prisma.booking.count({ where: { mentorId: m.id, status: 'COMPLETED' } }),
      this.prisma.availabilitySlot.findFirst({ where: { mentorId: m.id, isBooked: false, startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' }, select: { startAt: true } }),
    ]);
    const { user, userId: _u, priceOverrideMinor, agreementAcceptedAt, ...rest } = m;
    return {
      ...rest,
      name: user.name,
      priceMinor,
      groupPriceMinor: groupPriceOf(priceMinor, await groupPercent(this.prisma)),
      currency,
      rating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      reviewCount: agg._count,
      sessionsCompleted: completed,
      nextAvailable: next?.startAt ?? null,
    };
  }

  async list(q: ListMentorsQuery) {
    await this.bookings.releaseExpiredHolds();
    const where: Prisma.MentorProfileWhereInput = { status: 'ACTIVE' };
    if (q.category) where.category = q.category;
    if (q.level) where.level = q.level;
    if (q.expertise) where.expertise = { has: q.expertise };
    if (q.industry) where.industries = { has: q.industry };
    if (q.language) where.languages = { has: q.language };
    if (q.q) {
      where.OR = [
        { user: { name: { contains: q.q, mode: 'insensitive' } } },
        { title: { contains: q.q, mode: 'insensitive' } },
        { organization: { contains: q.q, mode: 'insensitive' } },
        { expertise: { has: q.q } },
      ];
    }
    const rows = await this.prisma.mentorProfile.findMany({ where, include: { user: { select: { name: true } } } });
    let items = await Promise.all(rows.map((r) => this.decorate(r)));
    const sort = q.sort ?? 'soonest';
    items.sort((a, b) => {
      if (sort === 'price_asc') return a.priceMinor - b.priceMinor;
      if (sort === 'price_desc') return b.priceMinor - a.priceMinor;
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      return (a.nextAvailable?.getTime() ?? Infinity) - (b.nextAvailable?.getTime() ?? Infinity);
    });
    const page = q.page ?? 1, limit = q.limit ?? 24;
    return { total: items.length, page, limit, items: items.slice((page - 1) * limit, page * limit) };
  }

  async facets() {
    const rows = await this.prisma.mentorProfile.findMany({ where: { status: 'ACTIVE' }, select: { expertise: true, industries: true, languages: true } });
    const uniq = (k: 'expertise' | 'industries' | 'languages') => [...new Set(rows.flatMap((r) => r[k]))].sort();
    return { expertise: uniq('expertise'), industries: uniq('industries'), languages: uniq('languages') };
  }

  async getBySlug(slug: string) {
    await this.bookings.releaseExpiredHolds();
    const m = await this.prisma.mentorProfile.findFirst({ where: { slug, status: 'ACTIVE' }, include: { user: { select: { name: true } } } });
    if (!m) throw new NotFoundException('Mentor not found');
    const horizon = new Date(Date.now() + HORIZON_DAYS * 86400_000);
    const [base, slots, reviews] = await Promise.all([
      this.decorate(m),
      this.prisma.availabilitySlot.findMany({ where: { mentorId: m.id, isBooked: false, startAt: { gt: new Date(), lt: horizon } }, orderBy: { startAt: 'asc' }, select: { id: true, startAt: true, endAt: true, kind: true, capacity: true, seatsTaken: true } }),
      this.prisma.review.findMany({ where: { booking: { mentorId: m.id } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, rating: true, comment: true, createdAt: true, booking: { select: { agenda: true, student: { select: { name: true } } } } } }),
    ]);
    return {
      ...base,
      slots: slots.map(({ seatsTaken, ...s }) => ({ ...s, seatsLeft: s.capacity - seatsTaken })),
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, agenda: r.booking.agenda, author: r.booking.student.name.split(' ')[0] + ' ' + (r.booking.student.name.split(' ')[1]?.[0] ?? '') + '.' })),
    };
  }

  // ---------- mentor self-service ----------
  private async mine(userId: string) {
    const p = await this.prisma.mentorProfile.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!p) throw new NotFoundException('No mentor profile for this account');
    return p;
  }

  async me(userId: string) {
    const p = await this.mine(userId);
    // decorate() is shared with the public profile and drops private fields; the mentor's own view needs this one back.
    return { ...(await this.decorate(p)), agreementAcceptedAt: p.agreementAcceptedAt };
  }

  async updateMe(userId: string, dto: UpdateMentorProfileDto) {
    const p = await this.mine(userId);
    await this.prisma.mentorProfile.update({ where: { id: p.id }, data: dto });
    return this.me(userId);
  }

  async acceptAgreement(userId: string) {
    const p = await this.mine(userId);
    const at = p.agreementAcceptedAt ?? new Date();
    if (!p.agreementAcceptedAt) await this.prisma.mentorProfile.update({ where: { id: p.id }, data: { agreementAcceptedAt: at } });
    return { ok: true, agreementAcceptedAt: at };
  }

  async mySlots(userId: string) {
    const p = await this.mine(userId);
    return this.prisma.availabilitySlot.findMany({ where: { mentorId: p.id, startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' }, include: { bookings: { where: { status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } }, select: { reference: true, status: true } } } });
  }

  async addSlots(userId: string, dto: CreateSlotsDto) {
    const p = await this.mine(userId);
    if (p.status === 'SUSPENDED') throw new ForbiddenException('Your profile is suspended');
    const now = Date.now();
    const kind = dto.kind ?? 'ONE_TO_ONE';
    const data = dto.startTimes.map((s) => {
      const start = new Date(s);
      if (start.getTime() <= now) throw new BadRequestException('Slots must be in the future');
      if (start.getUTCMinutes() % SLOT_MINUTES !== 0 || start.getUTCSeconds() !== 0) throw new BadRequestException('Slots must start on the hour or half hour');
      return { mentorId: p.id, startAt: start, endAt: new Date(start.getTime() + SLOT_MINUTES * 60_000), kind, capacity: kind === 'GROUP' ? (dto.capacity ?? 4) : 1 };
    });
    // MongoDB has no skipDuplicates: drop slots that already exist for this mentor.
    const existing = await this.prisma.availabilitySlot.findMany({ where: { mentorId: p.id, startAt: { in: data.map((d) => d.startAt) } }, select: { startAt: true } });
    const taken = new Set(existing.map((e) => e.startAt.getTime()));
    const seen = new Set<number>();
    const fresh = data.filter((d) => { const t = d.startAt.getTime(); if (taken.has(t) || seen.has(t)) return false; seen.add(t); return true; });
    const res = await this.prisma.availabilitySlot.createMany({ data: fresh });
    return { created: res.count };
  }

  async removeSlot(userId: string, slotId: string) {
    const p = await this.mine(userId);
    const slot = await this.prisma.availabilitySlot.findFirst({ where: { id: slotId, mentorId: p.id } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.isBooked || slot.seatsTaken > 0) throw new ConflictException('This slot is already booked; cancel the booking first');
    await this.prisma.availabilitySlot.delete({ where: { id: slotId } });
    return { ok: true };
  }

  async myBookings(userId: string) {
    const p = await this.mine(userId);
    await this.bookings.releaseExpiredHolds();
    const rows = await this.prisma.booking.findMany({
      where: { mentorId: p.id, status: { not: 'PENDING_PAYMENT' } },
      orderBy: { slot: { startAt: 'asc' } },
      include: { slot: true, student: { select: { name: true } }, review: true },
    });
    return rows.map(({ slot, student, ...b }) => ({ ...b, meetingLink: b.status === 'CONFIRMED' || b.status === 'COMPLETED' ? sessionUrl(b.reference) : null, startAt: slot.startAt, endAt: slot.endAt, sessionKind: b.sessionKind, studentName: student.name }));
  }

  async myEarnings(userId: string) {
    const p = await this.mine(userId);
    const rows = await this.prisma.booking.groupBy({ by: ['currency', 'status'], where: { mentorId: p.id, status: { in: ['CONFIRMED', 'COMPLETED'] } }, _sum: { priceMinor: true }, _count: true });
    const commission = await this.prisma.setting.findUnique({ where: { key: 'commission_percent' } });
    return { rows, commissionPercent: commission ? Number(commission.value) : null, note: 'Payout schedule and commission are set by POINT B administrators.' };
  }
}
