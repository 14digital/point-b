import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth';
import { MatchDto } from './match.dto';
import { MatchService } from './match.service';

@ApiTags('match')
@Controller('match')
export class MatchController {
  constructor(private match: MatchService) {}

  // Open to visitors, so it is rate-limited per IP: each call is a paid model request.
  @Public() @Throttle({ default: { limit: 30, ttl: 3_600_000 } }) @HttpCode(200)
  @Post() find(@Body() dto: MatchDto) { return this.match.match(dto.messages); }
}
