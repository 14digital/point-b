import { Global, Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PasswordLinksService } from './password-links.service';

@Global()
@Module({ controllers: [NotificationsController, ContactController], providers: [NotificationsService, PasswordLinksService], exports: [NotificationsService, PasswordLinksService] })
export class CommonModule {}
