export interface ParagraphInput {
  id?: number;
  content: string;
}

export interface SaveDraftInput {
  /** 客户端上次保存后看到的版本号，过期则整次修改被拒绝 */
  version: number;
  title?: string;
  paragraphs?: ParagraphInput[];
}

export interface ParagraphView {
  id: number;
  authorId: number;
  authorNickname: string;
  content: string;
  sortOrder: number;
  locked: boolean;
  editable: boolean;
}

export interface DiaryView {
  tripId: number;
  status: string;
  version: number;
  title: string;
  publishedAt: string | null;
  frozen: boolean;
  canEdit: boolean;
  canPublish: boolean;
  paragraphs: ParagraphView[];
}
