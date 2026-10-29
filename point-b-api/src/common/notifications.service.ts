import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { EmailOptions, renderEmail } from './email-template';

/**
 * Every message is stored in the Notification table (it is the in-app inbox and the admin outbox)
 * and emailed over SMTP when SMTP is configured. Without SMTP it is only logged, so local
 * development works with no mail server. A delivery failure never breaks the caller.
 */
@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  private transport: Transporter | null = null;
  private from?: string;

  constructor(private prisma: PrismaService) {
    // Accepts SMTP_* names, or Laravel-style MAIL_* names. The username defaults to the from-address (right for Gmail).
    const env = process.env;
    const host = env.SMTP_HOST ?? env.MAIL_HOST;
    if (host) {
      const enc = (env.MAIL_ENCRYPTION ?? '').toLowerCase();
      const port = Number(env.SMTP_PORT ?? env.MAIL_PORT ?? 587);
      const user = env.SMTP_USER ?? env.MAIL_USERNAME ?? env.MAIL_FROM_ADDRESS;
      const pass = env.SMTP_PASS ?? env.MAIL_PASSWORD;
      this.from = env.EMAIL_FROM ?? (env.MAIL_FROM_ADDRESS ? `${env.MAIL_FROM_NAME && !env.MAIL_FROM_NAME.includes('${') ? env.MAIL_FROM_NAME : 'POINT B Mentors'} <${env.MAIL_FROM_ADDRESS}>` : undefined);
      this.transport = createTransport({
        host, port, secure: port === 465 || enc === 'ssl',
        auth: user && pass ? { user, pass } : undefined,
      });
    } else {
      this.log.warn('SMTP_HOST is not set: emails are recorded and logged but not delivered');
    }
  }

  async send(toEmail: string, subject: string, body: string, userId?: string, opts: EmailOptions = {}) {
    await this.prisma.notification.create({ data: { toEmail, subject, body, userId } });
    if (!this.transport) return this.log.log(`email (not delivered) -> ${toEmail}: ${subject}`);
    try {
      await this.transport.sendMail({
        from: this.from ?? 'POINT B Mentors <no-reply@pointb.example>',
        to: toEmail, subject, ...(opts.replyTo ? { replyTo: opts.replyTo } : {}), ...(({ html, text }) => ({ html, text }))(renderEmail(subject, body, opts)),
      });
      this.log.log(`email -> ${toEmail}: ${subject}`);
    } catch (e) {
      this.log.error(`email to ${toEmail} failed: ${(e as Error).message}`);
    }
  }

  inbox(userId: string) {
    return Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { sentAt: 'desc' }, take: 30, select: { id: true, subject: true, body: true, sentAt: true, readAt: true } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]).then(([items, unread]) => ({ items, unread }));
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
