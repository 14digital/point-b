import { Module } from '@nestjs/common';
import { DailyService } from '../calls/daily.service';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';
import { InterviewSlotsService } from './interview-slots.service';

@Module({ controllers: [AdminController, PublicController], providers: [AdminService, DailyService, InterviewSlotsService] })
export class AdminModule {}
