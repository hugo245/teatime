import { DurableObject } from 'cloudflare:workers';
import { createApi, type Api, type IceServer } from './api.js';
import { DurableObjectSqlDriver } from './db.js';
import type { HubSocket } from './hub.js';
import { Store } from './store.js';

type Env = {
  HUB: DurableObjectNamespace;
  SUPPORT_EMAIL?: string;
  ADMIN_TOKEN?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  ICE_SERVERS?: string;
  REGISTER_LIMIT_PER_HOUR?: string;
  RING_TIMEOUT_MS?: string;
  RECONNECT_GRACE_MS?: string;
  REMATCH_WAIT_MS?: string;
  MATCH_INTERVAL_MS?: string;
  UPDATES_URL?: string;
  AGE_TEST_SKIP?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  DISCORD_WEBHOOK_URL?: string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
};

function iceServers(env: Env): IceServer[] {
  if (env.ICE_SERVERS) return JSON.parse(env.ICE_SERVERS) as IceServer[];
  const servers: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (env.TURN_URLS) {
    servers.push({
      urls: env.TURN_URLS.split(',').map((u) => u.trim()),
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

function num(value: string | undefined) {
  return value ? Number(value) : undefined;
}

export class TeaTimeHub extends DurableObject<Env> {
  private api: Api;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const store = new Store(new DurableObjectSqlDriver(ctx.storage.sql));
    this.api = createApi(store, {
      iceServers: iceServers(env),
      adminToken: env.ADMIN_TOKEN,
      supportEmail: env.SUPPORT_EMAIL ?? 'support@teatime.app',
      registerLimitPerHour: num(env.REGISTER_LIMIT_PER_HOUR),
      hub: {
        ringTimeoutMs: num(env.RING_TIMEOUT_MS),
        reconnectGraceMs: num(env.RECONNECT_GRACE_MS),
        rematchWaitMs: num(env.REMATCH_WAIT_MS),
        matchIntervalMs: num(env.MATCH_INTERVAL_MS),
      },
      updates: { releasesUrl: env.UPDATES_URL },
      ageTestSkip: env.AGE_TEST_SKIP !== '0',
      firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT,
      discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
      turn: { keyId: env.TURN_KEY_ID, apiToken: env.TURN_KEY_API_TOKEN },
      log: (message, extra) => console.log(JSON.stringify({ message, ...extra })),
    });
    setInterval(() => this.api.hub.sweep(70_000), 15_000);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      const handlers = this.api.openSocket(server as unknown as HubSocket);
      server.addEventListener('message', (event: MessageEvent) => handlers.onMessage(typeof event.data === 'string' ? event.data : ''));
      server.addEventListener('close', (event: CloseEvent) => {
        handlers.onClose();
        try {
          server.close(event.code === 1005 ? 1000 : event.code, 'closing');
        } catch {
          handlers.onClose();
        }
      });
      server.addEventListener('error', () => handlers.onClose());
      return new Response(null, { status: 101, webSocket: client });
    }
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const response = await this.api.handle(request, ip);
    return response ?? new Response(JSON.stringify({ error: 'Not found', code: 'not-found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const hub = env.HUB.get(env.HUB.idFromName('global'));
    return hub.fetch(request);
  },
};
