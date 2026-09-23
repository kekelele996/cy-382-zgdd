import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DiaryEntity } from './diary.entity';

@Entity('diary_paragraphs')
@Index('idx_paragraph_diary_seq', ['diaryId', 'seq'])
export class DiaryParagraphEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'diary_id' }) diaryId!: number;
  /** 段落作者：行程成员只能改本人创建的段落 */
  @Column({ name: 'author_id' }) authorId!: number;
  /** 草稿期作者昵称（跟随当前昵称），发布时冻结 */
  @Column({ name: 'author_nickname' }) authorNickname!: string;
  @Column({ type: 'text' }) content!: string;
  /** 段落顺序：发布时冻结顺序 */
  @Column({ type: 'int' }) seq!: number;

  @ManyToOne(() => DiaryEntity, diary => diary.paragraphs, { onDelete: 'CASCADE' })
  diary!: DiaryEntity;
}
