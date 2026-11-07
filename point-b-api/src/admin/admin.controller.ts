import { BadRequestException, Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApplicationStatus, Currency } from '@prisma/client';
import { AuthUser, CurrentUser, Roles, Staff } from '../common/auth';
import { AdminEditApplicationDto } from '../applications/applications.dto';
import { InterviewDto, InterviewSlotSettingsDto, RecordPayoutDto, GuardianConsentDto, NotesDto, PricingRuleDto, ScorecardDto, SettingDto, StatusDto, UpdateMentorAdminDto, VerifyIdentityDto, RequestChangesDto } from './admin.dto';
import { AdminService } from './admin.service';
import { InterviewSlotsService } from './interview-slots.service';
import { PayoutsService } from './payouts.service';

/** An ISO date from the query string, or undefined when it's left out. */
const parseDate = (v?: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Choose a valid date range');
  return d;
};

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService, private slots: InterviewSlotsService, private payouts: PayoutsService) {}

  @Staff('OPERATIONS', 'FINANCE') @Get('stats') stats(@Query('from') from?: string, @Query('to') to?: string) { return this.admin.stats(parseDate(from), parseDate(to)); }

  @Staff('FINANCE') @Get('payouts/mentors/:mentorId') mentorPayouts(@Param('mentorId') mentorId: string, @Query('currency', new ParseEnumPipe(Currency)) currency: Currency, @Query('from') from?: string, @Query('to') to?: string) {
    return this.payouts.mentorSessions(mentorId, currency, parseDate(from), parseDate(to));
  }
  @Staff('FINANCE') @Post('payouts') recordPayout(@CurrentUser() u: AuthUser, @Body() dto: RecordPayoutDto) { return this.payouts.record(u.id, dto); }
  @Staff('FINANCE') @Delete('payouts/:id') undoPayout(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.payouts.undo(u.id, id); }

  @Staff('OPERATIONS') @Get('applications') apps(@Query('status', new ParseEnumPipe(ApplicationStatus, { optional: true })) status?: ApplicationStatus) { return this.admin.listApplications(status); }
  @Staff('OPERATIONS') @Get('interviews') interviews() { return this.admin.listInterviews(); }
  @Staff('OPERATIONS') @Get('interview-slots/settings') slotSettings() { return this.slots.settings(); }
  @Staff('OPERATIONS') @Put('interview-slots/settings') saveSlotSettings(@CurrentUser() u: AuthUser, @Body() dto: InterviewSlotSettingsDto) { return this.admin.saveInterviewSlots(u.id, dto); }
  @Staff('OPERATIONS') @Get('interview-slots') slotCalendar(@Query('from') from?: string, @Query('days') days?: string, @Query('applicationId') applicationId?: string) { return this.slots.calendar(from, Number(days), applicationId); }
  @Staff('OPERATIONS') @Put('applications/:id/interview') interview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: InterviewDto) { return this.admin.scheduleInterview(u.id, id, dto); }
  @Staff('OPERATIONS') @Get('applications/:id') app(@Param('id') id: string) { return this.admin.getApplication(id); }
  @Staff('OPERATIONS') @Patch('applications/:id/details') editDetails(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AdminEditApplicationDto) { return this.admin.editApplication(u.id, id, dto); }
  @Staff('OPERATIONS') @Put('applications/:id/scorecard') score(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ScorecardDto) { return this.admin.saveScorecard(u.id, id, dto); }
  @Staff('OPERATIONS') @Patch('applications/:id/status') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) { return this.admin.setStatus(u.id, id, dto.status, dto.notes); }
  @Staff('OPERATIONS') @Post('applications/:id/request-changes') requestChanges(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RequestChangesDto) { return this.admin.requestChanges(u.id, id, dto.message); }
  @Staff('OPERATIONS') @Patch('applications/:id/notes') notes(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NotesDto) { return this.admin.saveNotes(u.id, id, dto.notes); }
  @Staff('OPERATIONS') @Patch('applications/:id/identity') identity(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VerifyIdentityDto) { return this.admin.verifyIdentity(u.id, id, dto.verified); }

  @Staff('OPERATIONS', 'FINANCE') @Get('mentors') mentors() { return this.admin.listMentors(); }
  @Staff('OPERATIONS') @Patch('mentors/:id') updateMentor(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateMentorAdminDto) { return this.admin.updateMentor(u.id, id, dto); }

  @Staff('OPERATIONS', 'FINANCE') @Get('bookings') bookings(@Query('status') status?: string) { return this.admin.listBookings(status); }
  @Staff('OPERATIONS', 'FINANCE') @Get('bookings/:reference') booking(@Param('reference') reference: string) { return this.admin.bookingDetail(reference); }

  @Staff('OPERATIONS', 'FINANCE') @Get('pricing') pricing() { return this.admin.pricing(); }
  @Put('pricing') setPricing(@CurrentUser() u: AuthUser, @Body() dto: PricingRuleDto) { return this.admin.setPricing(u.id, dto); }
  @Staff('OPERATIONS', 'FINANCE') @Get('settings') settings() { return this.admin.settings(); }
  @Put('settings') setSetting(@CurrentUser() u: AuthUser, @Body() dto: SettingDto) { return this.admin.setSetting(u.id, dto); }

  @Get('audit-log') audit() { return this.admin.auditLog(); }
  @Staff('OPERATIONS') @Get('outbox') outbox() { return this.admin.outbox(); }
}
