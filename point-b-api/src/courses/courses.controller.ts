import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public, Roles, Staff } from '../common/auth';
import { BookingsService } from '../bookings/bookings.service';
import { ApproveCourseDto, CourseDraftDto, CourseFeePaidDto, EnrolDto, ReturnCourseDto, SuggestCourseDto, UpdateLiveCourseDto } from './courses.dto';
import { CoursesService } from './courses.service';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private courses: CoursesService, private bookings: BookingsService) {}

  /** Live courses, soonest first. ?mentor=<slug> narrows them to one faculty member's. */
  @Public() @Get() list(@Query('mentor') mentor?: string) { return this.courses.listLiveFor(mentor); }
  @Public() @Get('faculty') faculty() { return this.courses.faculty(); }

  // Mentor self-service. Declared before :slug so "me" is not captured as a slug.
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/list') mine(@CurrentUser() u: AuthUser) { return this.courses.listMine(u.id); }
  @ApiBearerAuth() @Roles('MENTOR') @Throttle({ default: { limit: 20, ttl: 3_600_000 } }) @HttpCode(200) @Post('me/suggest') suggest(@CurrentUser() u: AuthUser, @Body() dto: SuggestCourseDto) { return this.courses.suggest(u.id, dto); }
  @ApiBearerAuth() @Roles('MENTOR') @Post('me') create(@CurrentUser() u: AuthUser, @Body() dto: CourseDraftDto) { return this.courses.create(u.id, dto); }
  @ApiBearerAuth() @Roles('MENTOR') @Put('me/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CourseDraftDto) { return this.courses.update(u.id, id, dto); }
  @ApiBearerAuth() @Roles('MENTOR') @HttpCode(200) @Post('me/:id/withdraw') withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.courses.withdraw(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @Delete('me/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.courses.remove(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/:id/roster') roster(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.courses.roster(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @Get('me/:id/classes') classes(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.courses.classes(u.id, id); }
  @ApiBearerAuth() @Roles('MENTOR') @HttpCode(200) @Post('me/:id/classes/:n/complete') completeClass(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('n') n: string) { return this.courses.completeClass({ userId: u.id }, id, Number(n)); }
  @ApiBearerAuth() @Roles('MENTOR') @Patch('me/:id/outlines') outlines(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { classOutlines: string[] }) { return this.courses.setOutlines(u.id, id, body.classOutlines ?? []); }

  /** A learner takes a seat; pay for it at /bookings/:reference as with any booking. */
  @ApiBearerAuth() @Roles('STUDENT') @Post(':id/enrol') enrol(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: EnrolDto) { return this.bookings.enrol(u, id, dto.expectedPriceMinor); }

  @Public() @Get(':slug') get(@Param('slug') slug: string) { return this.courses.getBySlug(slug); }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private courses: CoursesService) {}

  @Staff('OPERATIONS', 'FINANCE') @Get() list(@Query('status') status?: string) { return this.courses.adminList(status); }
  @Staff('OPERATIONS', 'FINANCE') @Get(':id/roster') roster(@Param('id') id: string) { return this.courses.adminRoster(id); }
  @Staff('OPERATIONS') @Get(':id/classes') classes(@Param('id') id: string) { return this.courses.adminClasses(id); }
  @Staff('OPERATIONS') @HttpCode(200) @Post(':id/classes/:n/complete') completeClass(@Param('id') id: string, @Param('n') n: string) { return this.courses.completeClass({ admin: true }, id, Number(n)); }
  @Staff('OPERATIONS') @HttpCode(200) @Post(':id/approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ApproveCourseDto) { return this.courses.approve(u.id, id, dto); }
  @Staff('OPERATIONS') @HttpCode(200) @Post(':id/return') sendBack(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReturnCourseDto) { return this.courses.sendBack(u.id, id, dto); }
  @Staff('OPERATIONS') @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateLiveCourseDto) { return this.courses.updateLive(u.id, id, dto); }
  @Staff('OPERATIONS') @HttpCode(200) @Post(':id/close') close(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.courses.setOpen(u.id, id, false); }
  @Staff('OPERATIONS') @HttpCode(200) @Post(':id/reopen') reopen(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.courses.setOpen(u.id, id, true); }
  @Staff('FINANCE') @HttpCode(200) @Post(':id/fee-paid') feePaid(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CourseFeePaidDto) { return this.courses.recordFeePaid(u.id, id, dto); }
}
