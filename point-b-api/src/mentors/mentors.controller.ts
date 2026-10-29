import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { CreateSlotsDto, ListMentorsQuery, UpdateMentorProfileDto } from './mentors.dto';
import { MentorsService } from './mentors.service';

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
  @ApiBearerAuth() @Roles('MENTOR') @Delete('me/slots/:id') removeSlot(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.mentors.removeSlot(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/bookings') myBookings(@CurrentUser() u: AuthUser) { return this.mentors.myBookings(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/earnings') earnings(@CurrentUser() u: AuthUser) { return this.mentors.myEarnings(u.id); }

  @Public() @Get(':slug') get(@Param('slug') slug: string) { return this.mentors.getBySlug(slug); }
}
