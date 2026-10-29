import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { DailyService } from '../calls/daily.service';
import { BookingsService } from './bookings.service';
import { StripeService } from '../payments/stripe.service';

@Module({ controllers: [BookingsController], providers: [BookingsService, DailyService, StripeService], exports: [BookingsService, StripeService] })
export class BookingsModule {}
