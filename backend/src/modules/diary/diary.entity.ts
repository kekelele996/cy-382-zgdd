import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DiaryStatus } from '../../constants/status';

/**
 * 每个行程至多一份日记。version 为草稿乐观锁版本号，
 * 每次保存草稿 / 发布成功后递增；publishedSnapshot 冻结发布时刻的标题、段落顺序与昵称。
 */
@Entity('diaries')
export class DiaryEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id', unique: true }) tripId!: number;
  @Column({ length: 160, default: '' }) title!: string;
  @Column({ name: 'version', default: 0 }) version!: number;
  @Column({ name: 'status', length: 20, default: DiaryStatus.Draft }) status!: string;
  @Column({ name: 'published_at', type: 'datetime', nullable: true }) publishedAt?: Date | null;
  @Column({ name: 'published_snapshot', type: 'simple-json', nullable: true }) publishedSnapshot?: PublishedSnapshot | null;
}

export interface PublishedSnapshot {
  title: string;
  publishedAt: string;
  paragraphs: Array<{ id: number; authorId: number; authorNickname: string; content: string; sortOrder: number }>;
}
