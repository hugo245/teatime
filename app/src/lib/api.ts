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

export type ChatMessage = {
  id: number;
  from: string;
  to: string;
  kind: 'text' | 'missed-call' | 'voice' | 'plan';
  text: string;
  createdAt: number;
  readAt: number | null;
  voice?: { url: string; seconds: number };
  plan?: { at: number; cancelled: boolean };
};

export type Notice = { id: number; kind: string; title: string; body: string; createdAt: number };

export type ChatSummary = {
  user: PublicUser;
  last: ChatMessage;
  unread: number;
  friend: boolean;
  online: boolean;
};

export type TeaEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  going: number;
  attending: boolean;
  people: { id: string; name: string; photoUrl: string | null }[];
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
  config: () => request<{ iceServers: IceServer[]; online: number; supportEmail: string; ageTestSkip?: boolean }>('/api/config', { auth: false }),
  latestApp: (platform: string) =>
    request<{ latest: LatestApp | null }>(`/api/app/latest?platform=${platform}`, { auth: false }).then((d) => d.latest ?? null),
  register: (profile: ProfileInput & { deviceId: string }) =>
    request<{ token: string; user: PublicUser }>('/api/register', { method: 'POST', body: profile, auth: false }).then(withUser),
  me: () => request<{ user: PublicUser; showAge?: boolean }>('/api/me').then(withUser),
  updateMe: (patch: Partial<ProfileInput>) =>
    request<{ user: PublicUser; showAge?: boolean }>('/api/me', { method: 'PATCH', body: patch }).then(withUser),
  ageCheck: (birthYear: number, estimatedAge: number, test = false) =>
    request<{ verified: boolean; reason?: string; estimatedAge?: number; user: PublicUser }>('/api/me/age-check', {
      method: 'POST',
      body: test ? { birthYear, test: true } : { birthYear, estimatedAge, live: true },
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
  chats: () =>
    request<{ chats: ChatSummary[]; unread: number }>('/api/chats').then((d) => ({
      unread: d.unread ?? 0,
      chats: (d.chats ?? []).map((c) => ({ ...c, user: normalizeUser(c.user) })),
    })),
  chat: (userId: string, before?: number) =>
    request<{ user: PublicUser; friend: boolean; messages: ChatMessage[] }>(`/api/chats/${userId}${before ? `?before=${before}` : ''}`).then(withUser),
  sendMessage: (userId: string, text: string) =>
    request<{ message: ChatMessage }>(`/api/chats/${userId}`, { method: 'POST', body: { text } }),
  markRead: (userId: string) => request<{ ok: true }>(`/api/chats/${userId}/read`, { method: 'POST' }),
  savePushToken: (platform: 'android' | 'ios', token: string) =>
    request<{ ok: true; enabled: boolean }>('/api/me/push', { method: 'PUT', body: { platform, token } }),
  events: () => request<{ events: TeaEvent[] }>('/api/events').then((d) => d.events ?? []),
  attend: (eventId: string, attending: boolean) =>
    request<{ event: TeaEvent | null }>(`/api/events/${eventId}/attend`, { method: attending ? 'POST' : 'DELETE' }).then((d) => d.event),
  report: (userId: string, reason: ReportReason, source: 'call' | 'chat' | 'profile' = 'call') =>
    request<{ ok: true }>('/api/reports', { method: 'POST', body: { userId, reason, source } }),
  sendVoice: (userId: string, data: string, seconds: number, type: string) =>
    request<{ message: ChatMessage }>(`/api/chats/${userId}/voice`, { method: 'POST', body: { data, seconds, type } }),
  planCall: (userId: string, at: number) => request<{ message: ChatMessage }>(`/api/chats/${userId}/plan`, { method: 'POST', body: { at } }),
  cancelPlan: (messageId: number) => request<{ message: ChatMessage }>(`/api/plans/${messageId}/cancel`, { method: 'POST' }),
  plans: () =>
    request<{ plans: { message: ChatMessage; user: PublicUser }[] }>('/api/plans').then((d) =>
      (d.plans ?? []).map((p) => ({ ...p, user: normalizeUser(p.user) })),
    ),
  seenNotices: (ids: number[]) => request<{ ok: true }>('/api/notices/seen', { method: 'POST', body: { ids } }),
};
