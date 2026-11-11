import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles, Staff } from '../common/auth';
import { CancelBookingDto, DecideMentorReportDto, CreateBookingDto, CreateReviewDto, PromoCheckDto, RescheduleBookingDto } from './bookings.dto';
import { BookingsService } from './bookings.service';
import { VisitorCountry } from '../common/geo';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  @Roles('STUDENT') @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateBookingDto, @VisitorCountry() country: string | null) { return this.bookings.create(u, dto, country); }
  /** Public booking rules the website shows, such as how long before a session it can still be moved. */
  @Public() @Get('policy') async policy() { return { rescheduleNoticeHours: await this.bookings.noticeHours() }; }
  @Roles('STUDENT') @Get('promos') promos(@CurrentUser() u: AuthUser) { return this.bookings.myPromos(u); }
  @Roles('STUDENT') @Post('promo-check') promoCheck(@CurrentUser() u: AuthUser, @Body() dto: PromoCheckDto, @VisitorCountry() country: string | null) { return this.bookings.promoCheck(u, dto, country); }
  @Roles('STUDENT') @Get() list(@CurrentUser() u: AuthUser) { return this.bookings.listMine(u); }
  @Get(':reference/call') call(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.call(u, ref); }
  @Get(':reference') get(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.get(u, ref); }
  @Roles('STUDENT') @Post(':reference/reschedule') reschedule(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: RescheduleBookingDto) { return this.bookings.reschedule(u, ref, dto.slotId); }
  /** Students release an unpaid hold, or cancel a confirmed session for a full refund before the deadline. Admins can cancel for support cases. */
  @Roles('STUDENT') @HttpCode(200) @Post(':reference/report-mentor-missing') reportMissing(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.reportMissingMentor(u, ref); }
  @Staff('OPERATIONS', 'FINANCE') @Roles('ADMIN') @HttpCode(200) @Post(':reference/mentor-report') decideReport(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: DecideMentorReportDto) { return this.bookings.decideMentorReport(u, ref, dto.approve, dto.note); }
  @Staff('OPERATIONS', 'FINANCE') @Roles('STUDENT', 'ADMIN') @Post(':reference/cancel') cancel(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: CancelBookingDto) { return this.bookings.cancel(u, ref, dto); }
  @Staff('OPERATIONS') @Roles('MENTOR', 'ADMIN') @Post(':reference/complete') complete(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.markCompleted(u, ref); }
  @Staff('OPERATIONS') @Roles('MENTOR', 'ADMIN') @Post(':reference/no-show') noShow(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.markCompleted(u, ref, 'NO_SHOW'); }
  @Roles('STUDENT') @Post(':reference/review') review(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: CreateReviewDto) { return this.bookings.review(u, ref, dto); }
  @Roles('STUDENT') @Patch(':reference/review') editReview(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: CreateReviewDto) { return this.bookings.editReview(u, ref, dto); }
}
