import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { CreatePromoDto, CreateSlotsDto, ListMentorsQuery, RemoveSlotsDto, UpdateMentorProfileDto } from './mentors.dto';
import { MentorsService } from './mentors.service';
import { PayoutDetailsDto } from '../admin/admin-ops.controller';

@ApiTags('mentors')
@Controller('mentors')
export class MentorsController {
  constructor(private mentors: MentorsService) {}

  @Public() @Get() list(@Query() q: ListMentorsQuery) { return this.mentors.list(q); }
  @Public() @Get('facets') facets() { return this.mentors.facets(); }

  // Mentor self-service. Declared before :slug so "me" is not captured as a slug.
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/profile') me(@CurrentUser() u: AuthUser) { return this.mentors.me(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Patch('me/profile') updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateMentorProfileDto) { return this.mentors.updateMe(u.id, dto); }
  @ApiBearerAuth() @Roles('MENTOR') @Post('me/agreement') agree(@CurrentUser() u: AuthUser) { return this.mentors.acceptAgreement(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/slots') slots(@CurrentUser() u: AuthUser) { return this.mentors.mySlots(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Post('me/slots') addSlots(@CurrentUser() u: AuthUser, @Body() dto: CreateSlotsDto) { return this.mentors.addSlots(u.id, dto); }
  @ApiBearerAuth() @Roles('MENTOR') @Post('me/slots/remove') removeSlots(@CurrentUser() u: AuthUser, @Body() dto: RemoveSlotsDto) { return this.mentors.removeSlots(u.id, dto.ids); }
  @ApiBearerAuth() @Roles('MENTOR') @Delete('me/slots/:id') removeSlot(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.mentors.removeSlot(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/bookings') myBookings(@CurrentUser() u: AuthUser) { return this.mentors.myBookings(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/reviews') myReviews(@CurrentUser() u: AuthUser) { return this.mentors.myReviews(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/students') students(@CurrentUser() u: AuthUser) { return this.mentors.myStudents(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/promo-codes') promos(@CurrentUser() u: AuthUser) { return this.mentors.myPromos(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Post('me/promo-codes') createPromo(@CurrentUser() u: AuthUser, @Body() dto: CreatePromoDto) { return this.mentors.createPromo(u.id, dto); }
  @ApiBearerAuth() @Roles('MENTOR') @Delete('me/promo-codes/:id') revokePromo(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.mentors.revokePromo(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/earnings') earnings(@CurrentUser() u: AuthUser) { return this.mentors.myEarnings(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/payouts') payouts(@CurrentUser() u: AuthUser) { return this.mentors.myPayouts(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/payout-details') payoutDetails(@CurrentUser() u: AuthUser) { return this.mentors.myPayoutDetails(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Put('me/payout-details') savePayoutDetails(@CurrentUser() u: AuthUser, @Body() dto: PayoutDetailsDto) { return this.mentors.saveMyPayoutDetails(u.id, { ...dto }); }

  /** The URL changes with every new photo, so browsers can keep it for good. */
  @Public() @Get(':id/photo')
  async photo(@Param('id') id: string, @Res() res: Response) {
    const data = await this.mentors.photo(id);
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.send(data);
  }

  @Public() @Get(':slug') get(@Param('slug') slug: string) { return this.mentors.getBySlug(slug); }
}
