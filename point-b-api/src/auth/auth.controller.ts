import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  /** Always answers the same way, so it can't be used to find out which emails have accounts. */
  @Public() @Throttle({ default: { limit: 5, ttl: 600_000 } }) @HttpCode(200)
  @Post('forgot-password') forgot(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto.email); }

  @Public() @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @Get('password-link/:token') link(@Param('token') token: string) { return this.auth.passwordLink(token); }

  @Public() @Throttle({ default: { limit: 10, ttl: 600_000 } }) @HttpCode(200)
  @Post('reset-password') reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto); }

  @ApiBearerAuth() @Get('me') me(@CurrentUser() u: AuthUser) { return this.auth.me(u.id); }

  @ApiBearerAuth() @Post('change-password')
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(u.id, dto); }
}
