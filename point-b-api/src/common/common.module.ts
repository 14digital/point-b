import { Global, Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { SupportController } from './support.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PasswordLinksService } from './password-links.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Global()
@Module({ controllers: [NotificationsController, ContactController, SupportController, WhatsAppController, WalletController], providers: [NotificationsService, PasswordLinksService, WhatsAppService, WalletService], exports: [WalletService, NotificationsService, PasswordLinksService, WhatsAppService] })
export class CommonModule {}
