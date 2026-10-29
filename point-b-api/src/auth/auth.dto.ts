import { IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEmail() guardianEmail?: string;
  @IsOptional() @IsString() timezone?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

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
