import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [BookingsModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
