import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public, Roles, Staff } from '../common/auth';
import { TrackDto } from './activity.dto';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@ApiBearerAuth()
@Controller()
export class ActivityController {
  constructor(private activity: ActivityService) {}

  /** Open to guests, who are identified only by a random browser ID. Signed-in users are recognised from their token. */
  @Public() @Throttle({ default: { limit: 60, ttl: 60_000 } }) @HttpCode(200) @Post('activity/track')
  track(@CurrentUser() u: AuthUser | undefined, @Body() dto: TrackDto) { return this.activity.track(u, dto); }

  @Staff('OPERATIONS') @Roles('ADMIN') @Get('admin/activity/overview') overview(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) { return this.activity.overview(days); }
  @Staff('OPERATIONS') @Roles('ADMIN') @Get('admin/activity/people') people() { return this.activity.people(); }
  @Staff('OPERATIONS') @Roles('ADMIN') @Get('admin/activity/people/:id') journey(@Param('id') id: string) { return this.activity.journey(id); }
  @Staff('OPERATIONS') @Roles('ADMIN') @HttpCode(200) @Post('admin/activity/triggers/:id/handled') handled(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.activity.markHandled(u.id, id); }
}
