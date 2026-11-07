import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public, Roles, Staff } from '../common/auth';
import { ChangePasswordDto, DisableTwoFactorDto, ForgotPasswordDto, LoginCodeDto, LoginDto, RegisterDto, ResetPasswordDto, TwoFactorCodeDto, UpdateContactDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Public() @Throttle({ default: { limit: 8, ttl: 300_000 } }) @HttpCode(200)
  @Post('login/code') loginCode(@Body() dto: LoginCodeDto) { return this.auth.loginWithCode(dto); }

  // Two-step sign-in for the admin team.
  @ApiBearerAuth() @Roles('ADMIN') @Staff('OPERATIONS', 'FINANCE') @Get('2fa') twoFactor(@CurrentUser() u: AuthUser) { return this.auth.twoFactorStatus(u.id); }
  @ApiBearerAuth() @Roles('ADMIN') @Staff('OPERATIONS', 'FINANCE') @HttpCode(200) @Post('2fa/setup') setupTwoFactor(@CurrentUser() u: AuthUser) { return this.auth.startTwoFactor(u.id); }
  @ApiBearerAuth() @Roles('ADMIN') @Staff('OPERATIONS', 'FINANCE') @Throttle({ default: { limit: 10, ttl: 300_000 } }) @HttpCode(200) @Post('2fa/enable') enableTwoFactor(@CurrentUser() u: AuthUser, @Body() dto: TwoFactorCodeDto) { return this.auth.enableTwoFactor(u.id, dto.code); }
  @ApiBearerAuth() @Roles('ADMIN') @Staff('OPERATIONS', 'FINANCE') @Throttle({ default: { limit: 10, ttl: 300_000 } }) @HttpCode(200) @Post('2fa/disable') disableTwoFactor(@CurrentUser() u: AuthUser, @Body() dto: DisableTwoFactorDto) { return this.auth.disableTwoFactor(u.id, dto); }
  @ApiBearerAuth() @Roles('ADMIN') @Staff('OPERATIONS', 'FINANCE') @Throttle({ default: { limit: 10, ttl: 300_000 } }) @HttpCode(200) @Post('2fa/backup-codes') backupCodes(@CurrentUser() u: AuthUser, @Body() dto: TwoFactorCodeDto) { return this.auth.newBackupCodes(u.id, dto.code); }

  /** Always answers the same way, so it can't be used to find out which emails have accounts. */
  @Public() @Throttle({ default: { limit: 5, ttl: 600_000 } }) @HttpCode(200)
  @Post('forgot-password') forgot(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto.email); }

  @Public() @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @Get('password-link/:token') link(@Param('token') token: string) { return this.auth.passwordLink(token); }

  @Public() @Throttle({ default: { limit: 10, ttl: 600_000 } }) @HttpCode(200)
  @Post('reset-password') reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto); }

  @ApiBearerAuth() @Get('me') me(@CurrentUser() u: AuthUser) { return this.auth.me(u.id); }
  @ApiBearerAuth() @Patch('me/contact') contact(@CurrentUser() u: AuthUser, @Body() dto: UpdateContactDto) { return this.auth.updateContact(u.id, dto); }

  @ApiBearerAuth() @Post('change-password')
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(u.id, dto); }
}
