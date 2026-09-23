import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ERROR_CODES } from '../../constants/errors';
import { MemberStatus, TripStatus } from '../../constants/status';
import { AppException } from '../../common/errors/app.exception';
import { DiaryService } from '../diary/diary.service';
import { TripEntity } from './trip.entity';
import { TripMemberEntity } from './trip-member.entity';
import { TripAccessService } from './trip-access.service';

export interface MemberView {
  userId: number;
  nickname: string;
  role: 'OWNER' | 'MEMBER';
  status: string;
  joinedAt: string;
}

@Injectable()
export class TripMemberService {
  constructor(
    @InjectRepository(TripMemberEntity) private readonly memberRepo: Repository<TripMemberEntity>,
    @InjectRepository(TripEntity) private readonly tripRepo: Repository<TripEntity>,
    private readonly access: TripAccessService,
    @Inject(forwardRef(() => DiaryService)) private readonly diaries: DiaryService
  ) {}

  async join(tripId: number, userId: number): Promise<{ joined: boolean }> {
    const { role } = await this.access.getRole(tripId, userId);
    if (role.isOwner) throw new AppException(ERROR_CODES.VALIDATION_FAILED, '发起人无需加入自己的行程');
    const existing = await this.memberRepo.findOneBy({ tripId, userId });
    if (!existing) {
      await this.memberRepo.save(this.memberRepo.create({ tripId, userId, status: MemberStatus.Active }));
    } else if (existing.status === MemberStatus.Active) {
      throw new AppException(ERROR_CODES.ALREADY_MEMBER, '你已经在该行程中');
    } else {
      // 重新入队：成员关系恢复在队，但此前在离队期间被冻结的段落仍不可编辑
      existing.status = MemberStatus.Active;
      existing.leftAt = null;
      await this.memberRepo.save(existing);
    }
    return { joined: true };
  }

  async leave(tripId: number, userId: number): Promise<{ left: boolean }> {
    const { role } = await this.access.getRole(tripId, userId);
    if (role.isOwner) throw new AppException(ERROR_CODES.OWNER_CANNOT_LEAVE, '发起人不能离开自己的行程', 403);
    if (!role.isMember || !role.memberActive) throw new AppException(ERROR_CODES.NOT_TRIP_MEMBER, '你当前不在该行程中', 403);
    await this.memberRepo.update({ tripId, userId }, { status: MemberStatus.Left, leftAt: () => 'CURRENT_TIMESTAMP' });
    // 离队后其段落仍可查看，但任何人（含重新入队的本人）都不能再修改
    await this.diaries.lockAuthorParagraphs(tripId, userId);
    return { left: true };
  }

  async finish(tripId: number, userId: number): Promise<{ status: string }> {
    const { trip, role } = await this.access.getRole(tripId, userId);
    if (!role.isOwner) throw new AppException(ERROR_CODES.NOT_TRIP_OWNER, '只有发起人可以结束行程', 403);
    if (trip.status !== TripStatus.Finished) {
      trip.status = TripStatus.Finished;
      await this.tripRepo.save(trip);
    }
    return { status: TripStatus.Finished };
  }

  async list(tripId: number, userId: number): Promise<{ ownerId: number; members: MemberView[] }> {
    const { trip, role } = await this.access.getRole(tripId, userId);
    if (!role.isMember) throw new AppException(ERROR_CODES.NOT_TRIP_MEMBER, '只有行程成员可以查看成员列表', 403);
    const ownerRows: Array<{ userId: number; nickname: string }> = await this.memberRepo.manager.query(
      'SELECT id AS userId, nickname FROM users WHERE id = ?',
      [trip.ownerId]
    );
    const rows: Array<{ userId: number; nickname: string; status: string; joinedAt: Date | null }> =
      await this.memberRepo.manager.query(
        `SELECT u.id AS userId, u.nickname AS nickname, m.status AS status, m.joined_at AS joinedAt
         FROM trip_members m INNER JOIN users u ON u.id = m.user_id
         WHERE m.trip_id = ? ORDER BY m.joined_at ASC`,
        [tripId]
      );
    const members: MemberView[] = [
      ...ownerRows.map(row => ({ userId: Number(row.userId), nickname: row.nickname, role: 'OWNER' as const, status: MemberStatus.Active, joinedAt: '' })),
      ...rows
        .filter(row => Number(row.userId) !== trip.ownerId)
        .map(row => ({
          userId: Number(row.userId),
          nickname: row.nickname,
          role: 'MEMBER' as const,
          status: row.status,
          joinedAt: row.joinedAt ? new Date(row.joinedAt).toISOString() : ''
        }))
    ];
    return { ownerId: trip.ownerId, members };
  }
}
