import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PHOTO_IMAGE, PHOTO_IMAGE_MAX_LENGTH, PHOTO_IMAGE_MESSAGE } from '../mentors/mentor-photo';
import { AuthUser, CurrentUser, Roles, Staff, STAFF_ROLES, StaffRole } from '../common/auth';
import { AdminOpsService, SUPPORT_STATUSES } from './admin-ops.service';
import { ExportsService } from './exports.service';

class ReasonDto { @IsOptional() @IsString() @MaxLength(500) reason?: string }
class ConsentDto { @IsBoolean() consent: boolean }
class WalletAdjustDto { @IsIn(['PKR', 'GBP']) currency: 'PKR' | 'GBP'; @IsInt() @Min(-100_000_000) @Max(100_000_000) amountMinor: number; @IsString() @MinLength(3) @MaxLength(300) note: string }
class SuspendDto { @IsBoolean() suspend: boolean; @IsOptional() @IsString() @MaxLength(500) reason?: string }
class ModerateDto { @IsIn(['APPROVED', 'HIDDEN']) status: 'APPROVED' | 'HIDDEN'; @IsOptional() @IsString() @MaxLength(500) note?: string }
class TicketUpdateDto { @IsOptional() @IsIn(SUPPORT_STATUSES as unknown as string[]) status?: string; @IsOptional() @IsString() assignedTo?: string | null }
class NoteDto { @IsString() @MinLength(2) @MaxLength(4000) body: string }
class ReplyDto { @IsString() @MinLength(2) @MaxLength(6000) body: string; @IsBoolean() resolve: boolean }
class InviteDto { @IsString() @MinLength(2) @MaxLength(80) name: string; @IsEmail() email: string; @IsIn(STAFF_ROLES) staffRole: StaffRole }
class StaffRoleDto { @IsIn(STAFF_ROLES) staffRole: StaffRole }
class MentorProfileDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(120) organization?: string;
  @IsOptional() @IsString() @MaxLength(2000) introduction?: string;
  @IsOptional() @IsString() @MaxLength(4000) careerSummary?: string;
  @IsOptional() @IsString() @MaxLength(PHOTO_IMAGE_MAX_LENGTH) @Matches(PHOTO_IMAGE, { message: PHOTO_IMAGE_MESSAGE }) photoImage?: string;
  @IsOptional() @IsString() @MaxLength(300) linkedinUrl?: string;
  @IsOptional() @IsBoolean() verified?: boolean;
}
export class PayoutDetailsDto {
  @IsOptional() @IsIn(['bank', 'wallet']) method?: string;
  @IsString() @MinLength(2) @MaxLength(100) accountTitle: string;
  @IsOptional() @IsString() @MaxLength(80) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) iban?: string;
  @IsOptional() @IsString() @MaxLength(40) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) wallet?: string;
}

const date = (v?: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Choose a valid date range');
  return d;
};

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminOpsController {
  constructor(private ops: AdminOpsService, private exports: ExportsService) {}

  // Students and guardian consent
  @Staff('OPERATIONS', 'FINANCE') @Get('students') students() { return this.ops.students(); }
  @Staff('OPERATIONS', 'FINANCE') @Get('students/:id') student(@Param('id') id: string) { return this.ops.student(id); }
  @Staff('FINANCE') @HttpCode(200) @Post('students/:id/wallet') adjustWallet(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: WalletAdjustDto) { return this.ops.adjustWallet(u.id, id, dto.currency, dto.amountMinor, dto.note); }
  @Staff('OPERATIONS') @Patch('students/:id/consent') consent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ConsentDto) { return this.ops.setGuardianConsent(u.id, id, dto.consent); }
  @Staff('OPERATIONS') @Patch('students/:id/suspension') suspend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SuspendDto) { return this.ops.setSuspended(u.id, id, dto.suspend, dto.reason); }
  @HttpCode(200) @Post('students/:id/erase') erase(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() _dto: ReasonDto) { return this.ops.anonymize(u.id, id); }

  // Reviews
  @Staff('OPERATIONS') @Get('reviews') reviews() { return this.ops.reviews(); }
  @Staff('OPERATIONS') @Patch('reviews/:id') moderate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ModerateDto) { return this.ops.moderateReview(u.id, id, dto.status, dto.note); }

  // Support inbox
  @Staff('OPERATIONS') @Get('support') tickets() { return this.ops.tickets(); }
  @Staff('OPERATIONS') @Get('support/:id') ticket(@Param('id') id: string) { return this.ops.ticket(id); }
  @Staff('OPERATIONS') @Patch('support/:id') updateTicket(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TicketUpdateDto) { return this.ops.updateTicket(u, id, dto); }
  @Staff('OPERATIONS') @HttpCode(200) @Post('support/:id/notes') note(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) { return this.ops.addNote(u, id, dto.body); }
  @Staff('OPERATIONS') @HttpCode(200) @Post('support/:id/reply') reply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) { return this.ops.reply(u, id, dto.body, dto.resolve); }

  // Team (owners only)
  @Get('team') team() { return this.ops.team(); }
  @HttpCode(200) @Post('team') invite(@CurrentUser() u: AuthUser, @Body() dto: InviteDto) { return this.ops.invite(u.id, dto); }
  @Patch('team/:id') setRole(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StaffRoleDto) { return this.ops.setStaffRole(u.id, id, dto.staffRole); }
  @Delete('team/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.ops.removeMember(u.id, id); }
  @HttpCode(200) @Post('team/:id/reset-two-step') resetTwoStep(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.ops.resetMemberTwoFactor(u.id, id); }

  // Mentors in depth
  @Staff('OPERATIONS', 'FINANCE') @Get('mentors/:id/profile') mentor(@Param('id') id: string) { return this.ops.mentor(id); }
  @Staff('OPERATIONS') @Patch('mentors/:id/profile') editMentor(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MentorProfileDto) { return this.ops.updateMentorProfile(u.id, id, dto as Record<string, unknown>); }
  @Staff('FINANCE') @Patch('mentors/:id/payout-details') payoutDetails(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PayoutDetailsDto) { return this.ops.setPayoutDetails(u.id, id, { ...dto }); }

  // CSV exports for the accountant
  @Staff('FINANCE') @Get('exports/:kind')
  async export(@Param('kind') kind: string, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    const body = await this.exports.build(kind as never, date(from), date(to));
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="pointb-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('cache-control', 'private, no-store');
    res.send('﻿' + body); // byte-order mark so Excel reads Urdu names and £ correctly
  }
}
