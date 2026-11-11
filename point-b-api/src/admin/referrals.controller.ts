import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles, Staff } from '../common/auth';
import { CreateReferralDto, UpdateReferralDto } from './referrals.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Staff('OPERATIONS', 'FINANCE')
@Controller('admin/referral-codes')
export class AdminReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Get() list() { return this.referrals.list(); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateReferralDto) { return this.referrals.create(u.id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateReferralDto) { return this.referrals.update(u.id, id, dto); }
}

@ApiTags('mentors')
@ApiBearerAuth()
@Roles('MENTOR')
@Controller('mentors/me/referral-codes')
export class MentorReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Get() mine(@CurrentUser() u: AuthUser) { return this.referrals.forMentor(u.id); }
}
