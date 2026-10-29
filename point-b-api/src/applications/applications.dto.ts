import { OmitType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateApplicationDto {
  @IsString() @MinLength(2) @MaxLength(100) fullName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) @MaxLength(30) phone: string;
  @IsString() @MaxLength(80) countryOfResidence: string;
  @IsString() @MaxLength(80) professionalLocation: string;
  @IsUrl() linkedinUrl: string;
  @IsString() @MinLength(5) @MaxLength(140) headline: string;
  @IsString() @MaxLength(100) currentRole: string;
  @IsString() @MaxLength(120) organization: string;
  @IsInt() @Min(0) @Max(60) yearsExperience: number;
  @IsString() @MaxLength(80) industry: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) specialistAreas: string[];
  @IsString() @MaxLength(500) qualifications: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) languages: string[];
  @IsString() @MaxLength(1000) previousMentorshipExperience: string;
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) topicsOffered: string[];
  @IsString() @MaxLength(200) preferredPricing: string;
  @IsString() @MaxLength(300) weeklyAvailability: string;
  @IsString() @MinLength(20) @MaxLength(2000) motivation: string;
  @IsIn(['Paid', 'Voluntary']) participation: 'Paid' | 'Voluntary';
  @IsBoolean() agreedToTerms: boolean;
}

/** What an applicant can change through their update link. The email address is fixed. */
export class UpdateApplicationDto extends OmitType(CreateApplicationDto, ['email'] as const) {}
