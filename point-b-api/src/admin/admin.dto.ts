import { IsDateString, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApplicationStatus, Currency, MentorCategory, MentorLevel, MentorStatus } from '@prisma/client';

export class ScorecardDto {
  @IsInt() @Min(0) @Max(25) experience: number;
  @IsInt() @Min(0) @Max(25) expertise: number;
  @IsInt() @Min(0) @Max(20) communication: number;
  @IsInt() @Min(0) @Max(20) approach: number;
  @IsInt() @Min(0) @Max(10) conduct: number;
}

export class InterviewDto {
  @IsDateString() startAt: string;
  @IsInt() @Min(15) @Max(120) durationMinutes: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class RequestChangesDto {
  @IsString() @MinLength(10) @MaxLength(3000) message: string;
}

export class StatusDto {
  @IsEnum(ApplicationStatus) status: ApplicationStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class NotesDto { @IsString() @MaxLength(2000) notes: string; }
export class VerifyIdentityDto { @IsBoolean() verified: boolean; }

export class UpdateMentorAdminDto {
  @IsOptional() @IsEnum(MentorLevel) level?: MentorLevel;
  @IsOptional() @IsEnum(MentorCategory) category?: MentorCategory;
  /** Setting a country also sets the category: Pakistan is local, anywhere else international. */
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  /** Minor units (paisa/pence). null clears the override and returns to tier pricing. */
  @IsOptional() @IsInt() @Min(0) priceOverrideMinor?: number | null;
  @IsOptional() @IsEnum(MentorStatus) status?: MentorStatus;
  @IsOptional() @IsBoolean() verified?: boolean;
}

export class PricingRuleDto {
  @IsEnum(MentorLevel) level: MentorLevel;
  @IsEnum(Currency) currency: Currency;
  @IsInt() @Min(100) minMinor: number;
  @IsInt() @Min(100) maxMinor: number;
  /** The standard price inside the range, used for mentors without their own price. */
  @IsInt() @Min(100) priceMinor: number;
}

export class SettingDto {
  @IsIn(['commission_percent', 'commission_professional', 'commission_senior_specialist', 'commission_executive', 'repeat_commission_percent', 'reschedule_notice_hours', 'group_price_percent']) key: string;
  @IsString() @MaxLength(20) value: string;
}

export class GuardianConsentDto { @IsBoolean() consent: boolean; }
