import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** The browser's private key for its conversation: random, 24 to 64 letters, digits or dashes. */
const KEY = /^[A-Za-z0-9-]{24,64}$/;

export class AssistantChatDto {
  @Matches(KEY) key: string;
  @IsString() @MinLength(1) @MaxLength(2000) message: string;
  /** The page they're chatting from, e.g. /mentors/sara-khan. */
  @IsOptional() @IsString() @MaxLength(200) page?: string;
  /** Their browser's time zone, so times are told in their own clock. */
  @IsOptional() @IsString() @MaxLength(60) timeZone?: string;
}

export class TeamReplyDto {
  @IsString() @MinLength(1) @MaxLength(2000) content: string;
}

export class ChatModeDto {
  /** "agent": a team member is replying and the AI stays quiet. "ai": hand the chat back to the AI. */
  @IsIn(['agent', 'ai']) mode: 'agent' | 'ai';
}

export { KEY as CHAT_KEY };
