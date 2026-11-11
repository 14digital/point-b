import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth';
import { VisitorCountry } from '../common/geo';
import { AdminService } from './admin.service';

@ApiTags('public')
@Controller('pricing')
export class PublicController {
  constructor(private admin: AdminService) {}
  @Public() @Get() tiers(@VisitorCountry() country: string | null) { return this.admin.publicPricing(country); }
}
