import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { DiaryStatus } from '../../constants/status';
import { DiaryParagraphEntity } from './diary-paragraph.entity';

@Entity('diaries')
export class DiaryEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id', unique: true }) tripId!: number;
  /** 草稿标题（可随草稿修改） */
  @Column() title!: string;
  /** 当前版本号：每次保存/发布递增，作为乐观锁依据 */
  @Column({ type: 'int', default: 1 }) version!: number;
  @Column({ type: 'varchar', length: 20, default: DiaryStatus.Draft }) status!: DiaryStatus;
  /** 发布时冻结的标题快照 */
  @Column({ name: 'published_title', nullable: true }) publishedTitle!: string | null;
  @Column({ name: 'published_by', nullable: true }) publishedBy!: number | null;
  @Column({ name: 'published_at', type: 'datetime', nullable: true }) publishedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;

  @OneToMany(() => DiaryParagraphEntity, paragraph => paragraph.diary, { cascade: false })
  paragraphs!: DiaryParagraphEntity[];
}
