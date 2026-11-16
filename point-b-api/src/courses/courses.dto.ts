import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/** Currencies a mentor can state their fee in. Learners always pay in rupees. */
export const FEE_CURRENCIES = ['PKR', 'USD', 'GBP', 'EUR', 'AED'] as const;
export const SESSION_LENGTHS = [45, 60, 90, 120, 180] as const;
export const MAX_SESSIONS = 24;

/** A mentor's course, saved as a draft or sent to the POINT B team. Every field is required to submit. */
export class CourseDraftDto {
  @IsString() @MinLength(5) @MaxLength(120) title: string;
  @IsString() @MinLength(30) @MaxLength(1500) summary: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @IsString({ each: true }) @MinLength(3, { each: true }) @MaxLength(160, { each: true }) topics: string[];
  /** Optional: what each class covers, in order (class 1 first). Empty strings are fine for classes not yet planned. */
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_SESSIONS) @IsString({ each: true }) @MaxLength(240, { each: true }) classOutlines?: string[];
  @IsOptional() @IsString() @MaxLength(400) audience?: string;
  /** First class, YYYY-MM-DD, Pakistan time. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @Type(() => Number) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays: number[];
  /** HH:mm in Pakistan time, on the hour or half hour. */
  @Matches(/^([01]\d|2[0-3]):(00|30)$/) startTime: string;
  @IsInt() @Min(1) @Max(MAX_SESSIONS) sessionsCount: number;
  @IsIn(SESSION_LENGTHS as unknown as number[]) sessionMinutes: number;
  /** The mentor's fee for teaching the whole course, in minor units of mentorFeeCurrency. */
  @IsInt() @Min(0) @Max(100_000_000_00) mentorFeeMinor: number;
  @IsIn(FEE_CURRENCIES as unknown as string[]) mentorFeeCurrency: string;
  /** true sends it to the POINT B team for approval; otherwise it is kept as a draft. */
  @IsOptional() @IsBoolean() submit?: boolean;
}

/** The team approves a course and sets what each learner pays, in PKR minor units (paisa). */
export class ApproveCourseDto {
  @IsInt() @Min(100) @Max(100_000_000_00) priceMinor: number;
  /** Seat limit, or null for no limit. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(5000) capacity?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/** Changes the price or seat limit of a live course. New enrolments pay the new price. */
export class UpdateLiveCourseDto {
  @IsOptional() @IsInt() @Min(100) @Max(100_000_000_00) priceMinor?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(5000) capacity?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_SESSIONS) @IsString({ each: true }) @MaxLength(240, { each: true }) classOutlines?: string[];
}

export class ReturnCourseDto {
  @IsString() @MinLength(5) @MaxLength(1000) note: string;
  /** true declines it for good; otherwise it goes back to the mentor to change. */
  @IsOptional() @IsBoolean() reject?: boolean;
}

export class CourseFeePaidDto {
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SuggestCourseDto {
  /** Optional: a working title or idea to build the suggestion around. */
  @IsOptional() @IsString() @MaxLength(200) idea?: string;
}

export class EnrolDto {
  /** The price on the learner's screen, so they are never charged something different from what they saw. */
  @IsOptional() @IsInt() @Min(0) expectedPriceMinor?: number;
}
