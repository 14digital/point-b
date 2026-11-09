import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from './auth';
import { PrismaService } from '../prisma/prisma.service';
import { webUrl } from './email-template';
import { NotificationsService } from './notifications.service';

class FollowUpDto { @IsString() @Length(2, 3000) body!: string }

/** What the requester may see of a ticket: the conversation and status changes, never internal notes or assignments. */
const PUBLIC_KINDS = ['REPLY', 'MESSAGE', 'STATUS'];
const isId = (v: string) => /^[a-f0-9]{24}$/i.test(v);

/**
 * A signed-in student's or mentor's own support requests. New requests go through POST /contact (which links the
 * account); this lists them, shows the conversation with the POINT B team and lets the requester write back.
 */
@ApiTags('support')
@ApiBearerAuth()
@Roles('STUDENT', 'MENTOR')
@Controller('support')
export class SupportController {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}

  /** Tickets sent while signed in, plus any sent from the public form with the same email address. */
  private mine(user: AuthUser) {
    // Matching by address is only safe once the account has proven it owns that address.
    if (!user.emailVerified) return { userId: user.id };
    return { OR: [{ userId: user.id }, { email: user.email.toLowerCase() }] };
  }

  @Get('mine')
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.supportTicket.findMany({
      where: this.mine(user), orderBy: { updatedAt: 'desc' }, take: 50,
      include: { events: { where: { kind: { in: ['REPLY', 'MESSAGE'] } }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return rows.map((t) => {
      const last = t.events[0];
      return {
        id: t.id, number: t.number, topic: t.topic, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt,
        preview: (last?.body ?? t.message).slice(0, 140),
        // The team has answered and the ball is with the requester.
        replied: last?.kind === 'REPLY' && t.status !== 'RESOLVED',
      };
    });
  }

  @Get('mine/:id')
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const t = await this.find(user, id);
    const events = await this.prisma.supportEvent.findMany({ where: { ticketId: t.id, kind: { in: PUBLIC_KINDS } }, orderBy: { createdAt: 'asc' } });
    return {
      id: t.id, number: t.number, topic: t.topic, status: t.status, urgent: t.urgent, createdAt: t.createdAt, message: t.message, name: t.name,
      // Staff are shown by first name only, as in their emails.
      events: events.map((e) => ({ id: e.id, kind: e.kind, body: e.body, by: e.kind === 'MESSAGE' ? t.name : e.byName.split(' ')[0], createdAt: e.createdAt })),
    };
  }

  /** The requester writes back. A resolved request reopens, and the support inbox is told. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) @HttpCode(200) @Post('mine/:id/messages')
  async followUp(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FollowUpDto) {
    const t = await this.find(user, id);
    const body = dto.body.trim();
    await this.prisma.supportEvent.create({ data: { ticketId: t.id, kind: 'MESSAGE', body, byId: user.id, byName: t.name } });
    const reopen = t.status === 'RESOLVED';
    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status: reopen ? 'OPEN' : t.status, resolvedAt: reopen ? null : t.resolvedAt, userId: t.userId ?? user.id } });
    if (reopen) await this.prisma.supportEvent.create({ data: { ticketId: t.id, kind: 'STATUS', body: 'OPEN', byId: user.id, byName: t.name } });
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER;
    if (inbox) {
      await this.notify.send(inbox, `${t.urgent ? '[URGENT] ' : ''}New reply from ${t.name} [${t.number}]`, body, undefined, {
        replyTo: t.email, emailOnly: true,
        cta: { label: 'Open the support inbox', url: `${webUrl()}/admin?tab=support&ticket=${t.id}` },
        facts: [['From', t.name], ['Topic', t.topic], ['Reference', t.number], ...(reopen ? [['Note', 'This request was resolved and has been reopened'] as [string, string]] : [])],
      });
    }
    return this.one(user, id);
  }

  private async find(user: AuthUser, id: string) {
    if (!isId(id)) throw new NotFoundException('Request not found');
    const t = await this.prisma.supportTicket.findFirst({ where: { id, ...this.mine(user) } });
    if (!t) throw new NotFoundException('Request not found');
    return t;
  }
}
