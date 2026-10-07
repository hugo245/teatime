import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Hub, type HubOptions } from './hub.js';
import { privacyPage, termsPage } from './pages.js';
import { RateLimiter } from './rateLimit.js';
import { Store, toPublicUser, type User } from './store.js';
import {
  ValidationError,
  parseAbout,
  parseDeviceId,
  parseInterests,
  parseJpeg,
  parseLocation,
  parseName,
  parseReportReason,
} from './validation.js';

export type StaticRoot = {
  prefix: string;
  dir: string;
  spaFallback?: string;
};

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type ServerOptions = {
  databaseFile: string;
  iceServers: IceServer[];
  adminToken?: string;
  supportEmail: string;
  staticRoots?: StaticRoot[];
  autoBanReporters?: number;
  registerLimitPerHour?: number;
  trustProxy?: boolean;
  log?: (message: string, extra?: Record<string, unknown>) => void;
  hub?: HubOptions;
};

export type TeaTimeServer = {
  http: Server;
  store: Store;
  hub: Hub;
  close(): Promise<void>;
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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function createTeaTimeServer(options: ServerOptions): TeaTimeServer {
  const log = options.log ?? (() => {});
  const store = new Store(options.databaseFile);
  const hub = new Hub(store, options.hub);
  const registerLimiter = new RateLimiter(options.registerLimitPerHour ?? 20, 60 * 60 * 1000);
  const friendLimiter = new RateLimiter(60, 60 * 60 * 1000);
  const reportLimiter = new RateLimiter(20, 60 * 60 * 1000);
  const photoLimiter = new RateLimiter(30, 60 * 60 * 1000);
  const autoBanReporters = options.autoBanReporters ?? 3;

  function clientIp(req: IncomingMessage) {
    if (options.trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0]!.trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  function isLoopback(ip: string) {
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }

  function authenticate(req: IncomingMessage): User {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Please sign in again.', 'unauthorized');
    const user = store.getUserByToken(token);
    if (!user) throw new HttpError(401, 'Please sign in again.', 'unauthorized');
    if (user.banned) throw new HttpError(403, 'This account has been removed for breaking the community rules.', 'banned');
    return user;
  }

  function requireAdmin(req: IncomingMessage) {
    const header = req.headers.authorization ?? '';
    if (!options.adminToken || header !== `Bearer ${options.adminToken}`) {
      throw new HttpError(401, 'Unauthorized', 'unauthorized');
    }
  }

  async function readJson(req: IncomingMessage, limit = 16 * 1024): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > limit) throw new HttpError(413, 'Request is too large.', 'too-large');
      chunks.push(chunk as Buffer);
    }
    if (size === 0) return {};
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return value && typeof value === 'object' ? value : {};
    } catch {
      throw new HttpError(400, 'Invalid request.', 'bad-json');
    }
  }

  function sendJson(res: ServerResponse, status: number, body: unknown) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(data),
    });
    res.end(data);
  }

  function sendHtml(res: ServerResponse, html: string) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end(html);
  }

  function friendsPayload(user: User) {
    const friendIds = new Set<string>();
    const friends = store.friends(user.id).map(({ user: friend, since }) => {
      friendIds.add(friend.id);
      return {
        ...toPublicUser(friend),
        online: hub.isOnline(friend.id),
        busy: hub.isInCall(friend.id),
        lastSeen: friend.lastSeen,
        since,
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

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    for (const root of options.staticRoots ?? []) {
      if (!pathname.startsWith(root.prefix)) continue;
      const relative = decodeURIComponent(pathname.slice(root.prefix.length)) || 'index.html';
      const base = resolve(root.dir);
      let file = normalize(join(base, relative));
      if (file !== base && !file.startsWith(base + sep)) continue;
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) {
        if (!root.spaFallback || extname(relative)) continue;
        file = join(base, root.spaFallback);
        if (!existsSync(file)) continue;
      }
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const immutable = file.includes(`${sep}_expo${sep}`) || file.includes(`${sep}assets${sep}`);
      res.writeHead(200, {
        'content-type': type,
        'cache-control': type.startsWith('text/html') ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        createReadStream(file).pipe(res);
      }
      return true;
    }
    return false;
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') return sendJson(res, 200, { ok: true, online: hub.onlineCount });
    if (path === '/privacy') return sendHtml(res, privacyPage(options.supportEmail));
    if (path === '/terms') return sendHtml(res, termsPage(options.supportEmail));

    if (path === '/api/config' && method === 'GET') {
      return sendJson(res, 200, { iceServers: options.iceServers, online: hub.onlineCount, supportEmail: options.supportEmail });
    }

    if (path === '/api/register' && method === 'POST') {
      const ip = clientIp(req);
      if (!isLoopback(ip) && !registerLimiter.allow(ip)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
      const body = await readJson(req);
      const deviceId = parseDeviceId(body.deviceId);
      if (deviceId && store.isDeviceBanned(deviceId)) {
        throw new HttpError(403, 'TeaTime is not available on this phone.', 'banned');
      }
      const profile = {
        name: parseName(body.name),
        location: parseLocation(body.location),
        about: parseAbout(body.about),
        interests: parseInterests(body.interests),
      };
      const { user, token } = store.createUser(profile, deviceId);
      log('user registered', { userId: user.id });
      return sendJson(res, 201, { token, user: toPublicUser(user) });
    }

    if (path === '/api/me') {
      const user = authenticate(req);
      if (method === 'GET') return sendJson(res, 200, { user: toPublicUser(user) });
      if (method === 'PATCH') {
        const body = await readJson(req);
        const update: Parameters<Store['updateProfile']>[1] = {};
        if ('name' in body) update.name = parseName(body.name);
        if ('location' in body) update.location = parseLocation(body.location);
        if ('about' in body) update.about = parseAbout(body.about);
        if ('interests' in body) update.interests = parseInterests(body.interests);
        const updated = store.updateProfile(user.id, update)!;
        return sendJson(res, 200, { user: toPublicUser(updated) });
      }
      if (method === 'DELETE') {
        hub.disconnectUser(user.id, 4001, 'deleted');
        const friendIds = store.friendIds(user.id);
        store.deleteUser(user.id);
        for (const id of friendIds) hub.notifyFriendsChanged(id);
        log('user deleted', { userId: user.id });
        return sendJson(res, 200, { ok: true });
      }
    }

    if (path === '/api/me/photo') {
      const user = authenticate(req);
      if (method === 'PUT') {
        if (!photoLimiter.allow(user.id)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
        const body = await readJson(req, 1024 * 1024);
        const updated = store.setPhoto(user.id, parseJpeg(body.data))!;
        return sendJson(res, 200, { user: toPublicUser(updated) });
      }
      if (method === 'DELETE') {
        const updated = store.deletePhoto(user.id)!;
        return sendJson(res, 200, { user: toPublicUser(updated) });
      }
    }

    const photoMatch = path.match(/^\/api\/users\/([0-9a-f-]{36})\/photo$/);
    if (photoMatch && (method === 'GET' || method === 'HEAD')) {
      const owner = store.getUser(photoMatch[1]!);
      const photo = owner && !owner.banned ? store.getPhoto(owner.id) : null;
      if (!photo) throw new HttpError(404, 'Not found', 'not-found');
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': photo.length,
        'cache-control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
      });
      res.end(method === 'HEAD' ? undefined : photo);
      return;
    }

    if (path === '/api/friends' && method === 'GET') {
      const user = authenticate(req);
      return sendJson(res, 200, friendsPayload(user));
    }

    const friendMatch = path.match(/^\/api\/friends\/([0-9a-f-]{36})$/);
    if (friendMatch) {
      const user = authenticate(req);
      const otherId = friendMatch[1]!;
      if (otherId === user.id) throw new HttpError(400, 'That is you!', 'self');
      if (method === 'POST') {
        if (!friendLimiter.allow(user.id)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
        const other = store.getUser(otherId);
        if (!other || other.banned) throw new HttpError(404, 'This person is no longer on TeaTime.', 'not-found');
        if (store.isBlockedEither(user.id, otherId)) throw new HttpError(403, 'You cannot add this person.', 'blocked');
        if (store.areFriends(user.id, otherId)) return sendJson(res, 200, { status: 'friends' });
        if (!store.haveMet(user.id, otherId)) throw new HttpError(403, 'You can only add people you have talked with.', 'not-met');
        if (store.hasFriendRequest(otherId, user.id)) {
          store.addFriendship(user.id, otherId);
          hub.send(otherId, { type: 'friend.added', user: toPublicUser(user) });
          hub.send(user.id, { type: 'friend.added', user: toPublicUser(other) });
          return sendJson(res, 200, { status: 'friends' });
        }
        if (!store.hasFriendRequest(user.id, otherId)) {
          store.addFriendRequest(user.id, otherId);
          hub.send(otherId, { type: 'friend.request', user: toPublicUser(user) });
        }
        return sendJson(res, 200, { status: 'requested' });
      }
      if (method === 'DELETE') {
        store.removeFriendship(user.id, otherId);
        hub.notifyFriendsChanged(otherId);
        return sendJson(res, 200, { status: 'none' });
      }
    }

    if (path === '/api/blocks' && method === 'GET') {
      const user = authenticate(req);
      return sendJson(res, 200, { blocked: store.blockedUsers(user.id).map(toPublicUser) });
    }

    const blockMatch = path.match(/^\/api\/blocks\/([0-9a-f-]{36})$/);
    if (blockMatch) {
      const user = authenticate(req);
      const otherId = blockMatch[1]!;
      if (otherId === user.id) throw new HttpError(400, 'That is you!', 'self');
      if (method === 'POST') {
        if (!store.getUser(otherId)) throw new HttpError(404, 'Not found', 'not-found');
        store.block(user.id, otherId);
        hub.endCallBetween(user.id, otherId);
        hub.notifyFriendsChanged(otherId);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'DELETE') {
        store.unblock(user.id, otherId);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (path === '/api/reports' && method === 'POST') {
      const user = authenticate(req);
      if (!reportLimiter.allow(user.id)) throw new HttpError(429, 'Please wait a little and try again.', 'rate-limited');
      const body = await readJson(req);
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
      return sendJson(res, 201, { ok: true });
    }

    if (path === '/admin/reports' && method === 'GET') {
      requireAdmin(req);
      return sendJson(res, 200, { reports: store.openReports() });
    }

    const resolveMatch = path.match(/^\/admin\/reports\/(\d+)\/resolve$/);
    if (resolveMatch && method === 'POST') {
      requireAdmin(req);
      store.resolveReport(Number(resolveMatch[1]));
      return sendJson(res, 200, { ok: true });
    }

    const banMatch = path.match(/^\/admin\/users\/([0-9a-f-]{36})\/(ban|unban)$/);
    if (banMatch && method === 'POST') {
      requireAdmin(req);
      const banned = banMatch[2] === 'ban';
      store.setBanned(banMatch[1]!, banned);
      if (banned) hub.disconnectUser(banMatch[1]!, 4003, 'banned');
      return sendJson(res, 200, { ok: true });
    }

    if (serveStatic(req, res, path)) return;
    throw new HttpError(404, 'Not found', 'not-found');
  }

  const http = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof ValidationError) {
        sendJson(res, 400, { error: error.message, field: error.field, code: 'invalid' });
      } else if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message, code: error.code });
      } else {
        log('request failed', { error: String(error), url: req.url });
        sendJson(res, 500, { error: 'Something went wrong. Please try again.', code: 'server-error' });
      }
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => acceptSocket(ws));
  });

  function acceptSocket(ws: WebSocket) {
    let client: ReturnType<Hub['attach']> | null = null;
    const authTimer = setTimeout(() => ws.close(4001, 'unauthorized'), 10_000);
    ws.on('message', (data) => {
      const raw = data.toString();
      if (client) {
        hub.handle(client, raw);
        return;
      }
      let message: { type?: string; token?: string };
      try {
        message = JSON.parse(raw);
      } catch {
        ws.close(4001, 'unauthorized');
        return;
      }
      if (message.type !== 'auth' || typeof message.token !== 'string') {
        ws.close(4001, 'unauthorized');
        return;
      }
      const user = store.getUserByToken(message.token);
      if (!user) {
        ws.close(4001, 'unauthorized');
        return;
      }
      if (user.banned) {
        ws.close(4003, 'banned');
        return;
      }
      clearTimeout(authTimer);
      client = hub.attach(user, ws);
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (client) hub.detach(client);
    });
    ws.on('error', () => ws.terminate());
  }

  const sweeper = setInterval(() => hub.sweep(70_000), 15_000);
  sweeper.unref();

  return {
    http,
    store,
    hub,
    close: () =>
      new Promise<void>((resolveClose) => {
        clearInterval(sweeper);
        hub.shutdown();
        wss.close();
        http.closeAllConnections?.();
        http.close(() => {
          store.close();
          resolveClose();
        });
      }),
  };
}
