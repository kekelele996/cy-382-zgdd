import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtGuard, AuthUser } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SaveDraftInput } from './diary.dto';
import { DiaryService } from './diary.service';

@Controller('api/trips/:tripId/diary')
@UseGuards(JwtGuard)
export class DiaryController {
  constructor(private readonly service: DiaryService) {}

  @Get()
  view(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.view(Number(tripId), user.userId);
  }

  @Post('draft')
  saveDraft(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser, @Body() body: SaveDraftInput) {
    return this.service.saveDraft(Number(tripId), user.userId, user.nickname, body);
  }

  @Post('publish')
  publish(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.publish(Number(tripId), user.userId);
  }
}
