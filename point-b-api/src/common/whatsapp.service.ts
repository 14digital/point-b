import { Injectable, Logger } from '@nestjs/common';

/**
 * WhatsApp delivery through the WhatsApp Business Cloud API (Meta). Business-initiated messages must use an approved
 * template, so every alert is sent through one generic template with three parameters: title, message, link.
 * Needs WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN) and WHATSAPP_PHONE_NUMBER_ID; without them messages are only logged, like email without SMTP.
 */
@Injectable()
export class WhatsAppService {
  private log = new Logger('WhatsApp');

  private token() { return process.env.WHATSAPP_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN; }

  enabled() { return !!this.token() && !!process.env.WHATSAPP_PHONE_NUMBER_ID; }

  async send(toE164: string, title: string, message: string, link: string) {
    // Template parameters can't contain new lines or long runs of spaces, and are capped in length.
    const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
    if (!this.enabled()) return this.log.log(`whatsapp (not delivered) -> ${toE164}: ${title}`);
    try {
      const res = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? 'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token()}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toE164.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: process.env.WHATSAPP_TEMPLATE ?? 'pointb_alert',
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
            components: [{ type: 'body', parameters: [clean(title, 120), clean(message, 700), clean(link, 300)].map((text) => ({ type: 'text', text })) }],
          },
        }),
      });
      if (!res.ok) this.log.error(`whatsapp to ${toE164} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      else this.log.log(`whatsapp -> ${toE164}: ${title}`);
    } catch (e) {
      this.log.error(`whatsapp to ${toE164} failed: ${(e as Error).message}`);
    }
  }
}
