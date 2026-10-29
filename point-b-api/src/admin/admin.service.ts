import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, MentorCategory, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { PasswordLinksService } from '../common/password-links.service';

/** How long a new mentor's "set your password" link stays valid. */
const SETUP_LINK_DAYS = 7;
import { webUrl } from '../common/email-template';

/** How long an applicant's update link stays valid. */
export const EDIT_LINK_DAYS = 14;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
import { DEFAULT_PRICES, priceFor } from '../common/pricing';
import { PricingRuleDto, ScorecardDto, SettingDto, UpdateMentorAdminDto } from './admin.dto';

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
  constructor(private prisma: PrismaService, private notify: NotificationsService, private links: PasswordLinksService) {}

  audit(adminId: string, action: string, entityType: string, entityId: string, detail = '') {
    return this.prisma.auditLog.create({ data: { adminId, action, entityType, entityId, detail } });
  }

  // ---------- applications ----------
  listApplications(status?: ApplicationStatus) {
    return this.prisma.mentorApplication.findMany({ where: status ? { status } : {}, orderBy: { submittedAt: 'desc' }, include: { scorecard: true }, omit: { editTokenHash: true } });
  }

  async getApplication(id: string) {
    const a = await this.prisma.mentorApplication.findUnique({ where: { id }, include: { scorecard: true }, omit: { editTokenHash: true } });
    if (!a) throw new NotFoundException('Application not found');
    return { ...a, allowedTransitions: TRANSITIONS[a.status], passThreshold: PASS_THRESHOLD };
  }

  async saveScorecard(adminId: string, id: string, dto: ScorecardDto) {
    const a = await this.getApplication(id);
    if (!['INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED'].includes(a.status)) throw new BadRequestException('Scorecards can be recorded once an interview is scheduled');
    const total = dto.experience + dto.expertise + dto.communication + dto.approach + dto.conduct;
    const sc = await this.prisma.interviewScorecard.upsert({ where: { applicationId: id }, create: { applicationId: id, ...dto, total, reviewerId: adminId }, update: { ...dto, total, reviewerId: adminId } });
    await this.audit(adminId, 'SCORECARD_SAVED', 'MentorApplication', id, `total=${total}`);
    return { ...sc, meetsThreshold: total >= PASS_THRESHOLD };
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

  private async createMentorAccount(a: Omit<Prisma.MentorApplicationGetPayload<object>, 'editTokenHash'>) {
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
    const category: MentorCategory = /pakistan/i.test(a.professionalLocation) ? 'LOCAL' : 'INTERNATIONAL';
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
    await this.prisma.mentorProfile.update({ where: { id }, data: dto });
    await this.audit(adminId, 'MENTOR_UPDATED', 'MentorProfile', id, JSON.stringify(dto));
    return (await this.listMentors()).find((x) => x.id === id);
  }

  async pricing() {
    const rules = await this.prisma.pricingRule.findMany();
    const out: { level: string; currency: string; priceMinor: number; isDefault: boolean }[] = [];
    for (const level of Object.keys(DEFAULT_PRICES) as (keyof typeof DEFAULT_PRICES)[]) {
      for (const currency of ['PKR', 'GBP'] as const) {
        const r = rules.find((x) => x.level === level && x.currency === currency);
        out.push({ level, currency, priceMinor: r?.priceMinor ?? DEFAULT_PRICES[level][currency], isDefault: !r });
      }
    }
    return out;
  }

  async setPricing(adminId: string, dto: PricingRuleDto) {
    await this.prisma.pricingRule.upsert({ where: { level_currency: { level: dto.level, currency: dto.currency } }, create: dto, update: { priceMinor: dto.priceMinor } });
    await this.audit(adminId, 'PRICING_CHANGED', 'PricingRule', `${dto.level}/${dto.currency}`, String(dto.priceMinor));
    return this.pricing();
  }

  async settings() {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setSetting(adminId: string, dto: SettingDto) {
    const n = Number(dto.value);
    if (!Number.isFinite(n) || n < 0 || ((dto.key === 'commission_percent' || dto.key === 'group_price_percent') && n > 100) || (dto.key === 'group_price_percent' && n < 1)) throw new BadRequestException('Invalid value');
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

  async stats() {
    const [apps, mentors, students, bookings, money, repeat, commission] = await Promise.all([
      this.prisma.mentorApplication.groupBy({ by: ['status'], _count: true }),
      this.prisma.mentorProfile.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.booking.groupBy({ by: ['status'], _count: true }),
      this.prisma.booking.groupBy({ by: ['currency', 'status'], where: { status: { in: ['CONFIRMED', 'COMPLETED', 'CANCELLED'] } }, _sum: { priceMinor: true } }),
      this.prisma.booking.groupBy({ by: ['studentId'], where: { status: { in: ['CONFIRMED', 'COMPLETED'] } }, _count: true, having: { studentId: { _count: { gt: 1 } } } }),
      this.prisma.setting.findUnique({ where: { key: 'commission_percent' } }),
    ]);
    const sumFor = (currency: 'PKR' | 'GBP', statuses: string[]) => money.filter((m) => m.currency === currency && statuses.includes(m.status)).reduce((s, m) => s + (m._sum.priceMinor ?? 0), 0);
    const pct = commission ? Number(commission.value) : null;
    const finance = (['PKR', 'GBP'] as const).map((currency) => {
      const gross = sumFor(currency, ['CONFIRMED', 'COMPLETED']);
      return { currency, grossMinor: gross, refundedMinor: sumFor(currency, ['CANCELLED']), platformRevenueMinor: pct == null ? null : Math.round((gross * pct) / 100), mentorPayoutsMinor: pct == null ? null : gross - Math.round((gross * pct) / 100) };
    });
    const count = (rows: { status: string; _count: number }[], s: string) => rows.find((r) => r.status === s)?._count ?? 0;
    const totalBookings = bookings.reduce((s, b) => s + b._count, 0);
    return {
      applications: Object.fromEntries(apps.map((a) => [a.status, a._count])),
      activeMentors: count(mentors, 'ACTIVE'), students,
      bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count])),
      bookingConversion: totalBookings ? (count(bookings, 'CONFIRMED') + count(bookings, 'COMPLETED')) / totalBookings : null,
      repeatStudents: repeat.length,
      commissionPercent: pct, commissionConfigured: pct != null, finance,
    };
  }

  auditLog() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { admin: { select: { name: true } } } });
  }

  outbox() {
    return this.prisma.notification.findMany({ orderBy: { sentAt: 'desc' }, take: 100 });
  }
}
