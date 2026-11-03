import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BankTransferService } from './bank.service';

@Module({ imports: [BookingsModule], controllers: [PaymentsController], providers: [PaymentsService, BankTransferService] })
export class PaymentsModule {}
