import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createApi, type IceServer } from './api.js';
import type { Hub, HubOptions } from './hub.js';
import { NodeSqlDriver } from './nodeDb.js';
import { Store } from './store.js';
import type { UpdatesOptions } from './updates.js';

export type { IceServer } from './api.js';

export type StaticRoot = {
  prefix: string;
  dir: string;
  spaFallback?: string;
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
  updates?: UpdatesOptions;
};

export type TeaTimeServer = {
  http: Server;
  store: Store;
  hub: Hub;
  close(): Promise<void>;
};

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
  '.bin': 'application/octet-stream',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createTeaTimeServer(options: ServerOptions): TeaTimeServer {
  const store = new Store(new NodeSqlDriver(options.databaseFile));
  const api = createApi(store, options);
  const staticRoots: StaticRoot[] = [{ prefix: '/age-check', dir: join(PUBLIC_DIR, 'age-check') }, ...(options.staticRoots ?? [])];

  function clientIp(req: IncomingMessage) {
    if (options.trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0]!.trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  async function toRequest(req: IncomingMessage): Promise<Request> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 1.5 * 1024 * 1024) throw new Error('too-large');
      chunks.push(chunk as Buffer);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = req.method ?? 'GET';
    return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' || chunks.length === 0 ? undefined : Buffer.concat(chunks),
    });
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    for (const root of staticRoots) {
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
        'access-control-allow-origin': '*',
        'cache-control': type.startsWith('text/html') ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(res);
      return true;
    }
    return false;
  }

  const http = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path.startsWith('/age-check') && serveStatic(req, res, path)) return;
      const response = await api.handle(await toRequest(req), clientIp(req));
      if (response) {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => (headers[key] = value));
        res.writeHead(response.status, headers);
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (serveStatic(req, res, path)) return;
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ error: 'Not found', code: 'not-found' }));
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const tooLarge = error instanceof Error && error.message === 'too-large';
      res.writeHead(tooLarge ? 413 : 500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: tooLarge ? 'Request is too large.' : 'Something went wrong.', code: tooLarge ? 'too-large' : 'server-error' }));
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const handlers = api.openSocket(ws);
      ws.on('message', (data) => handlers.onMessage(data.toString()));
      ws.on('close', () => handlers.onClose());
      ws.on('error', () => ws.terminate());
    });
  });

  const sweeper = setInterval(() => api.hub.sweep(70_000), 15_000);
  sweeper.unref();

  return {
    http,
    store,
    hub: api.hub,
    close: () =>
      new Promise<void>((resolveClose) => {
        clearInterval(sweeper);
        api.close();
        wss.close();
        http.closeAllConnections?.();
        http.close(() => {
          store.close();
          resolveClose();
        });
      }),
  };
}
