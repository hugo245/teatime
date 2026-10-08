import { serverUrl } from './config';

export type PublicUser = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: string[];
  languages: string[];
  photoUrl: string | null;
  ageVerified: boolean;
  age: number | null;
};

export function normalizeUser<T extends Partial<PublicUser>>(raw: T): T & PublicUser {
  return {
    ...raw,
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: raw.location ?? '',
    about: raw.about ?? '',
    interests: Array.isArray(raw.interests) ? raw.interests : [],
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    photoUrl: raw.photoUrl ?? null,
    ageVerified: raw.ageVerified === true,
    age: typeof raw.age === 'number' ? raw.age : null,
  };
}

function normalizeFriends(data: FriendsPayload): FriendsPayload {
  return {
    friends: (data.friends ?? []).map((f) => ({
      ...normalizeUser(f),
      lastCallAt: f.lastCallAt ?? null,
      callCount: f.callCount ?? 0,
    })),
    requests: (data.requests ?? []).map((r) => ({ ...r, user: normalizeUser(r.user) })),
    recent: (data.recent ?? []).map((r) => ({ ...r, user: normalizeUser(r.user) })),
  };
}

function withUser<T extends { user: PublicUser }>(data: T): T {
  return { ...data, user: normalizeUser(data.user) };
}

export type Friend = PublicUser & {
  online: boolean;
  busy: boolean;
  lastSeen: number;
  since: number;
  lastCallAt: number | null;
  callCount: number;
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
  languages: string[];
  showAge: boolean;
};

export type LatestApp = { platform: 'ios' | 'android'; build: number; runtimeVersion: string; url: string };

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
  latestApp: (platform: string) =>
    request<{ latest: LatestApp | null }>(`/api/app/latest?platform=${platform}`, { auth: false }).then((d) => d.latest ?? null),
  register: (profile: ProfileInput & { deviceId: string }) =>
    request<{ token: string; user: PublicUser }>('/api/register', { method: 'POST', body: profile, auth: false }).then(withUser),
  me: () => request<{ user: PublicUser; showAge?: boolean }>('/api/me').then(withUser),
  updateMe: (patch: Partial<ProfileInput>) =>
    request<{ user: PublicUser; showAge?: boolean }>('/api/me', { method: 'PATCH', body: patch }).then(withUser),
  ageCheck: (birthYear: number, estimatedAge: number) =>
    request<{ verified: boolean; reason?: string; user: PublicUser }>('/api/me/age-check', {
      method: 'POST',
      body: { birthYear, estimatedAge, live: true },
    }).then(withUser),
  user: (id: string) => request<{ user: PublicUser }>(`/api/users/${id}`).then(withUser),
  uploadPhoto: (base64: string) => request<{ user: PublicUser }>('/api/me/photo', { method: 'PUT', body: { data: base64 } }).then(withUser),
  deletePhoto: () => request<{ user: PublicUser }>('/api/me/photo', { method: 'DELETE' }).then(withUser),
  deleteMe: () => request<{ ok: true }>('/api/me', { method: 'DELETE' }),
  friends: () => request<FriendsPayload>('/api/friends').then(normalizeFriends),
  addFriend: (id: string) => request<{ status: 'requested' | 'friends' }>(`/api/friends/${id}`, { method: 'POST' }),
  removeFriend: (id: string) => request<{ status: 'none' }>(`/api/friends/${id}`, { method: 'DELETE' }),
  blocked: () => request<{ blocked: PublicUser[] }>('/api/blocks').then((d) => ({ blocked: (d.blocked ?? []).map(normalizeUser) })),
  block: (id: string) => request<{ ok: true }>(`/api/blocks/${id}`, { method: 'POST' }),
  unblock: (id: string) => request<{ ok: true }>(`/api/blocks/${id}`, { method: 'DELETE' }),
  report: (userId: string, reason: ReportReason) => request<{ ok: true }>('/api/reports', { method: 'POST', body: { userId, reason } }),
};
