import { Module } from '@nestjs/common';
import { DailyService } from '../calls/daily.service';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';
import { InterviewSlotsService } from './interview-slots.service';
import { PayoutsService } from './payouts.service';

@Module({ controllers: [AdminController, PublicController], providers: [AdminService, DailyService, InterviewSlotsService, PayoutsService] })
export class AdminModule {}
