import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsString, Length } from 'class-validator';
import { randomBytes } from 'crypto';
import { AuthUser, CurrentUser, Public } from './auth';
import { PrismaService } from '../prisma/prisma.service';
import { webUrl } from './email-template';
import { NotificationsService } from './notifications.service';

export const CONTACT_TOPICS = ['A booking I’ve made', 'Payments and refunds', 'Reviews', 'Becoming a mentor', 'A safeguarding concern', 'Something else'] as const;

class ContactDto {
  @IsString() @Length(2, 100) name!: string;
  @IsEmail() email!: string;
  @IsIn(CONTACT_TOPICS) topic!: string;
  @IsString() @Length(10, 3000) message!: string;
}

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private notify: NotificationsService, private prisma: PrismaService) {}

  /** Public support form: saves a ticket for the admin inbox, alerts the support address and acknowledges the sender. */
  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200) @Post()
  async send(@Body() dto: ContactDto, @CurrentUser() user?: AuthUser) {
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER;
    const urgent = dto.topic === 'A safeguarding concern';
    let number = '';
    for (let i = 0; i < 5 && !number; i++) {
      const candidate = 'SUP-' + randomBytes(3).toString('hex').toUpperCase();
      try {
        await this.prisma.supportTicket.create({ data: { number: candidate, name: dto.name.trim(), email: dto.email.trim().toLowerCase(), topic: dto.topic, message: dto.message.trim(), urgent, userId: user?.id } });
        number = candidate;
      } catch { /* reference already used: try another */ }
    }
    if (inbox) {
      await this.notify.send(inbox, `${urgent ? '[URGENT] ' : ''}Contact form: ${dto.topic}${number ? ` [${number}]` : ''}`, dto.message, undefined, {
        replyTo: dto.email, emailOnly: true,
        cta: { label: 'Open the support inbox', url: `${webUrl()}/admin?tab=support` },
        facts: [['From', dto.name], ['Email', dto.email], ['Topic', dto.topic], ...(number ? [['Reference', number] as [string, string]] : [])],
      });
    }
    await this.notify.send(
      dto.email,
      'We’ve received your message',
      `Hi ${dto.name.split(' ')[0]},\n\nThanks for getting in touch. ${urgent ? 'Safeguarding reports are treated as urgent and a member of the POINT B team will review yours as soon as possible.' : 'A member of the POINT B team will reply to this email address within two working days.'}\n\nFor reference, here is what you sent:\n\n${dto.message}`,
      undefined,
      { emailOnly: true, facts: [['Topic', dto.topic], ...(number ? [['Reference', number] as [string, string]] : [])] },
    );
    return { ok: true, reference: number || null };
  }
}
