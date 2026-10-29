import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { GuardianConsentDto, NotesDto, PricingRuleDto, ScorecardDto, SettingDto, StatusDto, UpdateMentorAdminDto, VerifyIdentityDto, RequestChangesDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats') stats() { return this.admin.stats(); }

  @Get('applications') apps(@Query('status', new ParseEnumPipe(ApplicationStatus, { optional: true })) status?: ApplicationStatus) { return this.admin.listApplications(status); }
  @Get('applications/:id') app(@Param('id') id: string) { return this.admin.getApplication(id); }
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
