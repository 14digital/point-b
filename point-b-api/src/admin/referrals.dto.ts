import { IsBoolean, IsDateString, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MAX_PROMO_PERCENT } from '../common/pricing';

export class CreateReferralDto {
  @IsMongoId() mentorId: string;
  /** Letters, digits and dashes, 4 to 20 long. Left out: one is made from the mentor's name. */
  @IsOptional() @Matches(/^[A-Za-z0-9-]{4,20}$/, { message: 'Codes use 4 to 20 letters, numbers or dashes.' }) code?: string;
  @IsInt() @Min(1) @Max(MAX_PROMO_PERCENT) percentOff: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxUses?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class UpdateReferralDto {
  @IsOptional() @IsBoolean() paused?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_PROMO_PERCENT) percentOff?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  /** null removes the limit. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100000) maxUses?: number | null;
  /** null removes the end date. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() expiresAt?: string | null;
}
