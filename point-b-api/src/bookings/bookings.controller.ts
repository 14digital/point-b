import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { CancelBookingDto, CreateBookingDto, CreateReviewDto, RescheduleBookingDto } from './bookings.dto';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  @Roles('STUDENT') @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateBookingDto) { return this.bookings.create(u, dto); }
  @Roles('STUDENT') @Get() list(@CurrentUser() u: AuthUser) { return this.bookings.listMine(u); }
  @Get(':reference/call') call(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.call(u, ref); }
  @Get(':reference') get(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.get(u, ref); }
  @Roles('STUDENT') @Post(':reference/reschedule') reschedule(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: RescheduleBookingDto) { return this.bookings.reschedule(u, ref, dto.slotId); }
  /** Students may only release an unpaid hold; confirmed sessions are rescheduled, not cancelled. Admins can cancel for support cases. */
  @Roles('STUDENT', 'ADMIN') @Post(':reference/cancel') cancel(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: CancelBookingDto) { return this.bookings.cancel(u, ref, dto); }
  @Roles('MENTOR', 'ADMIN') @Post(':reference/complete') complete(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.markCompleted(u, ref); }
  @Roles('MENTOR', 'ADMIN') @Post(':reference/no-show') noShow(@CurrentUser() u: AuthUser, @Param('reference') ref: string) { return this.bookings.markCompleted(u, ref, 'NO_SHOW'); }
  @Roles('STUDENT') @Post(':reference/review') review(@CurrentUser() u: AuthUser, @Param('reference') ref: string, @Body() dto: CreateReviewDto) { return this.bookings.review(u, ref, dto); }
}
