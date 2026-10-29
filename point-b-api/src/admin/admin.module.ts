import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';

@Module({ controllers: [AdminController, PublicController], providers: [AdminService] })
export class AdminModule {}
