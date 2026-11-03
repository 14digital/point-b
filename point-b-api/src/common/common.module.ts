import { Global, Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PasswordLinksService } from './password-links.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Global()
@Module({ controllers: [NotificationsController, ContactController, WhatsAppController], providers: [NotificationsService, PasswordLinksService, WhatsAppService], exports: [NotificationsService, PasswordLinksService, WhatsAppService] })
export class CommonModule {}
