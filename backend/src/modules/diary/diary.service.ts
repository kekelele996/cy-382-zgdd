import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DiaryStatus, MemberStatus } from '../../constants/status';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../../common/guards/current-user.decorator';
import { UserEntity } from '../user/user.entity';
import { TripEntity } from '../trip/trip.entity';
import { TripService } from '../trip/trip.service';
import { TripMemberService } from '../trip/trip-member.service';
import { DiaryEntity } from './diary.entity';
import { DiaryParagraphEntity } from './diary-paragraph.entity';
import { ParagraphInput, ReorderInput, SaveDraftInput } from './diary.dto';
import { DiaryView, serializeDiary } from './diary.serializer';

export interface DiaryPermissionView extends DiaryView {
  permissions: {
    active: boolean;
    isOwner: boolean;
    finished: boolean;
    canEdit: boolean;
    canPublish: boolean;
  };
}

@Injectable()
export class DiaryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(DiaryEntity) private readonly diaries: Repository<DiaryEntity>,
    @InjectRepository(DiaryParagraphEntity) private readonly paragraphs: Repository<DiaryParagraphEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly trips: TripService,
    private readonly members: TripMemberService
  ) {}

  /** 取行程日记，首次访问自动建立草稿 */
  private async getOrCreateDiary(trip: TripEntity): Promise<DiaryEntity> {
    const existing = await this.diaries.findOneBy({ tripId: trip.id });
    if (existing) return existing;
    try {
      return await this.diaries.save(
        this.diaries.create({ tripId: trip.id, title: `${trip.destination}旅行日记`, version: 1, status: DiaryStatus.Draft })
      );
    } catch (error) {
      // 并发首访触发唯一索引冲突时，以已落库的那份为准
      const found = await this.diaries.findOneBy({ tripId: trip.id });
      if (found) return found;
      throw error;
    }
  }

  private async listParagraphs(diaryId: number): Promise<DiaryParagraphEntity[]> {
    return this.paragraphs.find({ where: { diaryId }, order: { seq: 'ASC' } });
  }

  /** 成员查看日记（含已离队成员）；草稿/发布状态及版本号以后端返回为准 */
  async getForMember(tripId: number, user: AuthUser): Promise<DiaryPermissionView> {
    const trip = await this.trips.getById(tripId);
    const member = await this.members.requireMember(tripId, user.userId);
    const diary = await this.getOrCreateDiary(trip);
    const view = serializeDiary(diary, await this.listParagraphs(diary.id));
    const finished = this.trips.isFinished(trip);
    const isOwner = trip.ownerId === user.userId;
    const active = member.status === MemberStatus.Active;
    const isDraft = diary.status === DiaryStatus.Draft;
    return {
      ...view,
      permissions: {
        active,
        isOwner,
        finished,
        canEdit: active && isDraft,
        canPublish: isOwner && finished && isDraft
      }
    };
  }

  /** 保存草稿：行程结束前仅能存草稿；提交上次版本号，过期则拒绝整次修改 */
  async saveDraft(tripId: number, user: AuthUser, input: SaveDraftInput): Promise<DiaryView> {
    const trip = await this.trips.getById(tripId);
    await this.members.requireActiveMember(tripId, user.userId);
    const diary = await this.getOrCreateDiary(trip);

    const title = input.title === undefined ? undefined : String(input.title).trim();
    const paragraphInputs: ParagraphInput[] | undefined = input.paragraphs;
    const deleteIds = input.deleteParagraphIds ?? [];

    // 入参基本校验：任何一项不通过都不写库
    if (input.version === undefined || !Number.isInteger(input.version)) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, '缺少上次版本号', 400);
    }
    if (title !== undefined && (title.length === 0 || title.length > 160)) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, '标题长度需在 1-160 字之间', 400);
    }
    if (paragraphInputs) {
      for (const item of paragraphInputs) {
        const content = String(item.content ?? '').trim();
        if (content.length === 0 || content.length > 5000) {
          throw new AppException(ERROR_CODES.VALIDATION_FAILED, '段落内容长度需在 1-5000 字之间', 400);
        }
      }
    }

    return this.dataSource.transaction(async manager => {
      const locked = await this.lockDiary(manager, tripId);

      // 已发布：服务端内容冻结，拒绝修改
      if (locked.status !== DiaryStatus.Draft) {
        throw new AppException(ERROR_CODES.DIARY_PUBLISHED, '日记已发布，不能再修改', 409, await this.currentView(locked, manager));
      }
      // 版本过期：整次修改拒绝，服务端内容与他人段落不动
      if (locked.version !== input.version) {
        throw new AppException(ERROR_CODES.DIARY_VERSION_CONFLICT, '版本已过期，请刷新后基于最新版本修改', 409, await this.currentView(locked, manager));
      }

      const existing = await manager.getRepository(DiaryParagraphEntity).find({ where: { diaryId: locked.id } });
      const byId = new Map(existing.map(item => [item.id, item]));

      // 先做全部归属校验，任一不通过则整体不生效
      for (const item of paragraphInputs ?? []) {
        if (item.existingId !== undefined) {
          const target = byId.get(item.existingId);
          if (!target) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `段落 ${item.existingId} 不存在`, 404);
          if (target.authorId !== user.userId) {
            throw new AppException(ERROR_CODES.NOT_PARAGRAPH_AUTHOR, '只能修改本人创建的段落，整次修改已拒绝', 403);
          }
        }
      }
      for (const id of deleteIds) {
        const target = byId.get(id);
        if (!target) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `段落 ${id} 不存在`, 404);
        if (target.authorId !== user.userId) {
          throw new AppException(ERROR_CODES.NOT_PARAGRAPH_AUTHOR, '只能删除本人创建的段落，整次修改已拒绝', 403);
        }
      }

      const paragraphRepo = manager.getRepository(DiaryParagraphEntity);

      // 删除本人段落
      if (deleteIds.length > 0) await paragraphRepo.delete(deleteIds);

      // 更新本人段落
      for (const item of paragraphInputs ?? []) {
        if (item.existingId === undefined) continue;
        const target = byId.get(item.existingId)!;
        target.content = String(item.content).trim();
        target.authorNickname = user.nickname;
        await paragraphRepo.save(target);
      }

      // 草稿期昵称跟随当前昵称（包括本次未改动的本人段落）
      const owned = existing.filter(item => item.authorId === user.userId && !deleteIds.includes(item.id));
      for (const item of owned) {
        if (item.authorNickname !== user.nickname) {
          item.authorNickname = user.nickname;
          await paragraphRepo.save(item);
        }
      }

      // 新建本人段落，追加到队尾
      if (paragraphInputs) {
        const maxSeq = existing.reduce((max, item) => (deleteIds.includes(item.id) ? max : Math.max(max, item.seq)), -1);
        let seq = maxSeq + 1;
        for (const item of paragraphInputs) {
          if (item.existingId !== undefined) continue;
          await paragraphRepo.save(
            paragraphRepo.create({
              diaryId: locked.id,
              authorId: user.userId,
              authorNickname: user.nickname,
              content: String(item.content).trim(),
              seq: seq++
            })
          );
        }
      }

      if (title !== undefined) locked.title = title;
      locked.version += 1;
      await manager.getRepository(DiaryEntity).save(locked);

      return serializeDiary(locked, await this.listParagraphsIn(locked, manager));
    });
  }

  /** 调整段落顺序：只能在草稿期、在队成员操作，他人段落相对顺序不能变 */
  async reorder(tripId: number, user: AuthUser, input: ReorderInput): Promise<DiaryView> {
    const trip = await this.trips.getById(tripId);
    await this.members.requireActiveMember(tripId, user.userId);
    await this.getOrCreateDiary(trip);

    if (!Array.isArray(input.paragraphIds)) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, '缺少段落顺序', 400);
    }

    return this.dataSource.transaction(async manager => {
      const locked = await this.lockDiary(manager, tripId);

      if (locked.status !== DiaryStatus.Draft) {
        throw new AppException(ERROR_CODES.DIARY_PUBLISHED, '日记已发布，段落顺序已冻结', 409, await this.currentView(locked, manager));
      }
      if (locked.version !== input.version) {
        throw new AppException(ERROR_CODES.DIARY_VERSION_CONFLICT, '版本已过期，请刷新后再调整顺序', 409, await this.currentView(locked, manager));
      }

      const existing = await this.listParagraphsIn(locked, manager);
      const byId = new Map(existing.map(item => [item.id, item]));
      const currentIds = existing.map(item => item.id);

      // 必须是当前全部段落的一个排列
      const sameSet = input.paragraphIds.length === currentIds.length && input.paragraphIds.every(id => byId.has(id));
      const noDuplicate = new Set(input.paragraphIds).size === input.paragraphIds.length;
      if (!sameSet || !noDuplicate) {
        throw new AppException(ERROR_CODES.VALIDATION_FAILED, '提交的段落顺序与当前段落不一致', 400);
      }

      // 他人段落的相对顺序必须保持不变
      const othersBefore = existing.filter(item => item.authorId !== user.userId).map(item => item.id);
      const othersAfter = input.paragraphIds.filter(id => byId.get(id)!.authorId !== user.userId);
      if (othersBefore.join(',') !== othersAfter.join(',')) {
        throw new AppException(ERROR_CODES.NOT_PARAGRAPH_AUTHOR, '不能改变他人段落的相对顺序，整次修改已拒绝', 403);
      }

      const paragraphRepo = manager.getRepository(DiaryParagraphEntity);
      input.paragraphIds.forEach((id, index) => {
        byId.get(id)!.seq = index;
      });
      await paragraphRepo.save([...byId.values()]);

      locked.version += 1;
      await manager.getRepository(DiaryEntity).save(locked);
      return serializeDiary(locked, await this.listParagraphsIn(locked, manager));
    });
  }

  /** 发起人发布：行程结束后才允许；冻结标题、段落顺序和作者昵称；重复发布只生效一次 */
  async publish(tripId: number, user: AuthUser): Promise<DiaryView> {
    const trip = await this.trips.getById(tripId);
    if (trip.ownerId !== user.userId) {
      throw new AppException(ERROR_CODES.NOT_TRIP_OWNER, '仅发起人可以发布旅行日记', 403);
    }
    if (!this.trips.isFinished(trip)) {
      throw new AppException(ERROR_CODES.TRIP_NOT_FINISHED, '行程结束前只能保存草稿', 409);
    }
    const diary = await this.getOrCreateDiary(trip);

    return this.dataSource.transaction(async manager => {
      const locked = await this.lockDiary(manager, tripId);

      // 重复发布：幂等返回已发布版本，不再次生效
      if (locked.status === DiaryStatus.Published) {
        return serializeDiary(locked, await this.listParagraphsIn(locked, manager));
      }

      const title = locked.title.trim();
      if (!title) throw new AppException(ERROR_CODES.VALIDATION_FAILED, '日记标题不能为空', 400);

      const paragraphs = await this.listParagraphsIn(locked, manager);
      const authorIds = [...new Set(paragraphs.map(item => item.authorId))];
      const authors = await manager.getRepository(UserEntity).findBy(authorIds.map(id => ({ id })));
      const nicknameById = new Map(authors.map(author => [author.id, author.nickname]));

      const paragraphRepo = manager.getRepository(DiaryParagraphEntity);
      paragraphs
        .sort((a, b) => a.seq - b.seq)
        .forEach((item, index) => {
          item.seq = index; // 冻结当前顺序
          item.authorNickname = nicknameById.get(item.authorId) ?? item.authorNickname; // 冻结作者昵称
        });
      await paragraphRepo.save(paragraphs);

      locked.status = DiaryStatus.Published;
      locked.publishedTitle = title;
      locked.publishedBy = user.userId;
      locked.publishedAt = new Date();
      locked.version += 1; // 让持旧草稿的客户端在下次保存时收到版本冲突并刷新
      await manager.getRepository(DiaryEntity).save(locked);

      return serializeDiary(locked, paragraphs);
    });
  }

  /** 事务内锁定日记行：MySQL 下行级悲观写锁，串行化并发提交；不支持的驱动退化为普通读取（版本号乐观锁仍保证正确性） */
  private lockDiary(manager: EntityManager, tripId: number) {
    const type = (manager.connection.options as { type?: string }).type;
    const supportsLock = type === 'mysql' || type === 'mariadb' || type === 'postgres' || type === 'aurora-postgres';
    const qb = manager.getRepository(DiaryEntity).createQueryBuilder('d').where('d.trip_id = :tripId', { tripId });
    return supportsLock ? qb.setLock('pessimistic_write').getOneOrFail() : qb.getOneOrFail();
  }

  private async listParagraphsIn(diary: DiaryEntity, manager: EntityManager) {
    return manager.getRepository(DiaryParagraphEntity).find({ where: { diaryId: diary.id }, order: { seq: 'ASC' } });
  }

  private async currentView(diary: DiaryEntity, manager: EntityManager) {
    return serializeDiary(diary, await this.listParagraphsIn(diary, manager));
  }
}
