import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsString, Length } from 'class-validator';
import { Public } from './auth';
import { NotificationsService } from './notifications.service';

export const CONTACT_TOPICS = ['A booking I’ve made', 'Payments and refunds', 'Becoming a mentor', 'A safeguarding concern', 'Something else'] as const;

class ContactDto {
  @IsString() @Length(2, 100) name!: string;
  @IsEmail() email!: string;
  @IsIn(CONTACT_TOPICS) topic!: string;
  @IsString() @Length(10, 3000) message!: string;
}

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private notify: NotificationsService) {}

  /** Public support form: emails the support inbox and sends the sender an acknowledgement. */
  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200) @Post()
  async send(@Body() dto: ContactDto) {
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER;
    const urgent = dto.topic === 'A safeguarding concern';
    if (inbox) {
      await this.notify.send(inbox, `${urgent ? '[URGENT] ' : ''}Contact form: ${dto.topic}`, dto.message, undefined, {
        replyTo: dto.email,
        facts: [['From', dto.name], ['Email', dto.email], ['Topic', dto.topic]],
      });
    }
    await this.notify.send(
      dto.email,
      'We’ve received your message',
      `Hi ${dto.name.split(' ')[0]},\n\nThanks for getting in touch. ${urgent ? 'Safeguarding reports are treated as urgent and a member of the POINT B team will review yours as soon as possible.' : 'A member of the POINT B team will reply to this email address within two working days.'}\n\nFor reference, here is what you sent:\n\n${dto.message}`,
      undefined,
      { facts: [['Topic', dto.topic]] },
    );
    return { ok: true };
  }
}
