import { resolve } from 'node:path';
import { createTeaTimeServer, type IceServer, type StaticRoot } from './app.js';

function iceServersFromEnv(): IceServer[] {
  if (process.env.ICE_SERVERS) {
    return JSON.parse(process.env.ICE_SERVERS) as IceServer[];
  }
  const servers: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URLS) {
    servers.push({
      urls: process.env.TURN_URLS.split(',').map((u) => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

function staticRootsFromEnv(): StaticRoot[] {
  const roots: StaticRoot[] = [];
  if (process.env.SIMULATOR_DIR) roots.push({ prefix: '/simulator', dir: resolve(process.env.SIMULATOR_DIR) });
  if (process.env.WEB_APP_DIR) roots.push({ prefix: '/', dir: resolve(process.env.WEB_APP_DIR), spaFallback: 'index.html' });
  return roots;
}

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), message, ...extra }));
}

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const server = createTeaTimeServer({
  databaseFile: process.env.DATABASE_FILE ?? resolve('data/teatime.db'),
  iceServers: iceServersFromEnv(),
  adminToken: process.env.ADMIN_TOKEN,
  supportEmail: process.env.SUPPORT_EMAIL ?? 'support@teatime.app',
  staticRoots: staticRootsFromEnv(),
  trustProxy: process.env.TRUST_PROXY === '1',
  registerLimitPerHour: process.env.REGISTER_LIMIT_PER_HOUR ? Number(process.env.REGISTER_LIMIT_PER_HOUR) : undefined,
  log,
});

server.http.listen(port, host, () => {
  log('TeaTime server listening', { port, host });
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  log('shutting down');
  server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
