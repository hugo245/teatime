import { Hub, type HubOptions, type HubSocket } from './hub.js';
import { privacyPage, termsPage } from './pages.js';
import { RateLimiter } from './rateLimit.js';
import { Store, toPublicUser, type User } from './store.js';
import { createFcmPusher, type PushMessage } from './push.js';
import { createUpdates, type UpdatesOptions } from './updates.js';
import {
  ValidationError,
  checkAgeEstimate,
  parseAbout,
  parseBirthYear,
  parseDeviceId,
  parseInterests,
  parseJpeg,
  parseLanguages,
  parseEventInput,
  parseLocation,
  parseMessageText,
  parseName,
  parseReportReason,
} from './validation.js';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type ApiOptions = {
  iceServers: IceServer[];
  adminToken?: string;
  supportEmail: string;
  autoBanReporters?: number;
  registerLimitPerHour?: number;
  log?: (message: string, extra?: Record<string, unknown>) => void;
  hub?: HubOptions;
  updates?: UpdatesOptions;
  ageTestSkip?: boolean;
  firebaseServiceAccount?: string;
};

export type Api = {
  store: Store;
  hub: Hub;
  handle(request: Request, ip: string): Promise<Response | null>;
  openSocket(socket: HubSocket): { onMessage(data: string): void; onClose(): void };
  close(): void;
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'x-content-type-options': 'nosniff',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function html(body: string) {
  return new Response(body, {
    status: 200,
    headers: { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

function isLoopback(ip: string) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function createApi(store: Store, options: ApiOptions): Api {
  const log = options.log ?? (() => {});
  const hub = new Hub(store, options.hub);
  const updates = createUpdates(options.updates);
  const pusher = createFcmPusher(options.firebaseServiceAccount, log);

  function sendPush(userId: string, message: PushMessage) {
    const target = store.pushToken(userId);
    if (!pusher || !target || target.platform !== 'android') return;
    void pusher.send(target.token, message).then((result) => {
      if (result === 'invalid-token') store.removePushToken(userId, target.token);
    });
  }

  hub.onPush = sendPush;

  function chatPartner(me: User, otherId: string) {
    const other = store.getUser(otherId);
    if (!other || other.banned || other.id === me.id || store.isBlockedEither(me.id, other.id)) {
      throw new HttpError(404, 'Not found', 'not-found');
    }
    return other;
  }
  const registerLimiter = new RateLimiter(options.registerLimitPerHour ?? 20, 60 * 60 * 1000);
  const friendLimiter = new RateLimiter(60, 60 * 60 * 1000);
  const reportLimiter = new RateLimiter(20, 60 * 60 * 1000);
  const photoLimiter = new RateLimiter(30, 60 * 60 * 1000);
  const autoBanReporters = options.autoBanReporters ?? 3;

  function authenticate(request: Request): User {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Please sign in again.', 'unauthorized');
    const user = store.getUserByToken(token);
    if (!user) throw new HttpError(401, 'Please sign in again.', 'unauthorized');
    if (user.banned) throw new HttpError(403, 'This account has been removed for breaking the community rules.', 'banned');
    return user;
  }

  function requireAdmin(request: Request) {
    if (!options.adminToken || request.headers.get('authorization') !== `Bearer ${options.adminToken}`) {
      throw new HttpError(401, 'Unauthorized', 'unauthorized');
    }
  }

  async function readJson(request: Request, limit = 16 * 1024): Promise<Record<string, unknown>> {
    const text = await request.text();
    if (text.length > limit) throw new HttpError(413, 'Request is too large.', 'too-large');
    if (!text) return {};
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' ? value : {};
    } catch {
      throw new HttpError(400, 'Invalid request.', 'bad-json');
    }
  }

  function friendsPayload(user: User) {
    const friendIds = new Set<string>();
    const friends = store.friends(user.id).map(({ user: friend, since, lastCallAt, callCount }) => {
      friendIds.add(friend.id);
      return {
        ...toPublicUser(friend),
        online: hub.isOnline(friend.id),
        busy: hub.isInCall(friend.id),
        lastSeen: friend.lastSeen,
        since,
        lastCallAt,
        callCount,
      };
    });
    const requests = store.incomingRequests(user.id).map(({ user: from, createdAt }) => ({
      user: toPublicUser(from),
      createdAt,
    }));
    const incomingIds = new Set(requests.map((r) => r.user.id));
    const outgoing = store.outgoingRequestIds(user.id);
    const recent = store
      .recentPartners(user.id, Date.now() - WEEK, 12)
      .filter(({ user: other }) => !friendIds.has(other.id) && !incomingIds.has(other.id) && !store.isBlockedEither(user.id, other.id))
      .map(({ user: other, metAt }) => ({
        user: toPublicUser(other),
        metAt,
        requested: outgoing.has(other.id),
      }));
    return { friends, requests, recent };
  }

  async function route(request: Request, ip: string): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/health') return json(200, { ok: true, online: hub.onlineCount });
    if (path === '/privacy') return html(privacyPage(options.supportEmail));
    if (path === '/terms') return html(termsPage(options.supportEmail));

    if (path === '/api/config' && method === 'GET') {
      return json(200, { iceServers: options.iceServers, online: hub.onlineCount, supportEmail: options.supportEmail, ageCheck: true, ageTestSkip: !!options.ageTestSkip, push: !!pusher });
    }

    if (path === '/api/updates/manifest' && method === 'GET') return updates.manifest(request);

    if (path === '/api/app/latest' && method === 'GET') {
      return json(200, { latest: await updates.latest(url.searchParams.get('platform')) });
    }

    if (path === '/api/register' && method === 'POST') {
      if (!isLoopback(ip) && !registerLimiter.allow(ip)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
      const body = await readJson(request);
      const deviceId = parseDeviceId(body.deviceId);
      if (deviceId && store.isDeviceBanned(deviceId)) {
        throw new HttpError(403, 'TeaTime is not available on this phone.', 'banned');
      }
      const profile = {
        name: parseName(body.name),
        location: parseLocation(body.location),
        about: parseAbout(body.about),
        interests: parseInterests(body.interests),
        languages: parseLanguages(body.languages),
        showAge: body.showAge !== false,
      };
      const { user, token } = store.createUser(profile, deviceId);
      log('user registered', { userId: user.id });
      return json(201, { token, user: toPublicUser(user) });
    }

    if (path === '/api/me') {
      const user = authenticate(request);
      if (method === 'GET') return json(200, { user: toPublicUser(user), showAge: user.showAge });
      if (method === 'PATCH') {
        const body = await readJson(request);
        const update: Parameters<Store['updateProfile']>[1] = {};
        if ('name' in body) update.name = parseName(body.name);
        if ('location' in body) update.location = parseLocation(body.location);
        if ('about' in body) update.about = parseAbout(body.about);
        if ('interests' in body) update.interests = parseInterests(body.interests);
        if ('languages' in body) update.languages = parseLanguages(body.languages);
        if ('showAge' in body) update.showAge = body.showAge !== false;
        const updated = store.updateProfile(user.id, update)!;
        return json(200, { user: toPublicUser(updated), showAge: updated.showAge });
      }
      if (method === 'DELETE') {
        hub.disconnectUser(user.id, 4001, 'deleted');
        const friendIds = store.friendIds(user.id);
        store.deleteUser(user.id);
        for (const id of friendIds) hub.notifyFriendsChanged(id);
        log('user deleted', { userId: user.id });
        return json(200, { ok: true });
      }
    }

    if (path === '/api/me/photo') {
      const user = authenticate(request);
      if (method === 'PUT') {
        if (!photoLimiter.allow(user.id)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
        const body = await readJson(request, 1024 * 1024);
        const updated = store.setPhoto(user.id, parseJpeg(body.data))!;
        return json(200, { user: toPublicUser(updated) });
      }
      if (method === 'DELETE') {
        const updated = store.deletePhoto(user.id)!;
        return json(200, { user: toPublicUser(updated) });
      }
    }

    if (path === '/api/me/age-check' && method === 'POST') {
      const user = authenticate(request);
      if (store.countVerifications(user.id, Date.now() - DAY) >= 12) {
        throw new HttpError(429, 'You have tried a few times today. Please try again tomorrow.', 'rate-limited');
      }
      const body = await readJson(request);
      const birthYear = parseBirthYear(body.birthYear);
      const claimedAge = new Date().getUTCFullYear() - birthYear;
      const testSkip = body.test === true;
      if (testSkip && !options.ageTestSkip) throw new HttpError(403, 'Testing is turned off.', 'test-off');
      if (!testSkip && body.live !== true) throw new HttpError(400, 'Please use the live camera check.', 'not-live');
      const estimatedAge = testSkip ? claimedAge : Number(body.estimatedAge);
      const result = checkAgeEstimate(claimedAge, estimatedAge);
      const id = crypto.randomUUID();
      store.createVerification(id, user.id, 'face', '');
      store.updateVerification(id, result.ok ? 'verified' : 'failed', `${birthYear}-01-01`, JSON.stringify({ claimedAge, estimatedAge }));
      log('age check', { userId: user.id, claimedAge, estimatedAge: Math.round(estimatedAge), ok: result.ok, test: testSkip });
      if (!result.ok) {
        return json(200, { verified: false, reason: result.reason, estimatedAge: Math.round(estimatedAge), user: toPublicUser(user) });
      }
      const updated = store.setAgeVerified(user.id, `${birthYear}-01-01`)!;
      hub.notifyFriendsChanged(user.id);
      return json(200, { verified: true, user: toPublicUser(updated) });
    }

    if (path === '/api/me/push' && method === 'PUT') {
      const user = authenticate(request);
      const body = await readJson(request);
      const platform = body.platform === 'android' || body.platform === 'ios' ? body.platform : null;
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (!platform || token.length < 10 || token.length > 4096) throw new HttpError(400, 'Invalid push token.', 'invalid');
      store.setPushToken(user.id, platform, token);
      return json(200, { ok: true, enabled: !!pusher && platform === 'android' });
    }

    if (path === '/api/me/push' && method === 'DELETE') {
      const user = authenticate(request);
      store.removePushToken(user.id);
      return json(200, { ok: true });
    }

    if (path === '/api/chats' && method === 'GET') {
      const me = authenticate(request);
      const friendIds = new Set(store.friendIds(me.id));
      const chats = [];
      let unread = 0;
      for (const convo of store.conversations(me.id)) {
        const other = store.getUser(convo.otherId);
        if (!other || other.banned || store.isBlockedEither(me.id, other.id)) continue;
        unread += convo.unread;
        chats.push({
          user: toPublicUser(other),
          last: convo.last,
          unread: convo.unread,
          friend: friendIds.has(other.id),
          online: hub.isOnline(other.id),
        });
      }
      return json(200, { chats, unread });
    }

    const chatReadMatch = path.match(/^\/api\/chats\/([0-9a-f-]{36})\/read$/);
    if (chatReadMatch && method === 'POST') {
      const me = authenticate(request);
      const other = chatPartner(me, chatReadMatch[1]!);
      const at = store.markRead(me.id, other.id);
      hub.send(other.id, { type: 'chat.read', userId: me.id, at });
      return json(200, { ok: true });
    }

    const chatMatch = path.match(/^\/api\/chats\/([0-9a-f-]{36})$/);
    if (chatMatch && method === 'GET') {
      const me = authenticate(request);
      const other = chatPartner(me, chatMatch[1]!);
      const before = Number(url.searchParams.get('before')) || null;
      return json(200, {
        user: toPublicUser(other),
        friend: store.areFriends(me.id, other.id),
        messages: store.conversation(me.id, other.id, before, 60),
      });
    }

    if (chatMatch && method === 'POST') {
      const me = authenticate(request);
      const other = chatPartner(me, chatMatch[1]!);
      if (!store.areFriends(me.id, other.id)) throw new HttpError(403, 'You can only send messages to your friends.', 'not-friends');
      if (store.messagesSentSince(me.id, Date.now() - 60_000) >= 20) {
        throw new HttpError(429, 'Please wait a little before sending more messages.', 'rate-limited');
      }
      const body = await readJson(request);
      const message = store.addMessage(me.id, other.id, 'text', parseMessageText(body.text));
      hub.send(other.id, { type: 'chat.message', message, user: toPublicUser(me) });
      if (!hub.isOnline(other.id)) {
        sendPush(other.id, {
          title: me.name,
          body: message.text.length > 140 ? `${message.text.slice(0, 137)}...` : message.text,
          channel: 'messages',
          tag: `chat-${me.id}`,
          data: { type: 'message', userId: me.id },
        });
      }
      return json(201, { message });
    }

    if (path === '/api/events' && method === 'GET') {
      const me = authenticate(request);
      return json(200, { events: store.events(me.id) });
    }

    const attendMatch = path.match(/^\/api\/events\/([0-9a-f-]{36})\/attend$/);
    if (attendMatch && (method === 'POST' || method === 'DELETE')) {
      const me = authenticate(request);
      if (!store.eventExists(attendMatch[1]!)) throw new HttpError(404, 'This event is no longer available.', 'not-found');
      store.setAttending(attendMatch[1]!, me.id, method === 'POST');
      const event = store.events(me.id).find((e) => e.id === attendMatch[1]);
      return json(200, { event: event ?? null });
    }

    const photoMatch = path.match(/^\/api\/users\/([0-9a-f-]{36})\/photo$/);
    if (photoMatch && (method === 'GET' || method === 'HEAD')) {
      const owner = store.getUser(photoMatch[1]!);
      const photo = owner && !owner.banned ? store.getPhoto(owner.id) : null;
      if (!photo) throw new HttpError(404, 'Not found', 'not-found');
      return new Response(method === 'HEAD' ? null : (photo as Uint8Array<ArrayBuffer>), {
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'image/jpeg',
          'cache-control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
        },
      });
    }

    const userMatch = path.match(/^\/api\/users\/([0-9a-f-]{36})$/);
    if (userMatch && method === 'GET') {
      const me = authenticate(request);
      const other = store.getUser(userMatch[1]!);
      if (!other || other.banned || store.isBlockedEither(me.id, other.id) || !store.haveMet(me.id, other.id)) {
        throw new HttpError(404, 'This person is not available.', 'not-found');
      }
      return json(200, { user: toPublicUser(other) });
    }

    if (path === '/api/friends' && method === 'GET') {
      const user = authenticate(request);
      return json(200, friendsPayload(user));
    }

    const friendMatch = path.match(/^\/api\/friends\/([0-9a-f-]{36})$/);
    if (friendMatch) {
      const user = authenticate(request);
      const otherId = friendMatch[1]!;
      if (otherId === user.id) throw new HttpError(400, 'That is you!', 'self');
      if (method === 'POST') {
        if (!friendLimiter.allow(user.id)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
        const other = store.getUser(otherId);
        if (!other || other.banned) throw new HttpError(404, 'This person is no longer on TeaTime.', 'not-found');
        if (store.isBlockedEither(user.id, otherId)) throw new HttpError(403, 'You cannot add this person.', 'blocked');
        if (store.areFriends(user.id, otherId)) return json(200, { status: 'friends' });
        if (!store.haveMet(user.id, otherId)) throw new HttpError(403, 'You can only add people you have talked with.', 'not-met');
        if (store.hasFriendRequest(otherId, user.id)) {
          store.addFriendship(user.id, otherId);
          hub.send(otherId, { type: 'friend.added', user: toPublicUser(user) });
          hub.send(user.id, { type: 'friend.added', user: toPublicUser(other) });
          return json(200, { status: 'friends' });
        }
        if (!store.hasFriendRequest(user.id, otherId)) {
          store.addFriendRequest(user.id, otherId);
          hub.send(otherId, { type: 'friend.request', user: toPublicUser(user) });
        }
        return json(200, { status: 'requested' });
      }
      if (method === 'DELETE') {
        store.removeFriendship(user.id, otherId);
        hub.notifyFriendsChanged(otherId);
        return json(200, { status: 'none' });
      }
    }

    if (path === '/api/blocks' && method === 'GET') {
      const user = authenticate(request);
      return json(200, { blocked: store.blockedUsers(user.id).map(toPublicUser) });
    }

    const blockMatch = path.match(/^\/api\/blocks\/([0-9a-f-]{36})$/);
    if (blockMatch) {
      const user = authenticate(request);
      const otherId = blockMatch[1]!;
      if (otherId === user.id) throw new HttpError(400, 'That is you!', 'self');
      if (method === 'POST') {
        if (!store.getUser(otherId)) throw new HttpError(404, 'Not found', 'not-found');
        store.block(user.id, otherId);
        hub.endCallBetween(user.id, otherId);
        hub.notifyFriendsChanged(otherId);
        return json(200, { ok: true });
      }
      if (method === 'DELETE') {
        store.unblock(user.id, otherId);
        return json(200, { ok: true });
      }
    }

    if (path === '/api/reports' && method === 'POST') {
      const user = authenticate(request);
      if (!reportLimiter.allow(user.id)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
      const body = await readJson(request);
      const reportedId = String(body.userId ?? '');
      const reported = store.getUser(reportedId);
      if (!reported || reported.id === user.id) throw new HttpError(404, 'Not found', 'not-found');
      const reason = parseReportReason(body.reason);
      const details = typeof body.details === 'string' ? body.details.slice(0, 500) : '';
      store.addReport(user.id, reported.id, reason, details);
      store.block(user.id, reported.id);
      hub.endCallBetween(user.id, reported.id);
      hub.notifyFriendsChanged(reported.id);
      log('report received', { reporterId: user.id, reportedId: reported.id, reason });
      if (store.distinctReporters(reported.id, Date.now() - WEEK) >= autoBanReporters) {
        store.setBanned(reported.id, true);
        hub.disconnectUser(reported.id, 4003, 'banned');
        log('user auto banned', { userId: reported.id });
      }
      return json(201, { ok: true });
    }

    if (path === '/admin/reports' && method === 'GET') {
      requireAdmin(request);
      return json(200, { reports: store.openReports() });
    }

    const resolveMatch = path.match(/^\/admin\/reports\/(\d+)\/resolve$/);
    if (resolveMatch && method === 'POST') {
      requireAdmin(request);
      store.resolveReport(Number(resolveMatch[1]));
      return json(200, { ok: true });
    }

    if (path === '/admin/events' && method === 'POST') {
      requireAdmin(request);
      const id = store.createEvent(parseEventInput(await readJson(request)));
      return json(201, { id });
    }

    const adminEventMatch = path.match(/^\/admin\/events\/([0-9a-f-]{36})$/);
    if (adminEventMatch && method === 'DELETE') {
      requireAdmin(request);
      store.deleteEvent(adminEventMatch[1]!);
      return json(200, { ok: true });
    }

    const banMatch = path.match(/^\/admin\/users\/([0-9a-f-]{36})\/(ban|unban)$/);
    if (banMatch && method === 'POST') {
      requireAdmin(request);
      const banned = banMatch[2] === 'ban';
      store.setBanned(banMatch[1]!, banned);
      if (banned) hub.disconnectUser(banMatch[1]!, 4003, 'banned');
      return json(200, { ok: true });
    }

    return null;
  }

  return {
    store,
    hub,
    async handle(request, ip) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      try {
        return await route(request, ip);
      } catch (error) {
        if (error instanceof ValidationError) return json(400, { error: error.message, field: error.field, code: 'invalid' });
        if (error instanceof HttpError) return json(error.status, { error: error.message, code: error.code });
        log('request failed', { error: String(error), url: request.url });
        return json(500, { error: 'Something went wrong. Please try again.', code: 'server-error' });
      }
    },
    openSocket(socket) {
      let client: ReturnType<Hub['attach']> | null = null;
      let closed = false;
      const authTimer = setTimeout(() => socket.close(4001, 'unauthorized'), 10_000);
      return {
        onMessage(raw) {
          if (client) {
            hub.handle(client, raw);
            return;
          }
          let message: { type?: string; token?: string };
          try {
            message = JSON.parse(raw);
          } catch {
            socket.close(4001, 'unauthorized');
            return;
          }
          if (message.type !== 'auth' || typeof message.token !== 'string') {
            socket.close(4001, 'unauthorized');
            return;
          }
          const user = store.getUserByToken(message.token);
          if (!user) {
            socket.close(4001, 'unauthorized');
            return;
          }
          if (user.banned) {
            socket.close(4003, 'banned');
            return;
          }
          clearTimeout(authTimer);
          client = hub.attach(user, socket);
        },
        onClose() {
          if (closed) return;
          closed = true;
          clearTimeout(authTimer);
          if (client) hub.detach(client);
        },
      };
    },
    close() {
      hub.shutdown();
    },
  };
}
