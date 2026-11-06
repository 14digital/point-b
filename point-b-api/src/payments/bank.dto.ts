import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BankTransferDto {
  /** The receipt screenshot as a JPEG, PNG or WebP data URL (the browser shrinks it first). */
  @IsString() @MaxLength(2_800_000) @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, { message: 'Upload a screenshot of your payment receipt (JPEG, PNG or WebP).' }) proof: string;
  @IsOptional() @IsString() @MaxLength(60) txnRef?: string;
  @IsOptional() @IsString() @MaxLength(80) senderName?: string;
}

export class BankSettingsDto {
  @IsBoolean() enabled: boolean;
  @IsString() @MaxLength(80) accountTitle: string;
  @IsString() @MaxLength(80) bankName: string;
  @IsOptional() @IsString() @MaxLength(40) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) iban?: string;
  @IsOptional() @IsString() @MaxLength(40) raastId?: string;
  /** A PNG/JPEG/WebP data URL of the bank's payment QR code; "" removes it, omitted keeps the current one. */
  @IsOptional() @IsString() @MaxLength(2_000_000) @Matches(/^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)?$/, { message: 'The QR code must be a PNG, JPEG or WebP image.' }) qrImage?: string;
}

export class RejectTransferDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}
