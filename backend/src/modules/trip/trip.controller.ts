import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard, AuthUser } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../../common/errors/app.exception';
import { TripService } from './trip.service';

interface CreateTripBody {
  destination?: string;
  departDate?: string;
  days?: number;
  budgetMin?: number;
  budgetMax?: number;
  transport?: string;
  companionCount?: number;
  genderPreference?: string;
}

@Controller('api/trips')
export class TripController {
  constructor(private readonly service: TripService) {}

  @Get() list() { return this.service.list(); }

  @Get('match')
  match(@Query('destination') destination: string, @Query('date') date: string, @Query('budgetMax') budgetMax: string) {
    return this.service.match(destination, date, Number(budgetMax));
  }

  @Post()
  @UseGuards(JwtGuard)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTripBody) {
    if (!body.destination || !body.departDate || !body.days || !body.transport) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, '目的地、出发时间、行程天数和出行方式必填');
    }
    return this.service.create({
      destination: body.destination,
      departDate: body.departDate,
      days: Number(body.days),
      budgetMin: body.budgetMin != null ? Number(body.budgetMin) : undefined,
      budgetMax: body.budgetMax != null ? Number(body.budgetMax) : undefined,
      transport: body.transport,
      companionCount: body.companionCount != null ? Number(body.companionCount) : 1,
      genderPreference: body.genderPreference,
      ownerId: user.userId
    });
  }
}
