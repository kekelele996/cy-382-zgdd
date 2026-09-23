const TOKEN_KEY = 'tripmatch_token';
const USER_KEY = 'tripmatch_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string, user: { id: number; nickname: string }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getSavedUser(): { id: number; nickname: string } | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as { id: number; nickname: string }) : null;
}

export interface ApiErrorBody {
  success: false;
  code: string;
  message: string;
  data?: unknown;
}

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body ?? { success: false, code: 'NETWORK_ERROR', message: `请求失败 ${response.status}` });
  }
  return body as T;
}

export interface AuthResponse {
  token: string;
  user: { id: number; nickname: string };
}

export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResponse>('/api/users/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, nickname: string, password: string) =>
    api<AuthResponse>('/api/users/register', { method: 'POST', body: JSON.stringify({ email, nickname, password }) })
};
