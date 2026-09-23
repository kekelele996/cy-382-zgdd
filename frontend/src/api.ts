import type { ApiErrorBody, AuthUser, DiaryView, MemberView, Trip } from './types';

const TOKEN_KEY = 'tripmatch_token';
const USER_KEY = 'tripmatch_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* 忽略非 JSON 错误 */
    }
    throw new ApiError(body?.code ?? 'REQUEST_FAILED', body?.message ?? `请求失败 ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export const authApi = {
  register: (email: string, nickname: string, password: string) =>
    api<AuthUser>('/users/register', { method: 'POST', body: JSON.stringify({ email, nickname, password }) }),
  login: (email: string, password: string) =>
    api<LoginResult>('/users/login', { method: 'POST', body: JSON.stringify({ email, password }) })
};

export const tripApi = {
  list: () => api<Trip[]>('/trips'),
  create: (input: Record<string, unknown>) =>
    api<Trip>('/trips', { method: 'POST', body: JSON.stringify(input) }),
  join: (tripId: number) => api<{ joined: boolean }>(`/trips/${tripId}/join`, { method: 'POST' }),
  leave: (tripId: number) => api<{ left: boolean }>(`/trips/${tripId}/leave`, { method: 'POST' }),
  finish: (tripId: number) => api<{ status: string }>(`/trips/${tripId}/finish`, { method: 'POST' }),
  members: (tripId: number) => api<{ ownerId: number; members: MemberView[] }>(`/trips/${tripId}/members`)
};

export interface SaveDraftPayload {
  version: number;
  title?: string;
  paragraphs?: Array<{ id?: number; content: string }>;
}

export const diaryApi = {
  view: (tripId: number) => api<DiaryView>(`/trips/${tripId}/diary`),
  saveDraft: (tripId: number, payload: SaveDraftPayload) =>
    api<DiaryView>(`/trips/${tripId}/diary/draft`, { method: 'POST', body: JSON.stringify(payload) }),
  publish: (tripId: number) => api<DiaryView>(`/trips/${tripId}/diary/publish`, { method: 'POST' })
};
