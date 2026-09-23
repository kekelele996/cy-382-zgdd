import { DiaryStatus } from '../../constants/status';
import { DiaryEntity } from './diary.entity';
import { DiaryParagraphEntity } from './diary-paragraph.entity';

export interface DiaryParagraphView {
  id: number;
  authorId: number;
  authorNickname: string;
  content: string;
  seq: number;
}

export interface DiaryView {
  id: number;
  tripId: number;
  title: string;
  version: number;
  status: DiaryStatus;
  publishedTitle: string | null;
  publishedAt: Date | null;
  paragraphs: DiaryParagraphView[];
}

/** 实体转对外结构：发布后标题以冻结快照为准，段落按冻结顺序返回 */
export function serializeDiary(diary: DiaryEntity, paragraphs: DiaryParagraphEntity[]): DiaryView {
  const ordered = [...paragraphs].sort((a, b) => a.seq - b.seq);
  return {
    id: diary.id,
    tripId: diary.tripId,
    title: diary.status === DiaryStatus.Published && diary.publishedTitle ? diary.publishedTitle : diary.title,
    version: diary.version,
    status: diary.status,
    publishedTitle: diary.publishedTitle,
    publishedAt: diary.publishedAt,
    paragraphs: ordered.map(item => ({
      id: item.id,
      authorId: item.authorId,
      authorNickname: item.authorNickname,
      content: item.content,
      seq: item.seq
    }))
  };
}
