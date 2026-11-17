import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { CoursesModule } from '../courses/courses.module';
import { AdminChatsController, AssistantController } from './assistant.controller';
import { ChatStoreService } from './chat-store.service';
import { AssistantService } from './assistant.service';

@Module({ imports: [CoursesModule, BookingsModule], controllers: [AssistantController, AdminChatsController], providers: [AssistantService, ChatStoreService] })
export class AssistantModule {}
