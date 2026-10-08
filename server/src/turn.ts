import type { IceServer } from './api.js';

export type TurnOptions = { keyId?: string; apiToken?: string };

export function createTurnProvider(options: TurnOptions, log: (message: string, extra?: Record<string, unknown>) => void) {
  let cached: { servers: IceServer[]; expires: number } | null = null;

  return async function turnServers(): Promise<IceServer[]> {
    if (!options.keyId || !options.apiToken) return [];
    if (cached && cached.expires > Date.now()) return cached.servers;
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${options.keyId}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { iceServers?: IceServer | IceServer[] };
      const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
      const servers = list
        .map((server) => ({
          ...server,
          urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((u) => !/:53(\?|$)/.test(u)),
        }))
        .filter((server) => server.urls.length > 0);
      cached = { servers, expires: Date.now() + 12 * 60 * 60 * 1000 };
      return servers;
    } catch (error) {
      log('turn credentials failed', { error: String(error) });
      cached = { servers: [], expires: Date.now() + 5 * 60 * 1000 };
      return [];
    }
  };
}
