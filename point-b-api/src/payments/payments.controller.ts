import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { PaymentsService } from './payments.service';
import { BankTransferService } from './bank.service';
import { BankSettingsDto, BankTransferDto, RejectTransferDto } from './bank.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService, private bank: BankTransferService) {}

  /** The bank's payment QR code image, shown at checkout. */
  @Public() @Get('bank-qr')
  async bankQr(@Res() res: Response) {
    const img = await this.bank.qr();
    if (!img) throw new NotFoundException('No QR code');
    res.setHeader('content-type', img.type);
    res.setHeader('cache-control', 'no-cache');
    res.send(img.data);
  }

  @ApiBearerAuth() @Roles('ADMIN') @Get('admin/bank-settings') bankSettings() { return this.bank.adminSettings(); }
  @ApiBearerAuth() @Roles('ADMIN') @Put('admin/bank-settings') saveBankSettings(@CurrentUser() u: AuthUser, @Body() dto: BankSettingsDto) { return this.bank.saveSettings(u.id, dto); }
  @ApiBearerAuth() @Roles('ADMIN') @Get('admin/bank-transfers') bankTransfers() { return this.bank.pending(); }
  @ApiBearerAuth() @Roles('ADMIN') @HttpCode(200) @Post('admin/bank-transfers/:id/approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.bank.approve(u.id, id); }
  @ApiBearerAuth() @Roles('ADMIN') @HttpCode(200) @Post('admin/bank-transfers/:id/reject') reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RejectTransferDto) { return this.bank.reject(u.id, id, dto.reason); }

  @ApiBearerAuth() @Roles('STUDENT') @HttpCode(200) @Post(':reference/bank-transfer')
  bankTransfer(@CurrentUser() u: AuthUser, @Param('reference') reference: string, @Body() dto: BankTransferDto) { return this.bank.submit(u, reference, dto); }

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
