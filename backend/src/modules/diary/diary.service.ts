import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ERROR_CODES } from '../../constants/errors';
import { DiaryStatus } from '../../constants/status';
import { AppException } from '../../common/errors/app.exception';
import { TripAccessService } from '../trip/trip-access.service';
import { DiaryEntity, PublishedSnapshot } from './diary.entity';
import { DiaryParagraphEntity } from './diary-paragraph.entity';
import { DiaryView, ParagraphView, SaveDraftInput } from './diary.dto';

@Injectable()
export class DiaryService {
  constructor(
    @InjectRepository(DiaryEntity) private readonly diaryRepo: Repository<DiaryEntity>,
    @InjectRepository(DiaryParagraphEntity) private readonly paragraphRepo: Repository<DiaryParagraphEntity>,
    private readonly access: TripAccessService,
    private readonly dataSource: DataSource
  ) {}

  /** 首次访问时懒创建草稿（version = 0），之后始终复用同一条记录。 */
  private async ensureDiary(tripId: number): Promise<DiaryEntity> {
    const existing = await this.diaryRepo.findOneBy({ tripId });
    if (existing) return existing;
    try {
      return await this.diaryRepo.save(this.diaryRepo.create({ tripId }));
    } catch (err) {
      // 并发首次访问可能触发唯一键冲突，重读即可
      const again = await this.diaryRepo.findOneBy({ tripId });
      if (again) return again;
      throw err;
    }
  }

  /** 成员离队时冻结其名下所有段落，之后不可再编辑。 */
  async lockAuthorParagraphs(tripId: number, authorId: number): Promise<void> {
    await this.paragraphRepo.update({ tripId, authorId, locked: false }, { locked: true });
  }

  async view(tripId: number, userId: number): Promise<DiaryView> {
    const { trip, role } = await this.access.requireViewer(tripId, userId);
    const diary = await this.ensureDiary(tripId);

    if (diary.status === DiaryStatus.Published && diary.publishedSnapshot) {
      return this.publishedView(tripId, diary);
    }

    const finished = this.access.isFinished(trip);
    const paragraphs = await this.paragraphRepo.find({ where: { diaryId: diary.id }, order: { sortOrder: 'ASC', id: 'ASC' } });
    return {
      tripId,
      status: diary.status,
      version: diary.version,
      title: diary.title,
      publishedAt: diary.publishedAt ? diary.publishedAt.toISOString() : null,
      frozen: false,
      canEdit: role.memberActive,
      canPublish: role.isOwner && finished,
      paragraphs: paragraphs.map(p => this.toView(p, userId, role.memberActive))
    };
  }

  private toView(p: DiaryParagraphEntity, userId: number, memberActive: boolean): ParagraphView {
    const locked = Boolean(p.locked);
    return {
      id: p.id,
      authorId: p.authorId,
      authorNickname: p.authorNickname,
      content: p.content,
      sortOrder: p.sortOrder,
      locked,
      editable: memberActive && !locked && p.authorId === userId
    };
  }

  private publishedView(tripId: number, diary: DiaryEntity): DiaryView {
    const snapshot = diary.publishedSnapshot as PublishedSnapshot;
    return {
      tripId,
      status: DiaryStatus.Published,
      version: diary.version,
      title: snapshot.title,
      publishedAt: snapshot.publishedAt,
      frozen: true,
      canEdit: false,
      canPublish: false,
      paragraphs: snapshot.paragraphs.map(p => ({ ...p, locked: true, editable: false }))
    };
  }

  /**
   * 保存草稿。整次修改在一个事务内完成：
   * 1) 仅在队成员可保存；
   * 2) 条件 UPDATE 校验版本号与草稿状态，VERSION 不一致则整次拒绝，服务端内容和他人段落不动；
   * 3) 只允许提交本人创建且未冻结的段落，触碰他人/冻结段落同样整次拒绝；
   * 4) 成功后 version + 1。
   */
  async saveDraft(tripId: number, userId: number, nickname: string, input: SaveDraftInput): Promise<DiaryView> {
    await this.access.requireEditor(tripId, userId);
    await this.ensureDiary(tripId);
    const paragraphInputs = input.paragraphs ?? [];
    for (const item of paragraphInputs) {
      if (typeof item.content !== 'string' || !item.content.trim()) {
        throw new AppException(ERROR_CODES.VALIDATION_FAILED, '段落内容不能为空');
      }
    }
    if (input.title != null && input.title.length > 160) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, '标题不能超过 160 字');
    }
    const clientVersion = Number(input.version);
    if (!Number.isInteger(clientVersion) || clientVersion < 0) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, '版本号不合法');
    }

    await this.dataSource.transaction(async manager => {
      const diaryRepo = manager.getRepository(DiaryEntity);
      const paragraphRepo = manager.getRepository(DiaryParagraphEntity);
      const diary = await diaryRepo.findOneBy({ tripId });
      if (!diary) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '日记尚未初始化');
      if (diary.status === DiaryStatus.Published) {
        throw new AppException(ERROR_CODES.DIARY_PUBLISHED, '日记已发布，内容已冻结，不能再修改', 409);
      }
      if (diary.version !== clientVersion) {
        throw new AppException(ERROR_CODES.VERSION_CONFLICT, '日记已有新版本，请刷新后再保存', 409);
      }

      const existing = await paragraphRepo.find({ where: { diaryId: diary.id } });
      // 先做归属校验：提交包里只要混入一条他人/已冻结段落，整次修改拒绝
      for (const item of paragraphInputs) {
        if (item.id == null) continue;
        const target = existing.find(p => p.id === Number(item.id));
        if (!target || target.authorId !== userId || target.locked) {
          throw new AppException(ERROR_CODES.PARAGRAPH_FORBIDDEN, '只能修改本人创建的段落，整次修改未提交', 403);
        }
      }

      // 原子乐观锁：仅当版本号仍是客户端版本且仍为草稿时才推进版本
      const claim = await diaryRepo
        .createQueryBuilder()
        .update(DiaryEntity)
        .set({
          version: diary.version + 1,
          ...(input.title != null ? { title: input.title.trim() } : {})
        })
        .where('trip_id = :tripId AND version = :version AND status = :status', {
          tripId,
          version: clientVersion,
          status: DiaryStatus.Draft
        })
        .execute();
      if (!claim.affected) {
        const latest = await diaryRepo.findOneBy({ tripId });
        if (latest?.status === DiaryStatus.Published) {
          throw new AppException(ERROR_CODES.DIARY_PUBLISHED, '日记已发布，内容已冻结，不能再修改', 409);
        }
        throw new AppException(ERROR_CODES.VERSION_CONFLICT, '日记已有新版本，请刷新后再保存', 409);
      }

      let nextOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
      for (const item of paragraphInputs) {
        if (item.id == null) {
          await paragraphRepo.insert(
            paragraphRepo.create({
              diaryId: diary.id,
              tripId,
              authorId: userId,
              authorNickname: nickname,
              content: item.content.trim(),
              sortOrder: nextOrder++,
              locked: false
            })
          );
        } else {
          const update = await paragraphRepo.update(
            { id: Number(item.id), authorId: userId, locked: false },
            { content: item.content.trim() }
          );
          if (!update.affected) {
            throw new AppException(ERROR_CODES.PARAGRAPH_FORBIDDEN, '只能修改本人创建的段落，整次修改未提交', 403);
          }
        }
      }
    });

    return this.view(tripId, userId);
  }

  /**
   * 发布。仅行程发起人、且行程已结束可发布；
   * 发布时冻结标题、段落顺序与作者昵称（快照），重复发布幂等、只生效一次。
   */
  async publish(tripId: number, userId: number): Promise<DiaryView> {
    const { trip, role } = await this.access.requireViewer(tripId, userId);
    if (!role.isOwner) throw new AppException(ERROR_CODES.NOT_TRIP_OWNER, '只有发起人可以发布日记', 403);
    if (!this.access.isFinished(trip)) {
      throw new AppException(ERROR_CODES.TRIP_NOT_FINISHED, '行程结束后才能发布日记', 409);
    }
    await this.ensureDiary(tripId);

    await this.dataSource.transaction(async manager => {
      const diaryRepo = manager.getRepository(DiaryEntity);
      const paragraphRepo = manager.getRepository(DiaryParagraphEntity);
      const diary = await diaryRepo.findOneBy({ tripId });
      if (!diary) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '日记尚未初始化');
      // 重复发布只生效一次：已发布直接放行，不再改动任何数据
      if (diary.status === DiaryStatus.Published) return;

      // 第一步：条件更新抢占发布权，同时与并发的草稿保存互斥
      const claim = await diaryRepo
        .createQueryBuilder()
        .update(DiaryEntity)
        .set({ status: DiaryStatus.Published, version: diary.version + 1 })
        .where('trip_id = :tripId AND status = :status', { tripId, status: DiaryStatus.Draft })
        .execute();
      if (!claim.affected) {
        const latest = await diaryRepo.findOneBy({ tripId });
        if (latest?.status === DiaryStatus.Published) return; // 并发发布，幂等
        throw new AppException(ERROR_CODES.VERSION_CONFLICT, '发布时日记状态已变化，请刷新后重试', 409);
      }

      // 抢占成功后再读全部段落（此时新的草稿保存无法插入），生成冻结快照
      const paragraphs = await paragraphRepo.find({ where: { diaryId: diary.id }, order: { sortOrder: 'ASC', id: 'ASC' } });
      const publishedAt = new Date();
      const snapshot: PublishedSnapshot = {
        title: diary.title,
        publishedAt: publishedAt.toISOString(),
        paragraphs: paragraphs.map(p => ({
          id: p.id,
          authorId: p.authorId,
          authorNickname: p.authorNickname,
          content: p.content,
          sortOrder: p.sortOrder
        }))
      };
      await diaryRepo.update({ tripId }, { publishedAt, publishedSnapshot: snapshot });
    });

    return this.view(tripId, userId);
  }
}
