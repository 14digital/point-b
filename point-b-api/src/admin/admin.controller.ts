import { BadRequestException, Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { AdminEditApplicationDto } from '../applications/applications.dto';
import { InterviewDto, InterviewSlotSettingsDto, GuardianConsentDto, NotesDto, PricingRuleDto, ScorecardDto, SettingDto, StatusDto, UpdateMentorAdminDto, VerifyIdentityDto, RequestChangesDto } from './admin.dto';
import { AdminService } from './admin.service';
import { InterviewSlotsService } from './interview-slots.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService, private slots: InterviewSlotsService) {}

  @Get('stats') stats(@Query('from') from?: string, @Query('to') to?: string) {
    const parse = (v?: string) => {
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Choose a valid date range');
      return d;
    };
    return this.admin.stats(parse(from), parse(to));
  }

  @Get('applications') apps(@Query('status', new ParseEnumPipe(ApplicationStatus, { optional: true })) status?: ApplicationStatus) { return this.admin.listApplications(status); }
  @Get('interviews') interviews() { return this.admin.listInterviews(); }
  @Get('interview-slots/settings') slotSettings() { return this.slots.settings(); }
  @Put('interview-slots/settings') saveSlotSettings(@CurrentUser() u: AuthUser, @Body() dto: InterviewSlotSettingsDto) { return this.admin.saveInterviewSlots(u.id, dto); }
  @Get('interview-slots') slotCalendar(@Query('from') from?: string, @Query('days') days?: string, @Query('applicationId') applicationId?: string) { return this.slots.calendar(from, Number(days), applicationId); }
  @Put('applications/:id/interview') interview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: InterviewDto) { return this.admin.scheduleInterview(u.id, id, dto); }
  @Get('applications/:id') app(@Param('id') id: string) { return this.admin.getApplication(id); }
  @Patch('applications/:id/details') editDetails(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AdminEditApplicationDto) { return this.admin.editApplication(u.id, id, dto); }
  @Put('applications/:id/scorecard') score(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ScorecardDto) { return this.admin.saveScorecard(u.id, id, dto); }
  @Patch('applications/:id/status') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) { return this.admin.setStatus(u.id, id, dto.status, dto.notes); }
  @Post('applications/:id/request-changes') requestChanges(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RequestChangesDto) { return this.admin.requestChanges(u.id, id, dto.message); }
  @Patch('applications/:id/notes') notes(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NotesDto) { return this.admin.saveNotes(u.id, id, dto.notes); }
  @Patch('applications/:id/identity') identity(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VerifyIdentityDto) { return this.admin.verifyIdentity(u.id, id, dto.verified); }

  @Get('mentors') mentors() { return this.admin.listMentors(); }
  @Patch('mentors/:id') updateMentor(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateMentorAdminDto) { return this.admin.updateMentor(u.id, id, dto); }

  @Get('bookings') bookings(@Query('status') status?: string) { return this.admin.listBookings(status); }
  @Get('students') students() { return this.admin.students(); }
  @Patch('users/:id/guardian-consent') consent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: GuardianConsentDto) { return this.admin.setGuardianConsent(u.id, id, dto.consent); }

  @Get('pricing') pricing() { return this.admin.pricing(); }
  @Put('pricing') setPricing(@CurrentUser() u: AuthUser, @Body() dto: PricingRuleDto) { return this.admin.setPricing(u.id, dto); }
  @Get('settings') settings() { return this.admin.settings(); }
  @Put('settings') setSetting(@CurrentUser() u: AuthUser, @Body() dto: SettingDto) { return this.admin.setSetting(u.id, dto); }

  @Get('audit-log') audit() { return this.admin.auditLog(); }
  @Get('outbox') outbox() { return this.admin.outbox(); }
}
