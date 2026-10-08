export type PushMessage = {
  title: string;
  body: string;
  channel: 'calls' | 'messages';
  tag: string;
  data: Record<string, string>;
  ttlSeconds?: number;
};

export type PushResult = 'sent' | 'invalid-token' | 'failed';

export type Pusher = {
  send(token: string, message: PushMessage): Promise<PushResult>;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function base64url(data: ArrayBuffer | Uint8Array | string): string {
  let binary = '';
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function createFcmPusher(serviceAccountJson: string | undefined, log: (message: string, extra?: Record<string, unknown>) => void = () => {}): Pusher | null {
  if (!serviceAccountJson) return null;
  let account: ServiceAccount;
  try {
    account = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    log('push disabled: FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    return null;
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    log('push disabled: FIREBASE_SERVICE_ACCOUNT is missing fields');
    return null;
  }

  let cached: { token: string; expires: number } | null = null;
  let keyPromise: Promise<CryptoKey> | null = null;

  function key() {
    keyPromise ??= crypto.subtle.importKey('pkcs8', pemToDer(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    return keyPromise;
  }

  async function accessToken(): Promise<string> {
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key(), new TextEncoder().encode(`${header}.${claims}`));
    const assertion = `${header}.${claims}.${base64url(signature)}`;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) throw new Error(`token request failed with ${res.status}`);
    cached = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  return {
    async send(token, message) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              data: message.data,
              android: {
                priority: 'HIGH',
                ttl: `${message.ttlSeconds ?? 86400}s`,
                notification: {
                  title: message.title,
                  body: message.body,
                  channel_id: message.channel,
                  tag: message.tag,
                  sound: message.channel === 'calls' ? 'ring' : 'default',
                },
              },
            },
          }),
        });
        if (res.ok) return 'sent';
        const text = await res.text();
        if (res.status === 404 || text.includes('UNREGISTERED')) return 'invalid-token';
        log('push failed', { status: res.status, body: text.slice(0, 300) });
        return 'failed';
      } catch (error) {
        log('push failed', { error: String(error) });
        return 'failed';
      }
    },
  };
}
