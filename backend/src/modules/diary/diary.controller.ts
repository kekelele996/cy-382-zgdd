import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { DiaryService } from './diary.service';
import { ReorderInput, SaveDraftInput } from './diary.dto';

@Controller('api/trips/:tripId/diary')
@UseGuards(JwtGuard)
export class DiaryController {
  constructor(private readonly service: DiaryService) {}

  /** 查看行程日记（成员可读，返回当前版本号、发布状态与当前用户权限） */
  @Get()
  get(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.getForMember(Number(tripId), user);
  }

  /** 保存草稿：携带上次版本号，版本过期整次拒绝 */
  @Put()
  save(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser, @Body() body: SaveDraftInput) {
    return this.service.saveDraft(Number(tripId), user, body);
  }

  /** 调整本人段落顺序（他人段落相对顺序不变） */
  @Post('reorder')
  @HttpCode(200)
  reorder(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser, @Body() body: ReorderInput) {
    return this.service.reorder(Number(tripId), user, body);
  }

  /** 发起人发布：冻结标题、段落顺序与作者昵称；重复发布幂等 */
  @Post('publish')
  @HttpCode(200)
  publish(@Param('tripId') tripId: string, @CurrentUser() user: AuthUser) {
    return this.service.publish(Number(tripId), user);
  }
}
