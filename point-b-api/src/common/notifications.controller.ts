import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from './auth';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get() inbox(@CurrentUser() u: AuthUser) { return this.notifications.inbox(u.id); }
  @Post('read') read(@CurrentUser() u: AuthUser) { return this.notifications.markAllRead(u.id); }
}
