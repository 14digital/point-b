import { Module } from '@nestjs/common';
import { MentorsModule } from '../mentors/mentors.module';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';

@Module({ imports: [MentorsModule], controllers: [MatchController], providers: [MatchService] })
export class MatchModule {}
