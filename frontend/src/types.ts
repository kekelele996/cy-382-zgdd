export interface AuthUser {
  id: number;
  nickname: string;
}

export interface Trip {
  id: number;
  ownerId: number;
  destination: string;
  departDate: string;
  days: number;
  budgetMin?: string | null;
  budgetMax?: string | null;
  transport: string;
  companionCount: number;
  status: string;
}

export interface MemberView {
  userId: number;
  nickname: string;
  role: 'OWNER' | 'MEMBER';
  status: string;
  joinedAt: string;
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

/** 后端标准错误响应体 */
export interface ApiErrorBody {
  success: false;
  code: string;
  message: string;
}
