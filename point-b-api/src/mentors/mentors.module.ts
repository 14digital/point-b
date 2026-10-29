import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { MentorsController } from './mentors.controller';
import { MentorsService } from './mentors.service';

@Module({ imports: [BookingsModule], controllers: [MentorsController], providers: [MentorsService] })
export class MentorsModule {}
