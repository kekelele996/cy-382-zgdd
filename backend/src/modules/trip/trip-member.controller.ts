import { Controller, Get, HttpCode, Param, Post, Delete, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { TripService } from './trip.service';
import { TripMemberService } from './trip-member.service';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../../common/errors/app.exception';

@Controller('api/trips/:tripId/members')
@UseGuards(JwtGuard)
export class TripMemberController {
  constructor(private readonly trips: TripService, private readonly members: TripMemberService) {}

  /** 行程成员列表（含已离队成员） */
  @Get()
  async list(@Param('tripId') tripId: string) {
    await this.trips.getById(Number(tripId));
    return this.members.list(Number(tripId));
  }

  /** 申请/确认加入行程 */
  @Post()
  @HttpCode(200)
  async join(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    await this.trips.getById(Number(tripId));
    return this.members.join(Number(tripId), user.userId, user.nickname);
  }

  /** 离队（发起人不可离队）；离队后段落保留但不可再改 */
  @Delete('me')
  async leave(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    const trip = await this.trips.getById(Number(tripId));
    if (trip.ownerId === user.userId) throw new AppException(ERROR_CODES.VALIDATION_FAILED, '发起人不能离队', 400);
    return this.members.leave(Number(tripId), user.userId);
  }
}
