import { Body, Controller, Get, Param, Post, Query, Patch, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { TripService } from './trip.service';
import { TripMemberService } from './trip-member.service';

@Controller('api/trips')
export class TripController {
  constructor(private readonly service: TripService, private readonly members: TripMemberService) {}

  @Get() list() { return this.service.list(); }

  @Get('match')
  match(@Query('destination') destination: string, @Query('date') date: string, @Query('budgetMax') budgetMax: string) {
    return this.service.match(destination, date, Number(budgetMax));
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const trip = await this.service.getById(Number(id));
    return { ...trip, finished: this.service.isFinished(trip), memberCount: (await this.members.list(Number(id))).length };
  }

  @Post()
  @UseGuards(JwtGuard)
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.service.create({ ...body, ownerId: user.userId });
  }

  @Patch(':id/finish')
  @UseGuards(JwtGuard)
  finish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.finish(Number(id), user.userId);
  }
}
