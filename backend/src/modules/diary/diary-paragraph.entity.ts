import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 日记段落。authorId 在创建时写死，只有本人（且在队、段落未因离队冻结、日记未发布）能改。
 * sortOrder 由服务端在创建段落时分配（追加到尾部），发布后顺序冻结。
 */
@Entity('diary_paragraphs')
export class DiaryParagraphEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'diary_id' }) diaryId!: number;
  @Column({ name: 'trip_id' }) @Index() tripId!: number;
  @Column({ name: 'author_id' }) authorId!: number;
  @Column({ name: 'author_nickname', length: 80 }) authorNickname!: string;
  @Column({ type: 'text' }) content!: string;
  @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;
  /** 作者离队后置为 true，此后该段落永久只读 */
  @Column({ name: 'locked', type: 'tinyint', default: 0 }) locked!: boolean;
  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' }) updatedAt!: Date;
}
