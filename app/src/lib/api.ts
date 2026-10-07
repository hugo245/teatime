import { serverUrl } from './config';

export type PublicUser = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: string[];
  photoUrl: string | null;
};

export type Friend = PublicUser & {
  online: boolean;
  busy: boolean;
  lastSeen: number;
  since: number;
};

export type FriendRequest = { user: PublicUser; createdAt: number };
export type RecentPerson = { user: PublicUser; metAt: number; requested: boolean };

export type FriendsPayload = {
  friends: Friend[];
  requests: FriendRequest[];
  recent: RecentPerson[];
};

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

export type ProfileInput = {
  name: string;
  location: string;
  about: string;
  interests: string[];
};

export type ReportReason = 'rude' | 'inappropriate' | 'money' | 'fake' | 'other';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public field?: string,
  ) {
    super(message);
  }
}

type AuthFailureListener = (code: 'unauthorized' | 'banned') => void;

let token: string | null = null;
let onAuthFailure: AuthFailureListener | null = null;

export function setApiToken(value: string | null) {
  token = value;
}

export function setAuthFailureListener(listener: AuthFailureListener | null) {
  onAuthFailure = listener;
}

const OFFLINE_MESSAGE = 'We could not connect to TeaTime. Please check your internet connection and try again.';

async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const base = serverUrl();
  if (!base) throw new ApiError(OFFLINE_MESSAGE, 0, 'offline');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth !== false && token) headers.authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0, 'offline');
  } finally {
    clearTimeout(timer);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok) {
    const code = typeof data.code === 'string' ? data.code : undefined;
    if (options.auth !== false && (code === 'unauthorized' || code === 'banned')) onAuthFailure?.(code);
    const message = typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status, code, typeof data.field === 'string' ? data.field : undefined);
  }
  return data as T;
}

export const api = {
  config: () => request<{ iceServers: IceServer[]; online: number; supportEmail: string }>('/api/config', { auth: false }),
  register: (profile: ProfileInput & { deviceId: string }) =>
    request<{ token: string; user: PublicUser }>('/api/register', { method: 'POST', body: profile, auth: false }),
  me: () => request<{ user: PublicUser }>('/api/me'),
  updateMe: (patch: Partial<ProfileInput>) => request<{ user: PublicUser }>('/api/me', { method: 'PATCH', body: patch }),
  uploadPhoto: (base64: string) => request<{ user: PublicUser }>('/api/me/photo', { method: 'PUT', body: { data: base64 } }),
  deletePhoto: () => request<{ user: PublicUser }>('/api/me/photo', { method: 'DELETE' }),
  deleteMe: () => request<{ ok: true }>('/api/me', { method: 'DELETE' }),
  friends: () => request<FriendsPayload>('/api/friends'),
  addFriend: (id: string) => request<{ status: 'requested' | 'friends' }>(`/api/friends/${id}`, { method: 'POST' }),
  removeFriend: (id: string) => request<{ status: 'none' }>(`/api/friends/${id}`, { method: 'DELETE' }),
  blocked: () => request<{ blocked: PublicUser[] }>('/api/blocks'),
  block: (id: string) => request<{ ok: true }>(`/api/blocks/${id}`, { method: 'POST' }),
  unblock: (id: string) => request<{ ok: true }>(`/api/blocks/${id}`, { method: 'DELETE' }),
  report: (userId: string, reason: ReportReason) => request<{ ok: true }>('/api/reports', { method: 'POST', body: { userId, reason } }),
};
