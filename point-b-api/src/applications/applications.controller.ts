import { BadRequestException, Body, Controller, Get, GoneException, NotFoundException, Param, Post, Put, Query, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { DailyService } from '../calls/daily.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { CreateApplicationDto, LinkedInImportDto, UpdateApplicationDto } from './applications.dto';
import { LinkedInImportService } from './linkedin-import.service';
import { hashToken } from '../admin/admin.service';
import { webUrl } from '../common/email-template';

const EDITABLE = {
  fullName: true, email: true, phone: true, countryOfResidence: true, professionalLocation: true, linkedinUrl: true, headline: true,
  currentRole: true, organization: true, yearsExperience: true, industry: true, specialistAreas: true, strengths: true, qualifications: true, languages: true,
  previousMentorshipExperience: true, topicsOffered: true, preferredPricing: true, weeklyAvailability: true, motivation: true, participation: true,
} as const;

/** A JPEG data URL as stored bytes; nothing when no photo was given. */
function photoData(image?: string) {
  if (!image) return {};
  const photo = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  if (photo.length < 3 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) throw new BadRequestException('The photo must be a JPEG image.');
  return { photo };
}
const withoutPhoto = <T extends { photoImage?: string }>(dto: T) => { const { photoImage: _p, ...rest } = dto; void _p; return rest; };

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private daily: DailyService, private linkedin: LinkedInImportService) {}

  /** Whether the form can offer to fill itself from LinkedIn. */
  @Public() @Get('linkedin/status')
  linkedinStatus() {
    return { enabled: this.linkedin.enabled };
  }

  /** Reads a LinkedIn profile and returns it as application fields, for the applicant to check before sending. */
  @Public() @Throttle({ default: { limit: 60, ttl: 3_600_000 } }) // the form asks again while a new profile is being fetched
  @Post('linkedin')
  importLinkedIn(@Body() dto: LinkedInImportDto) {
    return this.linkedin.import(dto.url, dto.ticket);
  }

  @Public() @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  async submit(@Body() dto: CreateApplicationDto) {
    if (!dto.agreedToTerms) throw new BadRequestException('You must accept the mentor terms to apply');
    const email = dto.email.toLowerCase();
    const open = await this.prisma.mentorApplication.findFirst({ where: { email, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'CHANGES_REQUESTED'] } } });
    if (open) throw new BadRequestException('You already have an application in progress. We will be in touch soon.');
    const { photoImage, ...fields } = dto;
    const app = await this.prisma.mentorApplication.create({ data: { ...fields, email, ...photoData(photoImage) } });
    await this.notify.send(email, 'We have received your mentor application', `Thanks ${dto.fullName.split(' ')[0]}. Applications are reviewed in order received. Approval is not automatic and includes a short interview.`);
    return { id: app.id, status: app.status };
  }

  /** The signed-in user's own upcoming mentor interview, matched by email, for their dashboard. */
  @ApiBearerAuth() @Get('mine/interview')
  async myInterview(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.id }, select: { email: true } });
    if (!user) return null;
    return this.prisma.mentorApplication.findFirst({
      where: { email: user.email.toLowerCase(), status: 'INTERVIEW_SCHEDULED', interviewAt: { not: null } }, orderBy: { interviewAt: 'asc' },
      select: { id: true, interviewAt: true, interviewDurationMin: true, interviewNote: true },
    });
  }

  /**
   * Gate for the interview room. The admin joins as host while signed in; the applicant joins with the private link from
   * their email (they have no account yet) or by signing in with the same email. Same window rules as mentoring sessions.
   */
  @Public() @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @Get(':id/interview-call')
  async interviewCall(@Param('id') id: string, @Query('token') token: string | undefined, @CurrentUser() user?: AuthUser) {
    const a = /^[0-9a-f]{24}$/.test(id) ? await this.prisma.mentorApplication.findUnique({ where: { id } }) : null;
    const isAdmin = user?.role === 'ADMIN';
    const isApplicant = !!a && ((!!token && token.length >= 20 && a.interviewTokenHash === hashToken(token)) || (!!user && user.email.toLowerCase() === a.email));
    if (!a || (!isAdmin && !isApplicant)) throw new NotFoundException('Interview not found');
    if (a.status !== 'INTERVIEW_SCHEDULED' || !a.interviewAt) return { state: 'not_scheduled' as const };
    const start = a.interviewAt, end = new Date(start.getTime() + (a.interviewDurationMin ?? 30) * 60_000);
    const base = { applicantName: a.fullName, startAt: start, endAt: end, isHost: isAdmin };
    const now = Date.now();
    if (now < start.getTime() - 10 * 60_000) return { ...base, state: 'too_early' as const };
    // Interviews often overrun, so the room stays open for 30 minutes past the planned end.
    if (now > end.getTime() + 30 * 60_000) return { ...base, state: 'ended' as const };
    if (!this.daily.enabled()) throw new ServiceUnavailableException('Video calling is not configured yet. Please contact support.');
    const room = 'pb-iv-' + a.id;
    // The applicant waits for the interviewer; Daily's presence list covers an admin who joined before this was recorded.
    if (!isAdmin && !a.interviewHostStartedAt && (await this.daily.presence(room, (u) => !u.startsWith('applicant-'))) !== 'yes') return { ...base, state: 'waiting_for_host' as const };
    const url = await this.daily.ensureRoom(room, new Date(end.getTime() + 30 * 60_000), 4);
    if (isAdmin && !a.interviewHostStartedAt) await this.prisma.mentorApplication.updateMany({ where: { id: a.id, OR: [{ interviewHostStartedAt: null }, { interviewHostStartedAt: { isSet: false } }] }, data: { interviewHostStartedAt: new Date() } });
    const meetingToken = await this.daily.token(room, { userId: isAdmin ? user!.id : 'applicant-' + a.id, userName: isAdmin ? user!.name : a.fullName, owner: isAdmin, startAt: start, endAt: new Date(end.getTime() + 30 * 60_000) });
    return { ...base, state: 'ready' as const, url, token: meetingToken };
  }

  /** Resolves an update link, refusing it once used, expired, or after the application has moved on. */
  private async byToken(token: string) {
    const app = token.length >= 20 ? await this.prisma.mentorApplication.findFirst({ where: { editTokenHash: hashToken(token) } }) : null;
    if (!app) throw new GoneException('This link is no longer valid. It may have been used already or replaced by a newer email.');
    if (app.status !== 'CHANGES_REQUESTED') throw new GoneException('Your application has moved on, so this link can no longer be used.');
    if (!app.editTokenExpiresAt || app.editTokenExpiresAt < new Date()) throw new GoneException('This link has expired. Please contact us and we will send a new one.');
    return app;
  }

  @Public() @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Get('update/:token')
  async forUpdate(@Param('token') token: string) {
    const app = await this.byToken(token);
    const fields = Object.fromEntries(Object.keys(EDITABLE).map((k) => [k, app[k as keyof typeof EDITABLE]]));
    return { ...fields, changesRequested: app.changesRequested, changesRequestedAt: app.changesRequestedAt, expiresAt: app.editTokenExpiresAt };
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Put('update/:token')
  async update(@Param('token') token: string, @Body() dto: UpdateApplicationDto) {
    if (!dto.agreedToTerms) throw new BadRequestException('You must accept the mentor terms to continue');
    const app = await this.byToken(token);
    // Single use: the guarded update only succeeds while this exact token is still current.
    const done = await this.prisma.mentorApplication.updateMany({
      where: { id: app.id, editTokenHash: hashToken(token), status: 'CHANGES_REQUESTED' },
      data: { ...withoutPhoto(dto), ...photoData(dto.photoImage), status: 'UNDER_REVIEW', editTokenHash: null, editTokenExpiresAt: null, resubmittedAt: new Date(), resubmissionCount: { increment: 1 } },
    });
    if (done.count === 0) throw new GoneException('This link is no longer valid.');
    const first = dto.fullName.split(' ')[0];
    await this.notify.send(app.email, 'We have received your updated application', `Hi ${first},\n\nThank you for making those changes. Your application is back with our team for review, and we will be in touch about next steps.`);
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER;
    if (inbox) {
      await this.notify.send(inbox, `Application updated: ${dto.fullName}`, `${dto.fullName} has updated their mentor application in response to your change request. It is back in Under review.`, undefined, {
        cta: { label: 'Review in admin', url: `${webUrl()}/admin` }, facts: [['Applicant', dto.fullName], ['Email', app.email]],
      });
    }
    return { ok: true };
  }
}
