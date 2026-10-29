import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  /** Server-to-server provider callback, authenticated by HMAC signature (never by a browser redirect). */
  @Public() @HttpCode(200) @Post('webhook')
  webhook(@Req() req: { rawBody?: Buffer }, @Headers('x-signature') sig: string, @Body() body: { providerRef: string; status: 'succeeded' | 'failed' }) {
    this.payments.verifySignature(req.rawBody, sig);
    return this.payments.applyResult(body.providerRef, body.status);
  }

  /** Stripe webhook, authenticated by the Stripe-Signature header. */
  @Public() @HttpCode(200) @Post('stripe/webhook')
  stripeWebhook(@Req() req: { rawBody?: Buffer }, @Headers('stripe-signature') sig: string) {
    return this.payments.stripeWebhook(req.rawBody, sig);
  }

  @ApiBearerAuth() @Roles('STUDENT') @HttpCode(200) @Post(':reference/checkout')
  checkout(@CurrentUser() u: AuthUser, @Param('reference') reference: string) { return this.payments.checkout(u, reference); }

  @ApiBearerAuth() @Roles('STUDENT') @HttpCode(200) @Post(':reference/sync')
  sync(@CurrentUser() u: AuthUser, @Param('reference') reference: string) { return this.payments.sync(u, reference); }

  @ApiBearerAuth() @Roles('STUDENT') @HttpCode(200) @Post('mock/:providerRef/complete')
  mock(@CurrentUser() u: AuthUser, @Param('providerRef') ref: string) { return this.payments.mockComplete(u, ref); }
}
