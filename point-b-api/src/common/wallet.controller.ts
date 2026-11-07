import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from './auth';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private wallet: WalletService) {}

  /** The signed-in student's balance and its history. */
  @Roles('STUDENT') @Get() mine(@CurrentUser() u: AuthUser) { return this.wallet.summary(u.id); }
}
