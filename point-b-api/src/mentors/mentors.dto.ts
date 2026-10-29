import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { MentorCategory, MentorLevel, SessionKind } from '@prisma/client';

export class ListMentorsQuery {
  @IsOptional() @IsEnum(MentorCategory) category?: MentorCategory;
  @IsOptional() @IsEnum(MentorLevel) level?: MentorLevel;
  @IsOptional() @IsString() expertise?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() sort?: 'soonest' | 'price_asc' | 'price_desc' | 'rating';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}


export class UpdateMentorProfileDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(120) organization?: string;
  @IsOptional() @IsString() @MaxLength(1200) introduction?: string;
  @IsOptional() @IsString() @MaxLength(2000) careerSummary?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) qualifications?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) achievements?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) helpTopics?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) outsideScope?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) expertise?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) industries?: string[];
  @IsOptional() @IsUrl() linkedinUrl?: string;
  /** Public https URL of a square or portrait headshot. */
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) photoUrl?: string;
}

export class CreateSlotsDto {
  /** ISO start times; each creates one 30-minute slot. Must be on :00 or :30 and in the future. */
  @IsArray() @ArrayMaxSize(200) @IsDateString({}, { each: true }) startTimes: string[];
  /** ONE_TO_ONE (default) or GROUP, where several students share the slot at a lower per-seat price. */
  @IsOptional() @IsEnum(SessionKind) kind?: SessionKind;
  /** Seats for a GROUP slot (2 to 10). Ignored for ONE_TO_ONE. */
  @IsOptional() @IsInt() @Min(2) @Max(10) capacity?: number;
}
