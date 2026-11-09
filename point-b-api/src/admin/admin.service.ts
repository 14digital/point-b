import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, MentorCategory, MentorLevel, Prisma } from '@prisma/client';
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
import { InterviewDto, InterviewSlotSettingsDto, PricingRuleDto, ScorecardDto, SettingDto, UpdateMentorAdminDto } from './admin.dto';
import { INTERVIEW_MINUTES, InterviewSlotsService } from './interview-slots.service';
import { WalletService } from '../common/wallet.service';

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

/**
 * Gross booked per period for the revenue chart: daily for up to a month, weekly up to about six months, monthly beyond.
 * Periods are in UTC and start on the first booking when no range is given.
 */
function trendFor(rows: { createdAt: Date; priceMinor: number }[], from?: Date, to?: Date) {
  const start = from ?? (rows.length ? new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))) : new Date());
  const end = to ?? new Date();
  const days = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
  const unit: 'day' | 'week' | 'month' = days <= 32 ? 'day' : days <= 190 ? 'week' : 'month';
  const keyOf = (d: Date) => {
    if (unit === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (unit === 'week') day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
  };
  const buckets = new Map<string, { grossMinor: number; sessions: number }>();
  // Every period in the range, so quiet days show as gaps rather than disappearing.
  for (let d = new Date(start); d < end && buckets.size < 400; ) {
    buckets.set(keyOf(d), { grossMinor: 0, sessions: 0 });
    if (unit === 'month') d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    else d = new Date(d.getTime() + (unit === 'week' ? 7 : 1) * 86_400_000);
  }
  for (const r of rows) {
    const k = keyOf(r.createdAt);
    const b = buckets.get(k) ?? { grossMinor: 0, sessions: 0 };
    b.grossMinor += r.priceMinor; b.sessions += 1;
    buckets.set(k, b);
  }
  return { unit, points: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v })) };
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private links: PasswordLinksService, private daily: DailyService, private slots: InterviewSlotsService, private wallet: WalletService) {}

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
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) throw new BadRequestException('Choose a slot in the future');
    await this.slots.assertOffered(start);
    const end = new Date(start.getTime() + INTERVIEW_MINUTES * 60_000);
    const others = await this.prisma.mentorApplication.findMany({ where: { status: 'INTERVIEW_SCHEDULED', id: { not: id }, interviewAt: { gte: new Date(start.getTime() - 120 * 60_000), lt: end } } });
    const clash = others.find((o) => o.interviewAt && o.interviewAt.getTime() + (o.interviewDurationMin ?? 30) * 60_000 > start.getTime());
    if (clash) throw new BadRequestException(`That slot is taken by your interview with ${clash.fullName}. Pick another.`);
    // A fresh private link for the applicant, who has no account yet. Rescheduling replaces the old one.
    const token = randomBytes(32).toString('base64url');
    const joinUrl = `${webUrl()}/interview/${id}?t=${token}`;
    const rescheduled = a.status === 'INTERVIEW_SCHEDULED';
    await this.prisma.mentorApplication.update({
      where: { id },
      data: { status: 'INTERVIEW_SCHEDULED', interviewAt: start, interviewDurationMin: INTERVIEW_MINUTES, interviewTokenHash: hashToken(token), interviewHostStartedAt: null, interviewNote: dto.note?.trim() || null, interviewScheduledAt: new Date(), interviewScheduledBy: adminId },
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
      { cta: { label: 'Join your interview', url: joinUrl }, facts: [['When', emailDate(start, (await this.slots.settings()).timezone)], ['Duration', `${INTERVIEW_MINUTES} minutes`], ['Where', 'Online, on POINT B. No download needed.'], ['Add to calendar', gcal]] },
    );
    return this.getApplication(id);
  }

  async saveInterviewSlots(adminId: string, dto: InterviewSlotSettingsDto) {
    const saved = await this.slots.saveSettings(dto);
    await this.audit(adminId, 'INTERVIEW_SLOTS_CHANGED', 'Setting', 'interview_slots', `${saved.weekly.flat().length} weekly slots, ${saved.timezone}`);
    return saved;
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
    if (next === 'INTERVIEW_SCHEDULED') throw new BadRequestException('Use "Schedule interview" and pick a slot.');
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
    const now = new Date(), in14 = new Date(now.getTime() + 14 * 86_400_000);
    const [slots, reviews] = await Promise.all([
      this.prisma.availabilitySlot.groupBy({ by: ['mentorId'], where: { isBooked: false, startAt: { gte: now, lt: in14 } }, _count: true }),
      this.prisma.review.findMany({ where: { OR: [{ status: 'APPROVED' }, { status: null }, { status: { isSet: false } }] }, select: { rating: true, booking: { select: { mentorId: true } } } }),
    ]);
    return Promise.all(rows.map(async (m) => {
      const mine = reviews.filter((r) => r.booking.mentorId === m.id);
      return {
        ...m, ...(await priceFor(this.prisma, m)),
        sessionsCompleted: await this.prisma.booking.count({ where: { mentorId: m.id, status: 'COMPLETED' } }),
        openSlots14: slots.find((s) => s.mentorId === m.id)?._count ?? 0,
        rating: mine.length ? mine.reduce((n, r) => n + r.rating, 0) / mine.length : null, reviewCount: mine.length,
        hasPayoutDetails: !!m.payoutDetails,
      };
    }));
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
      where: status === 'REPORTED' ? { mentorReportStatus: 'PENDING' } : status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, take: 200,
      include: { slot: true, student: { select: { id: true, name: true, email: true } }, mentor: { select: { id: true, slug: true, user: { select: { name: true } } } }, payments: true },
    });
  }

  /** Everything about one booking for the admin: people, session, money, payment checks, payout, review and history. */
  async bookingDetail(reference: string) {
    const b = await this.prisma.booking.findUnique({
      where: { reference },
      include: {
        slot: { select: { startAt: true, endAt: true, kind: true, capacity: true } },
        student: { select: { id: true, name: true, email: true, phone: true } },
        mentor: { select: { id: true, slug: true, level: true, user: { select: { name: true, email: true } } } },
        payments: { orderBy: { createdAt: 'desc' }, include: { proof: { select: { createdAt: true } } } },
        payout: { select: { id: true, createdAt: true, reference: true, note: true, amountMinor: true, sessions: true } },
        review: { select: { rating: true, comment: true, status: true, createdAt: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    const rules = await commissionRules(this.prisma);
    const percent = b.commissionPercent ?? rules.tier[b.mentor.level];
    const feeMinor = b.platformFeeMinor ?? (percent == null ? null : feeOf(b.priceMinor, percent));
    const reviewerIds = [...new Set(b.payments.map((p) => p.reviewedBy).filter((x): x is string => !!x))];
    const [reviewers, history, promo] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } }),
      this.prisma.auditLog.findMany({ where: { OR: [{ entityId: b.id }, { detail: { contains: b.reference } }] }, orderBy: { createdAt: 'asc' }, include: { admin: { select: { name: true } } } }),
      b.promoCodeId ? this.prisma.promoCode.findUnique({ where: { id: b.promoCodeId }, select: { code: true, percentOff: true } }) : null,
    ]);
    const { payments, ...rest } = b;
    return {
      ...rest,
      promo,
      money: { listPriceMinor: b.listPriceMinor ?? b.priceMinor, discountMinor: b.discountMinor ?? 0, paidMinor: b.priceMinor, commissionPercent: percent, feeMinor, payoutMinor: feeMinor == null ? null : b.priceMinor - feeMinor, feeIsEstimate: b.platformFeeMinor == null },
      payments: payments.map(({ proof, reviewedBy, ...p }) => ({ ...p, hasProof: !!proof, reviewedByName: reviewers.find((r) => r.id === reviewedBy)?.name ?? null })),
      history: history.map((h) => ({ action: h.action, detail: h.detail, at: h.createdAt, by: h.admin.name })),
    };
  }

  async students() {
    return this.prisma.user.findMany({ where: { role: 'STUDENT' }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, email: true, dateOfBirth: true, guardianEmail: true, guardianConsent: true, createdAt: true, _count: { select: { bookings: true } } } });
  }

  /** Video usage in participant-minutes: Daily's own record when available, otherwise estimated from calls that opened. */
  private async videoUsage(from?: Date, to?: Date) {
    const limitMinutes = Number(process.env.VIDEO_MINUTES_LIMIT) || 10_000;
    const within = (at: Date) => (!from || at >= from) && (!to || at < to);
    const real = await this.daily.usedMinutes(from, to);
    if (real !== null) return { usedMinutes: real.total, periodMinutes: real.period, limitMinutes, source: 'daily' as const };
    const [bookings, interviews] = await Promise.all([
      this.prisma.booking.findMany({
        where: { OR: [{ status: 'COMPLETED' }, { status: 'CONFIRMED', hostStartedAt: { isSet: true, not: null } }] },
        select: { slotId: true, sessionKind: true, slot: { select: { startAt: true, endAt: true } } },
      }),
      this.prisma.mentorApplication.findMany({ where: { interviewHostStartedAt: { isSet: true, not: null } }, select: { interviewDurationMin: true, interviewAt: true } }),
    ]);
    const mins = (b: { slot: { startAt: Date; endAt: Date } }) => Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60_000);
    let used = 0, period = 0;
    const add = (n: number, at: Date | null) => { used += n; if (at && within(at)) period += n; };
    const hosted = new Set<string>();
    for (const b of bookings) {
      add(mins(b), b.slot.startAt); // the student
      if (!hosted.has(b.slotId)) { hosted.add(b.slotId); add(mins(b), b.slot.startAt); } // the mentor, once per slot even for groups
    }
    for (const i of interviews) add(2 * (i.interviewDurationMin ?? 30), i.interviewAt);
    return { usedMinutes: used, periodMinutes: period, limitMinutes, source: 'estimate' as const };
  }

  /** Dashboard figures. Bookings count from when they were made, applications from when they were submitted. */
  async stats(from?: Date, to?: Date) {
    const inRange = from || to ? { ...(from && { gte: from }), ...(to && { lt: to }) } : undefined;
    const made = inRange ? { createdAt: inRange } : {};
    const video = await this.videoUsage(from, to);
    const [apps, appsOverall, mentors, newMentors, studentsTotal, students, bookings, cancelled, repeat, rules, paid] = await Promise.all([
      this.prisma.mentorApplication.groupBy({ by: ['status'], where: inRange ? { submittedAt: inRange } : {}, _count: true }),
      this.prisma.mentorApplication.groupBy({ by: ['status'], _count: true }),
      this.prisma.mentorProfile.groupBy({ by: ['status'], _count: true }),
      this.prisma.mentorProfile.count({ where: { status: 'ACTIVE', ...made } }),
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.user.count({ where: { role: 'STUDENT', ...made } }),
      this.prisma.booking.groupBy({ by: ['status'], where: made, _count: true }),
      this.prisma.booking.findMany({ where: { status: 'CANCELLED', ...made }, select: { currency: true, priceMinor: true, payments: { where: { status: 'REFUNDED' }, select: { id: true } } } }),
      this.prisma.booking.groupBy({ by: ['studentId'], where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, ...made }, _count: true, having: { studentId: { _count: { gt: 1 } } } }),
      commissionRules(this.prisma),
      this.prisma.booking.findMany({
        where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, ...made },
        select: {
          currency: true, priceMinor: true, listPriceMinor: true, platformFeeMinor: true, commissionPercent: true, discountMinor: true, repeatStudent: true, sessionKind: true, payoutId: true, createdAt: true,
          payments: { where: { status: 'SUCCEEDED' }, select: { provider: true }, take: 1 },
          mentor: { select: { id: true, level: true, user: { select: { name: true } } } },
        },
      }),
    ]);
    // Each booking's fee was fixed when it was made (tier rate, or the repeat-student rate); older ones use today's tier rate.
    const feeFor = (b: (typeof paid)[number]) => b.platformFeeMinor ?? (rules.tier[b.mentor.level] == null ? null : feeOf(b.priceMinor, rules.tier[b.mentor.level]!));
    const rateFor = (b: (typeof paid)[number]) => b.commissionPercent ?? rules.tier[b.mentor.level];
    const tally = (rows: typeof paid) => {
      const grossMinor = rows.reduce((a, b) => a + b.priceMinor, 0);
      const fees = rows.map(feeFor);
      const feeMinor = fees.some((f) => f == null) ? null : fees.reduce((a: number, f) => a + (f ?? 0), 0);
      const payoutMinor = feeMinor == null ? null : grossMinor - feeMinor;
      const paidOutMinor = payoutMinor == null ? null : rows.filter((b) => b.payoutId).reduce((a, b) => a + b.priceMinor - feeFor(b)!, 0);
      return { sessions: rows.length, grossMinor, feeMinor, payoutMinor, paidOutMinor, dueMinor: payoutMinor == null ? null : payoutMinor - paidOutMinor!, unpaidSessions: rows.filter((b) => !b.payoutId).length };
    };
    const groupRows = (rows: typeof paid, key: (b: (typeof paid)[number]) => string) => {
      const groups = new Map<string, typeof paid>();
      for (const b of rows) groups.set(key(b), [...(groups.get(key(b)) ?? []), b]);
      return [...groups.values()];
    };
    const configured = Object.values(rules.tier).some((v) => v != null);
    const finance = (['PKR', 'GBP'] as const).map((currency) => {
      const rows = paid.filter((b) => b.currency === currency);
      const total = tally(rows);
      const dropped = cancelled.filter((b) => b.currency === currency);
      const refunded = dropped.filter((b) => b.payments.length > 0);
      const sum = (list: { priceMinor: number }[]) => list.reduce((a, b) => a + b.priceMinor, 0);
      return {
        currency, grossMinor: total.grossMinor, refundedMinor: sum(refunded), refundedCount: refunded.length,
        unpaidCancelledMinor: sum(dropped) - sum(refunded), unpaidCancelledCount: dropped.length - refunded.length,
        platformRevenueMinor: configured ? total.feeMinor : null, mentorPayoutsMinor: configured ? total.payoutMinor : null,
        payoutsPaidMinor: configured ? total.paidOutMinor : null, payoutsDueMinor: configured ? total.dueMinor : null,
        listValueMinor: rows.reduce((a, b) => a + (b.listPriceMinor ?? b.priceMinor), 0),
        discountsMinor: rows.reduce((a, b) => a + (b.discountMinor ?? 0), 0), repeatSessions: rows.filter((b) => b.repeatStudent).length,
        sessions: total.sessions,
        tiers: (Object.keys(rules.tier) as MentorLevel[]).map((level) => {
          const inTier = rows.filter((b) => b.mentor.level === level);
          return {
            level, currentPercent: rules.tier[level], ...tally(inTier),
            // Split by the rate actually charged, so a tier whose rate has changed still adds up.
            rates: groupRows(inTier, (b) => `${b.repeatStudent ? 'r' : 's'}${rateFor(b)}`)
              .map((g) => ({ returning: !!g[0].repeatStudent, percent: rateFor(g[0]), ...tally(g) }))
              .sort((x, y) => (y.percent ?? 0) - (x.percent ?? 0)),
          };
        }),
        kinds: (['ONE_TO_ONE', 'GROUP'] as const).map((kind) => ({ kind, ...tally(rows.filter((b) => b.sessionKind === kind)) })),
        methods: groupRows(rows, (b) => b.payments[0]?.provider ?? 'unknown').map((g) => ({ method: g[0].payments[0]?.provider ?? 'unknown', ...tally(g) })).sort((x, y) => y.grossMinor - x.grossMinor),
        trend: trendFor(rows, from, to),
        mentors: groupRows(rows, (b) => b.mentor.id).map((g) => ({ id: g[0].mentor.id, name: g[0].mentor.user.name, level: g[0].mentor.level, ...tally(g) })).sort((x, y) => y.grossMinor - x.grossMinor),
      };
    });
    const count = (rows: { status: string; _count: number }[], s: string) => rows.find((r) => r.status === s)?._count ?? 0;
    const totalBookings = bookings.reduce((s, b) => s + b._count, 0);
    return {
      applications: Object.fromEntries(apps.map((a) => [a.status, a._count])),
      applicationsOverall: Object.fromEntries(appsOverall.map((a) => [a.status, a._count])),
      activeMentors: count(mentors, 'ACTIVE'), newMentors, students, studentsTotal,
      bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count])),
      bookingConversion: totalBookings ? (count(bookings, 'CONFIRMED') + count(bookings, 'COMPLETED')) / totalBookings : null,
      repeatStudents: repeat.length,
      commissionConfigured: configured, commission: rules, finance, video, balancesHeld: await this.wallet.totalsHeld(),
    };
  }

  auditLog() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { admin: { select: { name: true } } } });
  }

  outbox() {
    return this.prisma.notification.findMany({ orderBy: { sentAt: 'desc' }, take: 100 });
  }
}
