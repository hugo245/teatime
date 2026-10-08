export type UpdatesOptions = {
  releasesUrl?: string;
  cacheMs?: number;
};

type Platform = 'ios' | 'android';

type CachedFile = { at: number; value: unknown };

export type LatestApp = {
  platform: Platform;
  build: number;
  runtimeVersion: string;
  url: string;
};

const DEFAULT_RELEASES_URL = 'https://github.com/hugo245/teatime/releases/download';

const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'cache-control': 'private, max-age=0',
  'access-control-allow-origin': '*',
};

function parsePlatform(value: string | null): Platform | null {
  return value === 'ios' || value === 'android' ? value : null;
}

export function createUpdates(options: UpdatesOptions = {}) {
  const releasesUrl = (options.releasesUrl || DEFAULT_RELEASES_URL).replace(/\/+$/, '');
  const cacheMs = options.cacheMs ?? 60_000;
  const cache = new Map<string, CachedFile>();

  async function releaseFile(path: string): Promise<unknown> {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < cacheMs) return hit.value;
    let value: unknown = null;
    try {
      const res = await fetch(`${releasesUrl}/${path}`, { redirect: 'follow' });
      if (res.ok) value = await res.json();
    } catch {
      value = hit?.value ?? null;
    }
    cache.set(path, { at: Date.now(), value });
    return value;
  }

  function noUpdate() {
    return new Response(null, { status: 204, headers: PROTOCOL_HEADERS });
  }

  async function manifest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const platform = parsePlatform(request.headers.get('expo-platform') ?? url.searchParams.get('platform'));
    const runtimeVersion = request.headers.get('expo-runtime-version') ?? url.searchParams.get('runtime-version');
    if (!platform || !runtimeVersion) {
      return new Response(JSON.stringify({ error: 'Missing platform or runtime version', code: 'bad-request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const update = (await releaseFile(`ota-latest/manifest-${platform}.json`)) as Record<string, unknown> | null;
    if (!update || typeof update !== 'object' || update.runtimeVersion !== runtimeVersion) return noUpdate();

    const boundary = `teatime-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=utf-8',
      'Content-Disposition: form-data; name="manifest"',
      '',
      JSON.stringify(update),
      `--${boundary}`,
      'Content-Type: application/json',
      'Content-Disposition: form-data; name="extensions"',
      '',
      JSON.stringify({ assetRequestHeaders: {} }),
      `--${boundary}--`,
      '',
    ].join('\r\n');
    return new Response(body, {
      status: 200,
      headers: { ...PROTOCOL_HEADERS, 'content-type': `multipart/mixed; boundary=${boundary}` },
    });
  }

  async function latest(platformValue: string | null): Promise<LatestApp | null> {
    const platform = parsePlatform(platformValue);
    if (!platform) return null;
    const info = (await releaseFile(`${platform}-latest/version.json`)) as Partial<LatestApp> | null;
    if (!info || typeof info.build !== 'number' || typeof info.runtimeVersion !== 'string') return null;
    return {
      platform,
      build: info.build,
      runtimeVersion: info.runtimeVersion,
      url: typeof info.url === 'string' ? info.url : `${releasesUrl}/${platform}-latest/${platform === 'ios' ? 'TeaTime.ipa' : 'TeaTime.apk'}`,
    };
  }

  return { manifest, latest };
}
