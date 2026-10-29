import { IsIn, IsInt, IsOptional, IsString, IsMongoId, MaxLength, Max, Min, MinLength } from 'class-validator';

export const AGENDAS = [
  'Career guidance', 'Professional development', 'Interview preparation', 'CV and portfolio review',
  'Industry advice', 'Technical guidance', 'Entrepreneurship', 'Business challenges', 'Leadership',
  'Academic decisions', 'Other',
] as const;

export class CreateBookingDto {
  @IsMongoId() slotId: string;
  @IsIn(AGENDAS as unknown as string[]) agenda: string;
  @IsString() @MinLength(10) @MaxLength(1000) currentSituation: string;
  @IsString() @MinLength(10) @MaxLength(1000) usefulOutcome: string;
  @IsOptional() @IsString() @MaxLength(1000) materialsToReview?: string;
}

export class RescheduleBookingDto {
  @IsMongoId() slotId: string;
}

export class CancelBookingDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsString() @MinLength(5) @MaxLength(1000) comment: string;
}
