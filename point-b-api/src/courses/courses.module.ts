import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { AdminCoursesController, CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({ imports: [BookingsModule], controllers: [CoursesController, AdminCoursesController], providers: [CoursesService], exports: [CoursesService] })
export class CoursesModule {}
