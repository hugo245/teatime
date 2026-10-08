import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlDriver } from './db.js';
import type { InterestId } from './interests.js';
import type { ReportReason } from './validation.js';

export type User = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: InterestId[];
  languages: string[];
  photoVersion: number;
  createdAt: number;
  lastSeen: number;
  banned: boolean;
  birthDate: string | null;
  ageVerified: boolean;
  showAge: boolean;
};

export type PublicUser = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: InterestId[];
  languages: string[];
  photoUrl: string | null;
  ageVerified: boolean;
  age: number | null;
};

export type ProfileInput = {
  name: string;
  location: string;
  about: string;
  interests: InterestId[];
  languages: string[];
  showAge: boolean;
};

export type VerificationStatus = 'pending' | 'verified' | 'failed';

export type Verification = {
  id: string;
  userId: string;
  provider: string;
  status: VerificationStatus;
  url: string;
  birthDate: string | null;
  error: string | null;
  createdAt: number;
};

export type Report = {
  id: number;
  reporterId: string;
  reportedId: string;
  reportedName: string | null;
  reason: ReportReason;
  details: string;
  createdAt: number;
};

type UserRow = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: string;
  photo_version: number;
  created_at: number;
  last_seen: number;
  banned: number;
  languages: string;
  birth_date: string | null;
  age_verified_at: number | null;
  show_age: number;
};

type VerificationRow = {
  id: string;
  user_id: string;
  provider: string;
  status: VerificationStatus;
  url: string;
  birth_date: string | null;
  error: string | null;
  created_at: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  interests TEXT NOT NULL DEFAULT '[]',
  photo_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  banned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_device ON users(device_id);
CREATE TABLE IF NOT EXISTS photos (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS friendships_b ON friendships(user_b);
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests(to_id);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS calls_a ON calls(user_a, started_at);
CREATE INDEX IF NOT EXISTS calls_b ON calls(user_b, started_at);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_reported ON reports(reported_id, created_at);
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL,
  birth_date TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verifications_user ON verifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS banned_devices (
  device_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_from ON messages(from_id, to_id, id);
CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, read_at);
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS notices_user ON notices(user_id, seen_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS event_attendees (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
`;

export type MessageKind = 'text' | 'missed-call' | 'voice' | 'plan';

export type Message = {
  id: number;
  from: string;
  to: string;
  kind: MessageKind;
  text: string;
  createdAt: number;
  readAt: number | null;
  voice?: { url: string; seconds: number };
  plan?: { at: number; cancelled: boolean };
};

export type Notice = { id: number; kind: string; title: string; body: string; createdAt: number };

export type ReportDetails = {
  id: number;
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  details: string;
  source: string;
  createdAt: number;
  resolved: boolean;
  action: string | null;
};

type MessageRow = {
  id: number;
  from_id: string;
  to_id: string;
  kind: MessageKind;
  body: string;
  created_at: number;
  read_at: number | null;
};

function parseBody(body: string): Record<string, unknown> {
  try {
    const value = JSON.parse(body);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function toMessage(row: MessageRow): Message {
  const message: Message = {
    id: row.id,
    from: row.from_id,
    to: row.to_id,
    kind: row.kind,
    text: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
  if (row.kind === 'voice') {
    const data = parseBody(row.body);
    message.text = '';
    message.voice = { url: `/api/voice/${String(data.id ?? '')}`, seconds: Number(data.seconds) || 0 };
  } else if (row.kind === 'plan') {
    const data = parseBody(row.body);
    message.text = '';
    message.plan = { at: Number(data.at) || 0, cancelled: data.cancelled === true };
  }
  return message;
}

export type TeaEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  going: number;
  attending: boolean;
};

type EventRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: number;
  ends_at: number | null;
  going: number;
  attending: number;
};

export type PushToken = { platform: string; token: string };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    about: row.about,
    interests: JSON.parse(row.interests) as InterestId[],
    languages: JSON.parse(row.languages || '[]') as string[],
    photoVersion: row.photo_version,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    banned: row.banned === 1,
    birthDate: row.birth_date,
    ageVerified: !!row.age_verified_at && !!row.birth_date,
    showAge: row.show_age !== 0,
  };
}

function toVerification(row: VerificationRow): Verification {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    status: row.status,
    url: row.url,
    birthDate: row.birth_date,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function ageFromBirthDate(birthDate: string, now = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - year;
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    location: user.location,
    about: user.about,
    interests: user.interests,
    languages: user.languages,
    photoUrl: user.photoVersion > 0 ? `/api/users/${user.id}/photo?v=${user.photoVersion}` : null,
    ageVerified: user.ageVerified,
    age: user.ageVerified && user.showAge && user.birthDate ? ageFromBirthDate(user.birthDate) : null,
  };
}

export class Store {
  constructor(private db: SqlDriver) {
    this.db.exec(SCHEMA);
    this.migrate();
  }

  private migrate() {
    const add = (table: string, name: string, definition: string) => {
      const columns = new Set((this.db.all(`PRAGMA table_info(${table})`) as { name: string }[]).map((c) => c.name));
      if (!columns.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    };
    add('users', 'languages', "TEXT NOT NULL DEFAULT '[]'");
    add('users', 'birth_date', 'TEXT');
    add('users', 'age_verified_at', 'INTEGER');
    add('users', 'show_age', 'INTEGER NOT NULL DEFAULT 1');
    add('users', 'update_locked_at', 'INTEGER');
    add('reports', 'source', "TEXT NOT NULL DEFAULT 'call'");
    add('reports', 'action', 'TEXT');
    const events = this.db.get('SELECT COUNT(*) AS n FROM events') as { n: number };
    if (!events.n) {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() + 7);
      start.setUTCHours(13, 0, 0, 0);
      this.createEvent({
        title: 'Test',
        description: 'A test event to try out TeaTime Events. Tap I will come to let others know you are joining.',
        location: 'Online',
        startsAt: start.getTime(),
        endsAt: start.getTime() + 2 * 60 * 60 * 1000,
      });
    }
  }

  getMessage(id: number): Message | null {
    const row = this.db.get('SELECT * FROM messages WHERE id = ?', id) as MessageRow | undefined;
    return row ? toMessage(row) : null;
  }

  setMessageBody(id: number, body: string) {
    this.db.run('UPDATE messages SET body = ? WHERE id = ?', body, id);
  }

  upcomingPlans(id: string): Message[] {
    const rows = this.db.all(
      "SELECT * FROM messages WHERE kind = 'plan' AND (from_id = ? OR to_id = ?) AND created_at >= ? ORDER BY id DESC LIMIT 100",
      id,
      id,
      Date.now() - 60 * 24 * 60 * 60 * 1000,
    ) as MessageRow[];
    const now = Date.now();
    return rows.map(toMessage).filter((m) => m.plan && !m.plan.cancelled && m.plan.at > now);
  }

  saveVoice(ownerId: string, contentType: string, data: Uint8Array): string {
    const id = randomUUID();
    this.db.run('INSERT INTO voice_notes (id, owner_id, content_type, data, created_at) VALUES (?, ?, ?, ?, ?)', id, ownerId, contentType, data, Date.now());
    return id;
  }

  getVoice(id: string): { contentType: string; data: Uint8Array } | null {
    const row = this.db.get('SELECT content_type, data FROM voice_notes WHERE id = ?', id) as { content_type: string; data: Uint8Array | ArrayBuffer } | undefined;
    if (!row) return null;
    return { contentType: row.content_type, data: row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data) };
  }

  addNotice(userId: string, kind: string, title: string, body: string): Notice {
    const createdAt = Date.now();
    this.db.run('INSERT INTO notices (user_id, kind, title, body, created_at) VALUES (?, ?, ?, ?, ?)', userId, kind, title, body, createdAt);
    const row = this.db.get('SELECT id FROM notices WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId) as { id: number };
    return { id: row.id, kind, title, body, createdAt };
  }

  unseenNotices(userId: string): Notice[] {
    const rows = this.db.all('SELECT * FROM notices WHERE user_id = ? AND seen_at IS NULL ORDER BY id ASC LIMIT 10', userId) as {
      id: number;
      kind: string;
      title: string;
      body: string;
      created_at: number;
    }[];
    return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, createdAt: r.created_at }));
  }

  markNoticesSeen(userId: string, ids: number[]) {
    for (const id of ids.slice(0, 20)) this.db.run('UPDATE notices SET seen_at = ? WHERE id = ? AND user_id = ?', Date.now(), id, userId);
  }

  secret(key: string): string {
    const row = this.db.get('SELECT value FROM settings WHERE key = ?', key) as { value: string } | undefined;
    if (row) return row.value;
    const value = randomBytes(32).toString('hex');
    this.db.run('INSERT INTO settings (key, value) VALUES (?, ?)', key, value);
    return value;
  }

  eventPeople(eventId: string, limit = 12): User[] {
    const rows = this.db.all(
      'SELECT u.* FROM event_attendees a JOIN users u ON u.id = a.user_id WHERE a.event_id = ? AND u.banned = 0 ORDER BY a.created_at ASC LIMIT ?',
      eventId,
      limit,
    ) as UserRow[];
    return rows.map(toUser);
  }

  addMessage(from: string, to: string, kind: MessageKind, text: string): Message {
    const createdAt = Date.now();
    this.db.run('INSERT INTO messages (from_id, to_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)', from, to, kind, text, createdAt);
    const row = this.db.get('SELECT * FROM messages WHERE from_id = ? AND to_id = ? ORDER BY id DESC LIMIT 1', from, to) as MessageRow;
    return toMessage(row);
  }

  conversation(a: string, b: string, beforeId: number | null, limit: number): Message[] {
    const rows = this.db.all(
      `SELECT * FROM messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id < ?
       ORDER BY id DESC LIMIT ?`,
      a,
      b,
      b,
      a,
      beforeId ?? Number.MAX_SAFE_INTEGER,
      limit,
    ) as MessageRow[];
    return rows.map(toMessage).reverse();
  }

  markRead(reader: string, other: string): number {
    const now = Date.now();
    this.db.run('UPDATE messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at IS NULL', now, reader, other);
    return now;
  }

  conversations(id: string): { otherId: string; last: Message; unread: number }[] {
    const rows = this.db.all(
      `SELECT m.* FROM messages m JOIN (
         SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS other, MAX(id) AS last_id
         FROM messages WHERE from_id = ? OR to_id = ? GROUP BY other
       ) t ON m.id = t.last_id ORDER BY m.id DESC`,
      id,
      id,
      id,
    ) as MessageRow[];
    const unread = new Map(
      (this.db.all('SELECT from_id, COUNT(*) AS n FROM messages WHERE to_id = ? AND read_at IS NULL GROUP BY from_id', id) as { from_id: string; n: number }[]).map(
        (r) => [r.from_id, r.n],
      ),
    );
    return rows.map((row) => {
      const last = toMessage(row);
      const otherId = last.from === id ? last.to : last.from;
      return { otherId, last, unread: unread.get(otherId) ?? 0 };
    });
  }

  unreadCount(id: string): number {
    return (this.db.get('SELECT COUNT(*) AS n FROM messages WHERE to_id = ? AND read_at IS NULL', id) as { n: number }).n;
  }

  messagesSentSince(id: string, since: number): number {
    return (this.db.get("SELECT COUNT(*) AS n FROM messages WHERE from_id = ? AND kind IN ('text', 'voice', 'plan') AND created_at >= ?", id, since) as { n: number }).n;
  }

  setPushToken(id: string, platform: string, token: string) {
    this.db.run('DELETE FROM push_tokens WHERE token = ? AND user_id <> ?', token, id);
    this.db.run(
      'INSERT INTO push_tokens (user_id, platform, token, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET platform = excluded.platform, token = excluded.token, updated_at = excluded.updated_at',
      id,
      platform,
      token,
      Date.now(),
    );
  }

  pushToken(id: string): PushToken | null {
    const row = this.db.get('SELECT platform, token FROM push_tokens WHERE user_id = ?', id) as PushToken | undefined;
    return row ?? null;
  }

  removePushToken(id: string, token?: string) {
    if (token) this.db.run('DELETE FROM push_tokens WHERE user_id = ? AND token = ?', id, token);
    else this.db.run('DELETE FROM push_tokens WHERE user_id = ?', id);
  }

  createEvent(input: { title: string; description: string; location: string; startsAt: number; endsAt: number | null }): string {
    const id = randomUUID();
    this.db.run(
      'INSERT INTO events (id, title, description, location, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      input.title,
      input.description,
      input.location,
      input.startsAt,
      input.endsAt,
      Date.now(),
    );
    return id;
  }

  deleteEvent(id: string) {
    this.db.run('DELETE FROM event_attendees WHERE event_id = ?', id);
    this.db.run('DELETE FROM events WHERE id = ?', id);
  }

  events(userId: string): TeaEvent[] {
    const rows = this.db.all(
      `SELECT e.*, (SELECT COUNT(*) FROM event_attendees a WHERE a.event_id = e.id) AS going,
         EXISTS (SELECT 1 FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = ?) AS attending
       FROM events e WHERE COALESCE(e.ends_at, e.starts_at) >= ? ORDER BY e.starts_at ASC`,
      userId,
      Date.now() - 24 * 60 * 60 * 1000,
    ) as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      going: row.going,
      attending: !!row.attending,
    }));
  }

  eventExists(id: string) {
    return !!this.db.get('SELECT 1 FROM events WHERE id = ?', id);
  }

  setAttending(eventId: string, userId: string, attending: boolean) {
    if (attending) {
      this.db.run('INSERT OR IGNORE INTO event_attendees (event_id, user_id, created_at) VALUES (?, ?, ?)', eventId, userId, Date.now());
    } else {
      this.db.run('DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?', eventId, userId);
    }
  }

  close() {
    this.db.close();
  }

  createUser(profile: ProfileInput, deviceId: string | null): { user: User; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db.run(`INSERT INTO users (id, token_hash, device_id, name, location, about, interests, languages, show_age, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        id,
        hashToken(token),
        deviceId,
        profile.name,
        profile.location,
        profile.about,
        JSON.stringify(profile.interests),
        JSON.stringify(profile.languages),
        profile.showAge ? 1 : 0,
        now,
        now,
      );
    return { user: this.getUser(id)!, token };
  }

  lockForUpdate(id: string) {
    this.db.run('UPDATE users SET update_locked_at = ? WHERE id = ? AND update_locked_at IS NULL', Date.now(), id);
  }

  restoreAfterUpdate(deviceId: string): { user: User; token: string } | null {
    const row = this.db.get(
      'SELECT id FROM users WHERE device_id = ? AND update_locked_at IS NOT NULL AND banned = 0 ORDER BY last_seen DESC LIMIT 1',
      deviceId,
    ) as { id: string } | undefined;
    if (!row) return null;
    const token = randomBytes(32).toString('base64url');
    this.db.run('UPDATE users SET token_hash = ?, update_locked_at = NULL WHERE id = ?', hashToken(token), row.id);
    return { user: this.getUser(row.id)!, token };
  }

  getUser(id: string): User | null {
    const row = this.db.get('SELECT * FROM users WHERE id = ?', id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  getUserByToken(token: string): User | null {
    const row = this.db.get('SELECT * FROM users WHERE token_hash = ?', hashToken(token)) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  updateProfile(id: string, profile: Partial<ProfileInput>) {
    const current = this.getUser(id);
    if (!current) return null;
    const next = { ...current, ...profile };
    this.db.run('UPDATE users SET name = ?, location = ?, about = ?, interests = ?, languages = ?, show_age = ? WHERE id = ?', next.name, next.location, next.about, JSON.stringify(next.interests), JSON.stringify(next.languages), next.showAge ? 1 : 0, id);
    return this.getUser(id);
  }

  setAgeVerified(id: string, birthDate: string) {
    this.db.run('UPDATE users SET birth_date = ?, age_verified_at = ? WHERE id = ?', birthDate, Date.now(), id);
    return this.getUser(id);
  }

  createVerification(id: string, userId: string, provider: string, url: string): Verification {
    const now = Date.now();
    this.db.run('INSERT INTO verifications (id, user_id, provider, status, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, userId, provider, 'pending', url, now, now);
    return this.getVerification(id)!;
  }

  getVerification(id: string): Verification | null {
    const row = this.db.get('SELECT * FROM verifications WHERE id = ?', id) as VerificationRow | undefined;
    return row ? toVerification(row) : null;
  }

  latestVerification(userId: string): Verification | null {
    const row = this.db.get('SELECT * FROM verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', userId) as VerificationRow | undefined;
    return row ? toVerification(row) : null;
  }

  countVerifications(userId: string, since: number): number {
    const row = this.db.get('SELECT COUNT(*) AS n FROM verifications WHERE user_id = ? AND created_at >= ?', userId, since) as { n: number };
    return row.n;
  }

  updateVerification(id: string, status: VerificationStatus, birthDate: string | null, error: string | null) {
    this.db.run('UPDATE verifications SET status = ?, birth_date = ?, error = ?, updated_at = ? WHERE id = ?', status, birthDate, error, Date.now(), id);
  }

  touch(id: string) {
    this.db.run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), id);
  }

  setPhoto(id: string, data: Uint8Array) {
    this.db.run('INSERT INTO photos (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data', id, data);
    this.db.run('UPDATE users SET photo_version = photo_version + 1 WHERE id = ?', id);
    return this.getUser(id);
  }

  deletePhoto(id: string) {
    this.db.run('DELETE FROM photos WHERE user_id = ?', id);
    this.db.run('UPDATE users SET photo_version = 0 WHERE id = ?', id);
    return this.getUser(id);
  }

  getPhoto(id: string): Uint8Array | null {
    const row = this.db.get('SELECT data FROM photos WHERE user_id = ?', id) as { data: Uint8Array | ArrayBuffer } | undefined;
    return row ? new Uint8Array(row.data) : null;
  }

  deleteUser(id: string) {
    this.db.run('DELETE FROM messages WHERE from_id = ? OR to_id = ?', id, id);
    this.db.run('DELETE FROM push_tokens WHERE user_id = ?', id);
    this.db.run('DELETE FROM event_attendees WHERE user_id = ?', id);
    this.db.run('DELETE FROM notices WHERE user_id = ?', id);
    this.db.run('DELETE FROM voice_notes WHERE owner_id = ?', id);
    this.db.run('DELETE FROM users WHERE id = ?', id);
    this.db.run('DELETE FROM reports WHERE reporter_id = ?', id);
  }

  setBanned(id: string, banned: boolean) {
    this.db.run('UPDATE users SET banned = ? WHERE id = ?', banned ? 1 : 0, id);
    const row = this.db.get('SELECT device_id FROM users WHERE id = ?', id) as { device_id: string | null } | undefined;
    if (row?.device_id) {
      if (banned) {
        this.db.run('INSERT OR IGNORE INTO banned_devices (device_id, created_at) VALUES (?, ?)', row.device_id, Date.now());
      } else {
        this.db.run('DELETE FROM banned_devices WHERE device_id = ?', row.device_id);
      }
    }
  }

  isDeviceBanned(deviceId: string) {
    return !!this.db.get('SELECT 1 FROM banned_devices WHERE device_id = ?', deviceId);
  }

  areFriends(a: string, b: string) {
    const [x, y] = pair(a, b);
    return !!this.db.get('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?', x, y);
  }

  addFriendship(a: string, b: string) {
    const [x, y] = pair(a, b);
    this.db.run('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)', x, y, Date.now());
    this.db.run('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a);
  }

  removeFriendship(a: string, b: string) {
    const [x, y] = pair(a, b);
    this.db.run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', x, y);
    this.db.run('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a);
  }

  friendIds(id: string): string[] {
    const rows = this.db.all('SELECT user_b AS id FROM friendships WHERE user_a = ? UNION SELECT user_a AS id FROM friendships WHERE user_b = ?', id, id) as { id: string }[];
    return rows.map((r) => r.id);
  }

  friends(id: string): { user: User; since: number; lastCallAt: number | null; callCount: number }[] {
    const rows = this.db.all(`SELECT u.*, f.created_at AS since,
           (SELECT MAX(c.started_at) FROM calls c WHERE (c.user_a = u.id AND c.user_b = ?) OR (c.user_b = u.id AND c.user_a = ?)) AS last_call_at,
           (SELECT COUNT(*) FROM calls c WHERE (c.user_a = u.id AND c.user_b = ?) OR (c.user_b = u.id AND c.user_a = ?)) AS call_count
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
         WHERE (f.user_a = ? OR f.user_b = ?) AND u.banned = 0
         ORDER BY u.name COLLATE NOCASE`, id, id, id, id, id, id, id) as (UserRow & { since: number; last_call_at: number | null; call_count: number })[];
    return rows.map((row) => ({ user: toUser(row), since: row.since, lastCallAt: row.last_call_at, callCount: row.call_count }));
  }

  addFriendRequest(from: string, to: string) {
    this.db.run('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)', from, to, Date.now());
  }

  hasFriendRequest(from: string, to: string) {
    return !!this.db.get('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', from, to);
  }

  incomingRequests(id: string): { user: User; createdAt: number }[] {
    const rows = this.db.all(`SELECT u.*, r.created_at AS requested_at FROM friend_requests r JOIN users u ON u.id = r.from_id
         WHERE r.to_id = ? AND u.banned = 0 ORDER BY r.created_at DESC`, id) as (UserRow & { requested_at: number })[];
    return rows.map((row) => ({ user: toUser(row), createdAt: row.requested_at }));
  }

  outgoingRequestIds(id: string): Set<string> {
    const rows = this.db.all('SELECT to_id FROM friend_requests WHERE from_id = ?', id) as { to_id: string }[];
    return new Set(rows.map((r) => r.to_id));
  }

  block(blocker: string, blocked: string) {
    this.db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', blocker, blocked, Date.now());
    this.removeFriendship(blocker, blocked);
  }

  unblock(blocker: string, blocked: string) {
    this.db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', blocker, blocked);
  }

  isBlockedEither(a: string, b: string) {
    return !!this.db.get('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a);
  }

  blockedUsers(id: string): User[] {
    const rows = this.db.all('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC', id) as UserRow[];
    return rows.map(toUser);
  }

  recordCall(id: string, a: string, b: string, kind: string) {
    this.db.run('INSERT INTO calls (id, user_a, user_b, kind, started_at) VALUES (?, ?, ?, ?, ?)', id, a, b, kind, Date.now());
  }

  endCall(id: string) {
    this.db.run('UPDATE calls SET ended_at = ? WHERE id = ? AND ended_at IS NULL', Date.now(), id);
  }

  haveMet(a: string, b: string) {
    return !!this.db.get('SELECT 1 FROM calls WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?) LIMIT 1', a, b, b, a);
  }

  recentPartners(id: string, since: number, limit: number): { user: User; metAt: number }[] {
    const rows = this.db.all(`SELECT u.*, MAX(c.started_at) AS met_at FROM calls c
         JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
         WHERE (c.user_a = ? OR c.user_b = ?) AND c.kind = 'random' AND c.started_at >= ? AND u.banned = 0
         GROUP BY u.id ORDER BY met_at DESC LIMIT ?`, id, id, id, since, limit) as (UserRow & { met_at: number })[];
    return rows.map((row) => ({ user: toUser(row), metAt: row.met_at }));
  }

  addReport(reporterId: string, reportedId: string, reason: ReportReason, details: string, source = 'call'): number {
    this.db.run(
      'INSERT INTO reports (reporter_id, reported_id, reason, details, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      reporterId,
      reportedId,
      reason,
      details,
      source,
      Date.now(),
    );
    return (this.db.get('SELECT id FROM reports WHERE reporter_id = ? ORDER BY id DESC LIMIT 1', reporterId) as { id: number }).id;
  }

  getReport(id: number): ReportDetails | null {
    const row = this.db.get('SELECT * FROM reports WHERE id = ?', id) as
      | { id: number; reporter_id: string; reported_id: string; reason: ReportReason; details: string; source: string; created_at: number; resolved: number; action: string | null }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      reporterId: row.reporter_id,
      reportedId: row.reported_id,
      reason: row.reason,
      details: row.details,
      source: row.source,
      createdAt: row.created_at,
      resolved: !!row.resolved,
      action: row.action,
    };
  }

  setReportAction(id: number, action: string) {
    this.db.run('UPDATE reports SET resolved = 1, action = ? WHERE id = ?', action, id);
  }

  reportCount(reportedId: string): number {
    return (this.db.get('SELECT COUNT(*) AS n FROM reports WHERE reported_id = ?', reportedId) as { n: number }).n;
  }

  distinctReporters(reportedId: string, since: number): number {
    const row = this.db.get('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE reported_id = ? AND created_at >= ?', reportedId, since) as { n: number };
    return row.n;
  }

  openReports(limit = 200): Report[] {
    const rows = this.db.all(`SELECT r.*, u.name AS reported_name FROM reports r LEFT JOIN users u ON u.id = r.reported_id
         WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT ?`, limit) as {
      id: number;
      reporter_id: string;
      reported_id: string;
      reported_name: string | null;
      reason: ReportReason;
      details: string;
      created_at: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      reporterId: r.reporter_id,
      reportedId: r.reported_id,
      reportedName: r.reported_name,
      reason: r.reason,
      details: r.details,
      createdAt: r.created_at,
    }));
  }

  resolveReport(id: number) {
    this.db.run('UPDATE reports SET resolved = 1 WHERE id = ?', id);
  }
}
