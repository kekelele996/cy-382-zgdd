import { api } from '../../api';

export const DiaryStatus = { Draft: 'DRAFT', Published: 'PUBLISHED' } as const;
export type DiaryStatus = (typeof DiaryStatus)[keyof typeof DiaryStatus];

export const MemberStatus = { Active: 'ACTIVE', Left: 'LEFT' } as const;

export interface DiaryParagraph {
  id: number;
  authorId: number;
  authorNickname: string;
  content: string;
  seq: number;
}

export interface DiaryPermissions {
  active: boolean;
  isOwner: boolean;
  finished: boolean;
  canEdit: boolean;
  canPublish: boolean;
}

export interface Diary {
  id: number;
  tripId: number;
  title: string;
  version: number;
  status: DiaryStatus;
  publishedTitle: string | null;
  publishedAt: string | null;
  paragraphs: DiaryParagraph[];
  permissions: DiaryPermissions;
}

export interface TripInfo {
  id: number;
  ownerId: number;
  destination: string;
  departDate: string;
  days: number;
  status: string;
  finished: boolean;
  memberCount: number;
}

export interface TripMember {
  id: number;
  tripId: number;
  userId: number;
  joinedNickname: string;
  status: (typeof MemberStatus)[keyof typeof MemberStatus];
}

export interface ParagraphInput {
  existingId?: number;
  content: string;
}

export interface SaveDraftPayload {
  version: number;
  title?: string;
  paragraphs?: ParagraphInput[];
  deleteParagraphIds?: number[];
}

export const diaryApi = {
  get: (tripId: number) => api<Diary>(`/api/trips/${tripId}/diary`),
  saveDraft: (tripId: number, payload: SaveDraftPayload) =>
    api<Diary>(`/api/trips/${tripId}/diary`, { method: 'PUT', body: JSON.stringify(payload) }),
  reorder: (tripId: number, version: number, paragraphIds: number[]) =>
    api<Diary>(`/api/trips/${tripId}/diary/reorder`, { method: 'POST', body: JSON.stringify({ version, paragraphIds }) }),
  publish: (tripId: number) => api<Diary>(`/api/trips/${tripId}/diary/publish`, { method: 'POST', body: '{}' })
};

export const tripApi = {
  detail: (tripId: number) => api<TripInfo>(`/api/trips/${tripId}`),
  members: (tripId: number) => api<TripMember[]>(`/api/trips/${tripId}/members`),
  finish: (tripId: number) => api<TripInfo>(`/api/trips/${tripId}/finish`, { method: 'PATCH' }),
  join: (tripId: number) => api<TripMember>(`/api/trips/${tripId}/members`, { method: 'POST' }),
  leave: (tripId: number) => api<TripMember>(`/api/trips/${tripId}/members/me`, { method: 'DELETE' })
};
