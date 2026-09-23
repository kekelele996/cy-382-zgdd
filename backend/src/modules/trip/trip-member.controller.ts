import { Controller, Param, Post, Get, UseGuards } from '@nestjs/common';
import { JwtGuard, AuthUser } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TripMemberService } from './trip-member.service';

@Controller('api/trips/:tripId')
@UseGuards(JwtGuard)
export class TripMemberController {
  constructor(private readonly service: TripMemberService) {}

  @Post('join')
  join(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.join(Number(tripId), user.userId);
  }

  @Post('leave')
  leave(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.leave(Number(tripId), user.userId);
  }

  @Post('finish')
  finish(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.finish(Number(tripId), user.userId);
  }

  @Get('members')
  list(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.list(Number(tripId), user.userId);
  }
}
