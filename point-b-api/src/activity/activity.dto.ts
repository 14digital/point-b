import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

/** Events a browser may report. Everything else (sign-ins, payments, bookings) is recorded by the server itself. */
export const CLIENT_EVENTS = ['page_view', 'searched', 'slot_selected', 'booking_started', 'auth_prompted', 'booking_step', 'payment_attempted', 'payment_failed', 'application_step', 'application_submitted', 'contact_sent', 'signed_out'] as const;

export class TrackEventDto {
  @IsIn(CLIENT_EVENTS as unknown as string[]) type: string;
  @IsOptional() @IsString() @MaxLength(300) page?: string;
  @IsOptional() @IsString() @MaxLength(300) label?: string;
  @IsOptional() @IsString() @MaxLength(40) reference?: string;
}

export class TrackDto {
  /** The browser's random guest ID. */
  @IsOptional() @IsUUID() visitorId?: string;
  @IsOptional() @IsString() @MaxLength(60) device?: string;
  @IsOptional() @IsString() @MaxLength(120) referrer?: string;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TrackEventDto) events: TrackEventDto[];
}
