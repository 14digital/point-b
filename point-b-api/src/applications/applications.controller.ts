import { BadRequestException, Body, Controller, Get, GoneException, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { CreateApplicationDto, UpdateApplicationDto } from './applications.dto';
import { hashToken } from '../admin/admin.service';
import { webUrl } from '../common/email-template';

const EDITABLE = {
  fullName: true, email: true, phone: true, countryOfResidence: true, professionalLocation: true, linkedinUrl: true, headline: true,
  currentRole: true, organization: true, yearsExperience: true, industry: true, specialistAreas: true, qualifications: true, languages: true,
  previousMentorshipExperience: true, topicsOffered: true, preferredPricing: true, weeklyAvailability: true, motivation: true, participation: true,
} as const;

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  @Public() @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  async submit(@Body() dto: CreateApplicationDto) {
    if (!dto.agreedToTerms) throw new BadRequestException('You must accept the mentor terms to apply');
    const email = dto.email.toLowerCase();
    const open = await this.prisma.mentorApplication.findFirst({ where: { email, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'CHANGES_REQUESTED'] } } });
    if (open) throw new BadRequestException('You already have an application in progress. We will be in touch soon.');
    const app = await this.prisma.mentorApplication.create({ data: { ...dto, email } });
    await this.notify.send(email, 'We have received your mentor application', `Thanks ${dto.fullName.split(' ')[0]}. Applications are reviewed in order received. Approval is not automatic and includes a short interview.`);
    return { id: app.id, status: app.status };
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
      data: { ...dto, status: 'UNDER_REVIEW', editTokenHash: null, editTokenExpiresAt: null, resubmittedAt: new Date(), resubmissionCount: { increment: 1 } },
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
