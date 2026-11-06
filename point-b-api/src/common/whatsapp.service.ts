import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_TEMPLATES, type WhatsAppAlert } from './whatsapp-templates';

/** Meta's error for a template name that doesn't exist (or isn't approved) in that language. */
const TEMPLATE_MISSING = 132001;
/** Template parameters can't contain new lines or long runs of spaces, and are capped in length. */
const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
type SendResult = { wamid?: string; errorCode?: number; errorTitle?: string; errorDetail?: string };

/** Later statuses never get overwritten by an update that arrives late. A failure always shows. */
const RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3 };

/**
 * WhatsApp delivery through the WhatsApp Business Cloud API (Meta). Business-initiated messages must use an approved
 * template: each student alert has its own (see whatsapp-templates.ts), and anything else uses one generic template.
 * Needs WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN) and WHATSAPP_PHONE_NUMBER_ID; without them messages are only logged, like email without SMTP.
 * Meta accepting a message doesn't mean it arrived: delivery results come later through the webhook.
 */
@Injectable()
export class WhatsAppService {
  private log = new Logger('WhatsApp');

  constructor(private prisma: PrismaService) {}

  private token() { return process.env.WHATSAPP_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN; }

  enabled() { return !!this.token() && !!process.env.WHATSAPP_PHONE_NUMBER_ID; }

  /** The generic alert template: title, message, link. Meta tends to charge it as marketing, so alerts with their own template use that instead. */
  async send(toE164: string, title: string, message: string, link: string) {
    if (!this.enabled()) return this.log.log(`whatsapp (not delivered) -> ${toE164}: ${title}`);
    const template = process.env.WHATSAPP_TEMPLATE ?? 'pointb_alert';
    await this.record(toE164, title, template, await this.post(toE164, template, [clean(title, 120), clean(message, 700), clean(link, 300)]));
  }

  /**
   * Sends an alert through its own Utility template. Until that template is approved, Meta answers 132001
   * ("template does not exist") and the alert goes out through the generic template instead, as before.
   */
  async sendAlert(toE164: string, title: string, alert: WhatsAppAlert, params: string[], fallback: { message: string; link: string }) {
    if (!this.enabled()) return this.log.log(`whatsapp (not delivered) -> ${toE164}: ${title}`);
    const { name } = WHATSAPP_TEMPLATES[alert];
    const result = await this.post(toE164, name, params.map((p) => clean(p, 300)));
    if (result.errorCode === TEMPLATE_MISSING) {
      this.log.warn(`template ${name} is not approved yet; sending "${title}" with the generic template`);
      return this.send(toE164, title, fallback.message, fallback.link);
    }
    await this.record(toE164, title, name, result);
  }

  private async post(toE164: string, template: string, params: string[]): Promise<SendResult> {
    try {
      const res = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? 'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token()}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toE164.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: template,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
            components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
          },
        }),
      });
      const body = (await res.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } } | null;
      if (res.ok) return { wamid: body?.messages?.[0]?.id };
      this.log.error(`whatsapp ${template} to ${toE164} failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
      return { errorCode: body?.error?.code, errorTitle: body?.error?.message?.slice(0, 200), errorDetail: body?.error?.error_data?.details?.slice(0, 500) };
    } catch (e) {
      this.log.error(`whatsapp ${template} to ${toE164} failed: ${(e as Error).message}`);
      return { errorTitle: (e as Error).message.slice(0, 200) };
    }
  }

  private async record(toE164: string, title: string, template: string, r: SendResult) {
    if (r.wamid) this.log.log(`whatsapp ${template} -> ${toE164}: ${title}`);
    await this.prisma.whatsAppMessage
      .create({ data: { toPhone: toE164, title: clean(title, 120), template, status: r.wamid ? 'accepted' : 'rejected', ...r } })
      .catch((e) => this.log.warn(`could not save message status: ${e.message}`));
  }

  /** Applies delivery updates from Meta's webhook. Unknown messages are ignored. */
  async applyStatuses(statuses: { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }[]) {
    for (const s of statuses) {
      if (!s.id || !s.status) continue;
      const row = await this.prisma.whatsAppMessage.findFirst({ where: { wamid: s.id } });
      if (!row) continue;
      const err = s.errors?.[0];
      if (s.status === 'failed') {
        await this.prisma.whatsAppMessage.update({ where: { id: row.id }, data: { status: 'failed', errorCode: err?.code, errorTitle: (err?.title ?? err?.message)?.slice(0, 200), errorDetail: err?.error_data?.details?.slice(0, 500) } });
        this.log.warn(`whatsapp ${row.title} failed: ${err?.code} ${err?.title ?? ''}`);
      } else if (s.status in RANK && (RANK[row.status] ?? 99) < RANK[s.status]) {
        await this.prisma.whatsAppMessage.update({ where: { id: row.id }, data: { status: s.status } });
      }
    }
  }

  /** Recent messages for the admin panel, with who each went to. */
  async recent() {
    const rows = await this.prisma.whatsAppMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const users = await this.prisma.user.findMany({ where: { phone: { in: [...new Set(rows.map((r) => r.toPhone))] } }, select: { name: true, phone: true } });
    const counts = await this.prisma.whatsAppMessage.groupBy({ by: ['status'], _count: true });
    const lastUpdate = rows.find((r) => r.status !== 'accepted' && r.status !== 'rejected')?.updatedAt ?? null;
    return {
      enabled: this.enabled(),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      lastUpdate,
      rows: rows.map((r) => ({ id: r.id, name: users.find((u) => u.phone === r.toPhone)?.name ?? null, phone: r.toPhone, title: r.title, template: r.template, status: r.status, errorCode: r.errorCode, errorTitle: r.errorTitle, errorDetail: r.errorDetail, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    };
  }
}
