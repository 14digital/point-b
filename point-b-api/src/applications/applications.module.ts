import { Module } from '@nestjs/common';
import { DailyService } from '../calls/daily.service';
import { ApplicationsController } from './applications.controller';
import { LinkedInImportService } from './linkedin-import.service';

@Module({ controllers: [ApplicationsController], providers: [DailyService, LinkedInImportService] })
export class ApplicationsModule {}
