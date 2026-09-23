/** 单段落提交项：existingId 存在表示更新本人已有段落，否则为新建段落 */
export interface ParagraphInput {
  existingId?: number;
  content: string;
}

/** 保存草稿请求：必须携带上次读到的版本号 */
export interface SaveDraftInput {
  version: number;
  title?: string;
  paragraphs?: ParagraphInput[];
  /** 要删除的段落（必须为本人创建） */
  deleteParagraphIds?: number[];
}

/** 调整段落顺序请求：提交完整段落 id 顺序，他人段落相对顺序不能变 */
export interface ReorderInput {
  version: number;
  paragraphIds: number[];
}
