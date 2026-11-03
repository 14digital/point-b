import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class MatchTurnDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MinLength(1) @MaxLength(4000) content: string;
}

export class MatchDto {
  /** The conversation so far, oldest first, ending with the student's latest message. */
  @ValidateNested({ each: true }) @Type(() => MatchTurnDto) @ArrayMinSize(1) @ArrayMaxSize(20) messages: MatchTurnDto[];
}
