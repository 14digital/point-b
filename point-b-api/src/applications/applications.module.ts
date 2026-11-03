import { Module } from '@nestjs/common';
import { DailyService } from '../calls/daily.service';
import { ApplicationsController } from './applications.controller';

@Module({ controllers: [ApplicationsController], providers: [DailyService] })
export class ApplicationsModule {}
