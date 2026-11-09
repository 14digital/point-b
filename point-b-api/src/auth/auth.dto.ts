import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsPhone } from '../common/phone';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEmail() guardianEmail?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsPhone() phone: string;
  @IsOptional() @IsBoolean() whatsappAlerts?: boolean;
}

export class UpdateContactDto {
  @IsOptional() @IsPhone() phone?: string;
  @IsOptional() @IsBoolean() whatsappAlerts?: boolean;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

/** Second step of an admin sign-in: the 6-digit authenticator code, or one of the backup codes. */
export class LoginCodeDto {
  @IsString() @MaxLength(2000) mfaToken: string;
  @IsString() @MinLength(6) @MaxLength(12) code: string;
}

export class TwoFactorCodeDto { @IsString() @MinLength(6) @MaxLength(12) code: string; }
export class DisableTwoFactorDto { @IsString() password: string; @IsString() @MinLength(6) @MaxLength(12) code: string; }

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(20) token: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(100) newPassword: string;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}

export class VerifyEmailDto { @IsString() @MinLength(6) @MaxLength(6) code: string; }
/** Send a new code; with an email, also corrects a mistyped address first. */
export class ResendEmailCodeDto { @IsOptional() @IsEmail() email?: string; }
