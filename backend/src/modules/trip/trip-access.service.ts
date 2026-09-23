import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ERROR_CODES } from '../../constants/errors';
import { MemberStatus, TripStatus } from '../../constants/status';
import { AppException } from '../../common/errors/app.exception';
import { TripEntity } from './trip.entity';
import { TripMemberEntity } from './trip-member.entity';

export interface TripRole {
  isOwner: boolean;
  isMember: boolean;
  memberActive: boolean;
}

@Injectable()
export class TripAccessService {
  constructor(
    @InjectRepository(TripEntity) private readonly trips: Repository<TripEntity>,
    @InjectRepository(TripMemberEntity) private readonly members: Repository<TripMemberEntity>
  ) {}

  async requireTrip(tripId: number): Promise<TripEntity> {
    const trip = await this.trips.findOneBy({ id: tripId });
    if (!trip) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '行程不存在', 404);
    return trip;
  }

  /** 行程是否结束：发起人将状态置为 FINISHED，或出发日期 + 天数已过期。 */
  isFinished(trip: TripEntity): boolean {
    if (trip.status === TripStatus.Finished) return true;
    const end = new Date(trip.departDate);
    end.setDate(end.getDate() + Number(trip.days) - 1);
    return end.getTime() < Date.now();
  }

  async getRole(tripId: number, userId: number): Promise<{ trip: TripEntity; role: TripRole }> {
    const trip = await this.requireTrip(tripId);
    const isOwner = trip.ownerId === userId;
    const membership = await this.members.findOneBy({ tripId, userId });
    const memberActive = membership?.status === MemberStatus.Active;
    const role: TripRole = { isOwner, isMember: isOwner || !!membership, memberActive: isOwner || memberActive };
    return { trip, role };
  }

  /** 日记仅行程成员（含已离队成员）可查看。 */
  async requireViewer(tripId: number, userId: number): Promise<{ trip: TripEntity; role: TripRole }> {
    const result = await this.getRole(tripId, userId);
    if (!result.role.isMember) throw new AppException(ERROR_CODES.NOT_TRIP_MEMBER, '只有行程成员可以查看该日记', 403);
    return result;
  }

  /** 编辑草稿要求是当前仍在队的成员（发起人恒为在队）。 */
  async requireEditor(tripId: number, userId: number): Promise<{ trip: TripEntity; role: TripRole }> {
    const result = await this.getRole(tripId, userId);
    if (!result.role.memberActive) throw new AppException(ERROR_CODES.NOT_TRIP_MEMBER, '已离开行程，无法再编辑日记', 403);
    return result;
  }
}
