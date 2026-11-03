import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, MentorCategory, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { DailyService } from '../calls/daily.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { PasswordLinksService } from '../common/password-links.service';

/** How long a new mentor's "set your password" link stays valid. */
const SETUP_LINK_DAYS = 7;
import { emailDate, webUrl } from '../common/email-template';

/** How long an applicant's update link stays valid. */
export const EDIT_LINK_DAYS = 14;
/** Pakistan is local; anywhere else is international. Decides the mentor's listing and currency. */
const categoryFor = (country: string): MentorCategory => (/pakistan/i.test(country) ? 'LOCAL' : 'INTERNATIONAL');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
import { DEFAULT_PRICES, commissionRules, currencyFor, feeOf, groupPercent, priceFor, tierRule } from '../common/pricing';
import { AdminEditApplicationDto } from '../applications/applications.dto';
import { InterviewDto, PricingRuleDto, ScorecardDto, SettingDto, UpdateMentorAdminDto } from './admin.dto';

const S = ApplicationStatus;
export const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  SUBMITTED: [S.UNDER_REVIEW, S.REJECTED],
  UNDER_REVIEW: [S.SHORTLISTED, S.WAITLISTED, S.CHANGES_REQUESTED, S.REJECTED],
  SHORTLISTED: [S.INTERVIEW_SCHEDULED, S.REJECTED],
  INTERVIEW_SCHEDULED: [S.INTERVIEW_COMPLETED],
  INTERVIEW_COMPLETED: [S.APPROVED, S.CHANGES_REQUESTED, S.WAITLISTED, S.REJECTED],
  CHANGES_REQUESTED: [S.UNDER_REVIEW, S.REJECTED],
  WAITLISTED: [S.UNDER_REVIEW, S.REJECTED],
  APPROVED: [S.ONBOARDING],
  ONBOARDING: [S.ACTIVE],
  ACTIVE: [S.PAUSED, S.SUSPENDED],
  PAUSED: [S.ACTIVE, S.SUSPENDED],
  SUSPENDED: [S.ACTIVE],
  REJECTED: [],
};
export const PASS_THRESHOLD = 75;

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private links: PasswordLinksService, private daily: DailyService) {}

  audit(adminId: string, action: string, entityType: string, entityId: string, detail = '') {
    return this.prisma.auditLog.create({ data: { adminId, action, entityType, entityId, detail } });
  }

  // ---------- applications ----------
  listApplications(status?: ApplicationStatus) {
    return this.prisma.mentorApplication.findMany({ where: status ? { status } : {}, orderBy: { submittedAt: 'desc' }, include: { scorecard: true }, omit: { editTokenHash: true, interviewTokenHash: true } });
  }

  async getApplication(id: string) {
    const a = await this.prisma.mentorApplication.findUnique({ where: { id }, include: { scorecard: true }, omit: { editTokenHash: true, interviewTokenHash: true } });
    if (!a) throw new NotFoundException('Application not found');
    return { ...a, allowedTransitions: TRANSITIONS[a.status], passThreshold: PASS_THRESHOLD };
  }

  /** Interviews still to happen, soonest first, for the admin's agenda. */
  listInterviews() {
    return this.prisma.mentorApplication.findMany({
      where: { status: 'INTERVIEW_SCHEDULED', interviewAt: { not: null } }, orderBy: { interviewAt: 'asc' },
      select: { id: true, fullName: true, email: true, phone: true, headline: true, interviewAt: true, interviewDurationMin: true, interviewNote: true },
    });
  }

  /** Books (or moves) the interview, marks the application Interview scheduled and emails the applicant. */
  async scheduleInterview(adminId: string, id: string, dto: InterviewDto) {
    const a = await this.getApplication(id);
    if (!['SHORTLISTED', 'INTERVIEW_SCHEDULED'].includes(a.status)) throw new BadRequestException('An interview can be scheduled once the applicant is shortlisted');
    const start = new Date(dto.startAt);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) throw new BadRequestException('Choose a date and time in the future');
    const end = new Date(start.getTime() + dto.durationMinutes * 60_000);
    const others = await this.prisma.mentorApplication.findMany({ where: { status: 'INTERVIEW_SCHEDULED', id: { not: id }, interviewAt: { gte: new Date(start.getTime() - 120 * 60_000), lt: end } } });
    const clash = others.find((o) => o.interviewAt && o.interviewAt.getTime() + (o.interviewDurationMin ?? 30) * 60_000 > start.getTime());
    if (clash) throw new BadRequestException(`That overlaps your interview with ${clash.fullName}. Pick another time.`);
    // A fresh private link for the applicant, who has no account yet. Rescheduling replaces the old one.
    const token = randomBytes(32).toString('base64url');
    const joinUrl = `${webUrl()}/interview/${id}?t=${token}`;
    const rescheduled = a.status === 'INTERVIEW_SCHEDULED';
    await this.prisma.mentorApplication.update({
      where: { id },
      data: { status: 'INTERVIEW_SCHEDULED', interviewAt: start, interviewDurationMin: dto.durationMinutes, interviewTokenHash: hashToken(token), interviewHostStartedAt: null, interviewNote: dto.note?.trim() || null, interviewScheduledAt: new Date(), interviewScheduledBy: adminId },
    });
    await this.audit(adminId, rescheduled ? 'INTERVIEW_RESCHEDULED' : 'INTERVIEW_SCHEDULED', 'MentorApplication', id, start.toISOString());
    const first = a.fullName.split(' ')[0];
    const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('POINT B mentor interview')}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`Join on POINT B: ${joinUrl}`)}`;
    await this.notify.send(
      a.email,
      rescheduled ? 'Your interview has been rescheduled' : 'Your interview is scheduled',
      `Hi ${first},\n\n${rescheduled ? 'Your mentor interview has moved to a new time.' : 'Thank you for your patience. We have booked your mentor interview.'} It is a short conversation about your background and how you would approach mentoring.${dto.note?.trim() ? `\n\nA note from our team: ${dto.note.trim()}` : ''}\n\nThe button above opens your private interview room. It becomes active 10 minutes before the start, so you can use the same link then. Please do not share it. If this time no longer works, reply to this email and we will find another.`,
      undefined,
      { cta: { label: 'Join your interview', url: joinUrl }, facts: [['When', emailDate(start)], ['Duration', `${dto.durationMinutes} minutes`], ['Where', 'Online, on POINT B. No download needed.'], ['Add to calendar', gcal]] },
    );
    return this.getApplication(id);
  }

  async saveScorecard(adminId: string, id: string, dto: ScorecardDto) {
    const a = await this.getApplication(id);
    if (!['INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED'].includes(a.status)) throw new BadRequestException('Scorecards can be recorded once an interview is scheduled');
    const total = dto.experience + dto.expertise + dto.communication + dto.approach + dto.conduct;
    const sc = await this.prisma.interviewScorecard.upsert({ where: { applicationId: id }, create: { applicationId: id, ...dto, total, reviewerId: adminId }, update: { ...dto, total, reviewerId: adminId } });
    await this.audit(adminId, 'SCORECARD_SAVED', 'MentorApplication', id, `total=${total}`);
    return { ...sc, meetsThreshold: total >= PASS_THRESHOLD };
  }

  /** Lets an admin correct the applicant's details (e.g. after a phone call). Logged with the fields that changed. */
  async editApplication(adminId: string, id: string, dto: AdminEditApplicationDto) {
    const a = await this.getApplication(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase();
      if (email !== a.email) {
        if (a.mentorProfileId) throw new BadRequestException('The email can no longer be changed because this mentor already has an account');
        if (await this.prisma.mentorApplication.findFirst({ where: { email, id: { not: id }, status: { notIn: ['REJECTED', 'WAITLISTED'] } } })) throw new BadRequestException('Another application already uses this email');
      }
      data.email = email;
    }
    const changed = Object.keys(data).filter((k) => JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify(data[k]));
    if (changed.length === 0) return a;
    await this.prisma.mentorApplication.update({ where: { id }, data });
    await this.audit(adminId, 'APPLICATION_EDITED', 'MentorApplication', id, changed.join(', '));
    return this.getApplication(id);
  }

  async saveNotes(adminId: string, id: string, notes: string) {
    await this.getApplication(id);
    await this.prisma.mentorApplication.update({ where: { id }, data: { internalNotes: notes } });
    await this.audit(adminId, 'NOTES_UPDATED', 'MentorApplication', id);
    return this.getApplication(id);
  }

  async verifyIdentity(adminId: string, id: string, verified: boolean) {
    await this.getApplication(id);
    await this.prisma.mentorApplication.update({ where: { id }, data: { identityVerified: verified } });
    await this.audit(adminId, verified ? 'IDENTITY_VERIFIED' : 'IDENTITY_UNVERIFIED', 'MentorApplication', id);
    return this.getApplication(id);
  }

  /**
   * Asks the applicant to correct or add something. The message is emailed to them verbatim and kept on the
   * application, so it can be sent again or followed up. Moves the application to CHANGES_REQUESTED.
   */
  async requestChanges(adminId: string, id: string, message: string) {
    const a = await this.getApplication(id);
    if (a.status !== 'CHANGES_REQUESTED' && !TRANSITIONS[a.status].includes('CHANGES_REQUESTED')) {
      throw new BadRequestException(`Changes can't be requested while an application is ${a.status.toLowerCase().replace(/_/g, ' ')}`);
    }
    const text = message.trim();
    // A fresh single-use link each time; sending again invalidates the previous one.
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + EDIT_LINK_DAYS * 86_400_000);
    await this.prisma.mentorApplication.update({
      where: { id },
      data: { status: 'CHANGES_REQUESTED', changesRequested: text, changesRequestedAt: new Date(), editTokenHash: hashToken(token), editTokenExpiresAt: expires },
    });
    await this.audit(adminId, 'CHANGES_REQUESTED', 'MentorApplication', id, text.slice(0, 500));
    const first = a.fullName.split(' ')[0];
    await this.notify.send(
      a.email,
      'Please update your mentor application',
      `Hi ${first},\n\nThank you for applying to mentor with POINT B. Our team has reviewed your application and would like a few changes before we take it further:\n\n${text}\n\nUse the button below to open your application, make the changes and send it back. The link is private to you, works once, and expires after ${EDIT_LINK_DAYS} days or as soon as your application moves on.`,
      undefined,
      { cta: { label: 'Update your application', url: `${webUrl()}/become-a-mentor/apply?update=${token}` }, facts: [['Applicant', a.fullName], ['Link valid until', expires.toUTCString().replace(/:\d\d GMT$/, ' GMT')]] },
    );
    return this.getApplication(id);
  }

  async setStatus(adminId: string, id: string, next: ApplicationStatus, notes?: string) {
    const a = await this.getApplication(id);
    if (next === 'CHANGES_REQUESTED') throw new BadRequestException('Use "Request changes" and describe what the applicant should change.');
    if (next === 'INTERVIEW_SCHEDULED') throw new BadRequestException('Use "Schedule interview" and pick a date and time.');
    if (!TRANSITIONS[a.status].includes(next)) throw new BadRequestException(`Cannot move an application from ${a.status} to ${next}`);
    let account: { userId: string; isNew: boolean } | undefined;

    if (next === 'APPROVED') {
      if (!a.scorecard) throw new BadRequestException('Record the interview scorecard before approving');
      if (a.scorecard.total < PASS_THRESHOLD && !notes?.trim()) {
        throw new BadRequestException(`Score is below the ${PASS_THRESHOLD}/100 threshold. Add a written justification in notes to approve.`);
      }
    }
    if (next === 'ONBOARDING') account = await this.createMentorAccount(a);
    if (next === 'ACTIVE' && a.status === 'ONBOARDING') {
      if (!a.identityVerified) throw new BadRequestException('Verify the applicant’s identity before activating');
      const profile = await this.prisma.mentorProfile.findFirst({ where: { user: { email: a.email } } });
      if (!profile?.agreementAcceptedAt) throw new BadRequestException('The mentor must accept the mentor agreement before activation');
    }

    // Any decision closes the applicant's update link, so nothing can be changed after approval (or rejection).
    await this.prisma.mentorApplication.update({ where: { id }, data: { status: next, editTokenHash: null, editTokenExpiresAt: null, ...(notes !== undefined ? { internalNotes: notes } : {}) } });
    if (['ACTIVE', 'PAUSED', 'SUSPENDED'].includes(next)) {
      await this.prisma.mentorProfile.updateMany({
        where: { user: { email: a.email } },
        data: { status: next as 'ACTIVE' | 'PAUSED' | 'SUSPENDED', ...(next === 'ACTIVE' ? { verified: true } : {}) },
      });
    }
    await this.audit(adminId, 'STATUS_CHANGED', 'MentorApplication', id, `${a.status} -> ${next}`);
    if (account) await this.sendWelcome(a.email, a.fullName, account);
    else await this.notifyApplicant(a.email, a.fullName, next);
    return this.getApplication(id);
  }

  /** Approval email with a private link to set a password: no password ever travels by email. */
  private async sendWelcome(email: string, name: string, account: { userId: string; isNew: boolean }) {
    const { token, expiresAt } = await this.links.issue(account.userId, SETUP_LINK_DAYS * 24);
    const first = name.split(' ')[0];
    const how = account.isNew
      ? 'First, use the button below to choose your password.'
      : 'You already have a POINT B account with this email, so you can sign in with your current password. If you don\'t remember it, use the button below to choose a new one.';
    await this.notify.send(email, 'Welcome to POINT B Mentors — next steps', `Hi ${first},\n\nCongratulations, your mentor application has been approved.\n\n${how} Then sign in to complete your profile, accept the mentor agreement and set your availability.\n\nThe link is private to you, works once and expires after ${SETUP_LINK_DAYS} days. After that, use "Forgot password?" on the sign-in page.`, account.userId, {
      cta: { label: account.isNew ? 'Set your password' : 'Choose a new password', url: `${webUrl()}/reset-password?token=${token}&welcome=1` },
      facts: [['Sign-in email', email], ['Link valid until', expiresAt.toUTCString().replace(/:\d\d GMT$/, ' GMT')]],
    });
  }

  private async notifyApplicant(email: string, name: string, status: ApplicationStatus) {
    const first = name.split(' ')[0];
    const copy: Partial<Record<ApplicationStatus, [string, string]>> = {
      SHORTLISTED: ['You have been shortlisted', `Hi ${first}, we would like to take your application further and will be in touch to arrange an interview.`],
      INTERVIEW_SCHEDULED: ['Your interview is scheduled', `Hi ${first}, we will email the interview details shortly.`],
      WAITLISTED: ['Your application is waitlisted', `Hi ${first}, we are not able to onboard you right now but will keep your application on file.`],
      REJECTED: ['An update on your application', `Hi ${first}, thank you for applying. We are not able to take your application forward at this time.`],
      ACTIVE: ['Your mentor profile is live', `Hi ${first}, your profile is now published and you can accept bookings.`],
      PAUSED: ['Your mentor profile is paused', `Hi ${first}, your profile has been paused. Contact support for details.`],
      SUSPENDED: ['Your mentor profile is suspended', `Hi ${first}, your profile has been suspended. Contact support for details.`],
    };
    const c = copy[status];
    if (c) await this.notify.send(email, c[0], c[1]);
  }

  private async createMentorAccount(a: Omit<Prisma.MentorApplicationGetPayload<object>, 'editTokenHash' | 'interviewTokenHash'>) {
    let user = await this.prisma.user.findUnique({ where: { email: a.email } });
    const isNew = !user;
    if (!user) {
      // Random, never-shared password: the mentor chooses their own through the set-password link.
      user = await this.prisma.user.create({ data: { email: a.email, name: a.fullName, role: 'MENTOR', passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12) } });
    } else if (user.role === 'ADMIN') {
      throw new BadRequestException('This email belongs to an administrator account');
    } else {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: 'MENTOR' } });
    }
    if (await this.prisma.mentorProfile.findUnique({ where: { userId: user.id } })) return { userId: user.id, isNew };
    const category = categoryFor(a.countryOfResidence || a.professionalLocation);
    let slug = slugify(a.fullName), n = 1;
    while (await this.prisma.mentorProfile.findUnique({ where: { slug } })) slug = `${slugify(a.fullName)}-${++n}`;
    const profile = await this.prisma.mentorProfile.create({
      data: {
        userId: user.id, slug, category, level: 'PROFESSIONAL', status: 'ONBOARDING',
        title: a.headline, organization: a.organization, country: a.professionalLocation,
        languages: a.languages, expertise: [a.industry], industries: [a.industry],
        introduction: a.motivation, careerSummary: `${a.currentRole}, ${a.yearsExperience} years of experience. ${a.qualifications}`,
        qualifications: a.qualifications ? [a.qualifications] : [], achievements: [], helpTopics: a.topicsOffered, outsideScope: [],
        linkedinUrl: a.linkedinUrl,
      },
    });
    await this.prisma.mentorApplication.update({ where: { id: a.id }, data: { mentorProfileId: profile.id } });
    return { userId: user.id, isNew };
  }

  // ---------- mentors / pricing / settings ----------
  async listMentors() {
    const rows = await this.prisma.mentorProfile.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map(async (m) => ({ ...m, ...(await priceFor(this.prisma, m)), sessionsCompleted: await this.prisma.booking.count({ where: { mentorId: m.id, status: 'COMPLETED' } }) })));
  }

  async updateMentor(adminId: string, id: string, dto: UpdateMentorAdminDto) {
    const m = await this.prisma.mentorProfile.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Mentor not found');
    if (dto.status === 'ACTIVE' && !m.agreementAcceptedAt) throw new BadRequestException('Mentor has not accepted the agreement');
    if (dto.country !== undefined) dto.category = categoryFor(dto.country);
    // A mentor's own price must sit inside the range of the tier they end up in.
    const override = dto.priceOverrideMinor !== undefined ? dto.priceOverrideMinor : m.priceOverrideMinor;
    if (override != null) {
      const r = await tierRule(this.prisma, dto.level ?? m.level, currencyFor(dto.category ?? m.category));
      if (override < r.minMinor || override > r.maxMinor) {
        const fmt = (x: number) => (r.currency === 'PKR' ? `Rs ${(x / 100).toLocaleString('en-PK')}` : `£${(x / 100).toLocaleString('en-GB')}`);
        throw new BadRequestException(`The price must be between ${fmt(r.minMinor)} and ${fmt(r.maxMinor)} for this tier.`);
      }
    }
    await this.prisma.mentorProfile.update({ where: { id }, data: dto });
    await this.audit(adminId, 'MENTOR_UPDATED', 'MentorProfile', id, JSON.stringify(dto));
    return (await this.listMentors()).find((x) => x.id === id);
  }

  async pricing() {
    const out = [];
    for (const level of Object.keys(DEFAULT_PRICES) as (keyof typeof DEFAULT_PRICES)[]) {
      for (const currency of ['PKR', 'GBP'] as const) out.push(await tierRule(this.prisma, level, currency));
    }
    return out;
  }

  /** What the public pricing page shows: each tier's range, and the group seat discount. */
  async publicPricing() {
    return { tiers: await this.pricing(), groupPercent: await groupPercent(this.prisma) };
  }

  async setPricing(adminId: string, dto: PricingRuleDto) {
    if (dto.minMinor > dto.maxMinor) throw new BadRequestException('The lowest price cannot be above the highest price');
    if (dto.priceMinor < dto.minMinor || dto.priceMinor > dto.maxMinor) throw new BadRequestException('The standard price must be inside the range');
    const data = { priceMinor: dto.priceMinor, minMinor: dto.minMinor, maxMinor: dto.maxMinor };
    await this.prisma.pricingRule.upsert({ where: { level_currency: { level: dto.level, currency: dto.currency } }, create: { level: dto.level, currency: dto.currency, ...data }, update: data });
    await this.audit(adminId, 'PRICING_CHANGED', 'PricingRule', `${dto.level}/${dto.currency}`, `${dto.minMinor}-${dto.maxMinor}, standard ${dto.priceMinor}`);
    return this.pricing();
  }

  async settings() {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setSetting(adminId: string, dto: SettingDto) {
    const n = Number(dto.value);
    const percentKey = dto.key.startsWith('commission_') || dto.key === 'repeat_commission_percent' || dto.key === 'group_price_percent';
    if (!Number.isFinite(n) || n < 0 || (percentKey && n > 100) || (dto.key === 'group_price_percent' && n < 1)) throw new BadRequestException('Invalid value');
    await this.prisma.setting.upsert({ where: { key: dto.key }, create: dto, update: { value: dto.value } });
    await this.audit(adminId, 'SETTING_CHANGED', 'Setting', dto.key, dto.value);
    return this.settings();
  }

  async setGuardianConsent(adminId: string, userId: string, consent: boolean) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { guardianConsent: consent } });
    await this.audit(adminId, 'GUARDIAN_CONSENT', 'User', userId, String(consent));
    return { ok: true };
  }

  // ---------- bookings / reporting ----------
  listBookings(status?: string) {
    return this.prisma.booking.findMany({
      where: status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, take: 200,
      include: { slot: true, student: { select: { id: true, name: true, email: true } }, mentor: { select: { id: true, slug: true, user: { select: { name: true } } } }, payments: true },
    });
  }

  async students() {
    return this.prisma.user.findMany({ where: { role: 'STUDENT' }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, email: true, dateOfBirth: true, guardianEmail: true, guardianConsent: true, createdAt: true, _count: { select: { bookings: true } } } });
  }

  /** Video usage in participant-minutes: Daily's own record when available, otherwise estimated from calls that opened. */
  private async videoUsage() {
    const limitMinutes = Number(process.env.VIDEO_MINUTES_LIMIT) || 10_000;
    const real = await this.daily.usedMinutes();
    if (real !== null) return { usedMinutes: real, limitMinutes, source: 'daily' as const };
    const [bookings, interviews] = await Promise.all([
      this.prisma.booking.findMany({
        where: { OR: [{ status: 'COMPLETED' }, { status: 'CONFIRMED', hostStartedAt: { isSet: true, not: null } }] },
        select: { slotId: true, sessionKind: true, slot: { select: { startAt: true, endAt: true } } },
      }),
      this.prisma.mentorApplication.findMany({ where: { interviewHostStartedAt: { isSet: true, not: null } }, select: { interviewDurationMin: true } }),
    ]);
    const mins = (b: { slot: { startAt: Date; endAt: Date } }) => Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60_000);
    let used = 0;
    const hosted = new Set<string>();
    for (const b of bookings) {
      used += mins(b); // the student
      if (!hosted.has(b.slotId)) { hosted.add(b.slotId); used += mins(b); } // the mentor, once per slot even for groups
    }
    for (const i of interviews) used += 2 * (i.interviewDurationMin ?? 30);
    return { usedMinutes: used, limitMinutes, source: 'estimate' as const };
  }

  async stats() {
    const video = await this.videoUsage();
    const [apps, mentors, students, bookings, money, repeat, rules, paid] = await Promise.all([
      this.prisma.mentorApplication.groupBy({ by: ['status'], _count: true }),
      this.prisma.mentorProfile.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.booking.groupBy({ by: ['status'], _count: true }),
      this.prisma.booking.groupBy({ by: ['currency', 'status'], where: { status: { in: ['CONFIRMED', 'COMPLETED', 'CANCELLED'] } }, _sum: { priceMinor: true } }),
      this.prisma.booking.groupBy({ by: ['studentId'], where: { status: { in: ['CONFIRMED', 'COMPLETED'] } }, _count: true, having: { studentId: { _count: { gt: 1 } } } }),
      commissionRules(this.prisma),
      this.prisma.booking.findMany({ where: { status: { in: ['CONFIRMED', 'COMPLETED'] } }, select: { currency: true, priceMinor: true, platformFeeMinor: true, discountMinor: true, repeatStudent: true, mentor: { select: { level: true } } } }),
    ]);
    const sumFor = (currency: 'PKR' | 'GBP', statuses: string[]) => money.filter((m) => m.currency === currency && statuses.includes(m.status)).reduce((s, m) => s + (m._sum.priceMinor ?? 0), 0);
    // Each booking's fee was fixed when it was made (tier rate, or the repeat-student rate); older ones use today's tier rate.
    const feeFor = (b: (typeof paid)[number]) => b.platformFeeMinor ?? (rules.tier[b.mentor.level] == null ? null : feeOf(b.priceMinor, rules.tier[b.mentor.level]!));
    const configured = Object.values(rules.tier).some((v) => v != null);
    const finance = (['PKR', 'GBP'] as const).map((currency) => {
      const rows = paid.filter((b) => b.currency === currency);
      const gross = sumFor(currency, ['CONFIRMED', 'COMPLETED']);
      const fees = rows.map(feeFor);
      const fee = fees.some((f) => f == null) || !configured ? null : fees.reduce((a: number, f) => a + (f ?? 0), 0);
      return {
        currency, grossMinor: gross, refundedMinor: sumFor(currency, ['CANCELLED']),
        platformRevenueMinor: fee, mentorPayoutsMinor: fee == null ? null : gross - fee,
        discountsMinor: rows.reduce((a, b) => a + (b.discountMinor ?? 0), 0), repeatSessions: rows.filter((b) => b.repeatStudent).length,
      };
    });
    const count = (rows: { status: string; _count: number }[], s: string) => rows.find((r) => r.status === s)?._count ?? 0;
    const totalBookings = bookings.reduce((s, b) => s + b._count, 0);
    return {
      applications: Object.fromEntries(apps.map((a) => [a.status, a._count])),
      activeMentors: count(mentors, 'ACTIVE'), students,
      bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count])),
      bookingConversion: totalBookings ? (count(bookings, 'CONFIRMED') + count(bookings, 'COMPLETED')) / totalBookings : null,
      repeatStudents: repeat.length,
      commissionConfigured: configured, commission: rules, finance, video,
    };
  }

  auditLog() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { admin: { select: { name: true } } } });
  }

  outbox() {
    return this.prisma.notification.findMany({ orderBy: { sentAt: 'desc' }, take: 100 });
  }
}
