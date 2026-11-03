import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { Public, Roles } from './auth';
import { WhatsAppService } from './whatsapp.service';

const same = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

type WebhookBody = { entry?: { changes?: { value?: { statuses?: Parameters<WhatsAppService['applyStatuses']>[0] } }[] }[] };

@ApiTags('whatsapp')
@Controller()
export class WhatsAppController {
  constructor(private whatsapp: WhatsAppService) {}

  /** Meta calls this once when the webhook is set up, to check we hold the agreed verify token. */
  @Public() @SkipThrottle() @Get('whatsapp/webhook')
  verify(@Query() q: Record<string, string>, @Res() res: Response) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected || q['hub.mode'] !== 'subscribe' || !same(String(q['hub.verify_token'] ?? ''), expected)) throw new ForbiddenException('Verification failed');
    res.type('text/plain').send(String(q['hub.challenge'] ?? ''));
  }

  /** Delivery updates from Meta. Only trusted if signed with our app secret. */
  @Public() @SkipThrottle() @HttpCode(200) @Post('whatsapp/webhook')
  async receive(@Req() req: { rawBody?: Buffer; body: WebhookBody }, @Headers('x-hub-signature-256') signature: string | undefined) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !req.rawBody || !signature) throw new UnauthorizedException('Missing signature');
    if (!same(`sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`, signature)) throw new UnauthorizedException('Invalid signature');
    const statuses = (req.body?.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []));
    await this.whatsapp.applyStatuses(statuses);
    return { ok: true };
  }

  @ApiBearerAuth() @Roles('ADMIN') @Get('admin/whatsapp/messages')
  messages() { return this.whatsapp.recent(); }
}
