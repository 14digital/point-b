import { Module } from '@nestjs/common';
import { DailyService } from '../calls/daily.service';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';

@Module({ controllers: [AdminController, PublicController], providers: [AdminService, DailyService] })
export class AdminModule {}
