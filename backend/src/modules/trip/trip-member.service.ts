import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberStatus } from '../../constants/status';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../../common/errors/app.exception';
import { TripMemberEntity } from './trip-member.entity';

@Injectable()
export class TripMemberService {
  constructor(@InjectRepository(TripMemberEntity) private readonly members: Repository<TripMemberEntity>) {}

  /** 行程内全部成员（含已离队，按入队顺序） */
  list(tripId: number) {
    return this.members.find({ where: { tripId }, order: { id: 'ASC' } });
  }

  /** 查成员记录（含已离队） */
  findRecord(tripId: number, userId: number) {
    return this.members.findOne({ where: { tripId, userId } });
  }

  /** 加入行程；曾离队则恢复为在队（不重复建行） */
  async join(tripId: number, userId: number, nickname: string) {
    const record = await this.findRecord(tripId, userId);
    if (record) {
      if (record.status === MemberStatus.Active) return record;
      record.status = MemberStatus.Active;
      return this.members.save(record);
    }
    return this.members.save(this.members.create({ tripId, userId, joinedNickname: nickname, status: MemberStatus.Active }));
  }

  /** 离队：记录保留，成员离队后其段落仍可查看但不能再改 */
  async leave(tripId: number, userId: number) {
    const record = await this.findRecord(tripId, userId);
    if (!record || record.status !== MemberStatus.Active) {
      throw new AppException(ERROR_CODES.NOT_TRIP_MEMBER, '当前不在该行程中', 403);
    }
    record.status = MemberStatus.Left;
    return this.members.save(record);
  }

  /** 必须是行程成员（在队或离队均可），否则 403 */
  async requireMember(tripId: number, userId: number): Promise<TripMemberEntity> {
    const record = await this.findRecord(tripId, userId);
    if (!record) throw new AppException(ERROR_CODES.NOT_TRIP_MEMBER, '仅行程成员可查看该日记', 403);
    return record;
  }

  /** 必须仍在队，否则 403 */
  async requireActiveMember(tripId: number, userId: number): Promise<TripMemberEntity> {
    const record = await this.requireMember(tripId, userId);
    if (record.status !== MemberStatus.Active) {
      throw new AppException(ERROR_CODES.MEMBER_LEFT, '已离队，段落仍可查看但不能再修改', 403);
    }
    return record;
  }
}
