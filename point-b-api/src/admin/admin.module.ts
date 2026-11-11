import { AdminReferralsController, MentorReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { Module } from '@nestjs/common';
import { DailyService } from '../calls/daily.service';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';
import { InterviewSlotsService } from './interview-slots.service';
import { PayoutsService } from './payouts.service';
import { AdminOpsController } from './admin-ops.controller';
import { AdminOpsService } from './admin-ops.service';
import { ExportsService } from './exports.service';

@Module({ controllers: [AdminController, AdminOpsController, PublicController, AdminReferralsController, MentorReferralsController], providers: [AdminService, DailyService, InterviewSlotsService, PayoutsService, AdminOpsService, ExportsService, ReferralsService], exports: [AdminOpsService] })
export class AdminModule {}
