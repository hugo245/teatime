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
`;

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
    const columns = new Set((this.db.all('PRAGMA table_info(users)') as { name: string }[]).map((c) => c.name));
    const add = (name: string, definition: string) => {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    };
    add('languages', "TEXT NOT NULL DEFAULT '[]'");
    add('birth_date', 'TEXT');
    add('age_verified_at', 'INTEGER');
    add('show_age', 'INTEGER NOT NULL DEFAULT 1');
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

  addReport(reporterId: string, reportedId: string, reason: ReportReason, details: string) {
    this.db.run('INSERT INTO reports (reporter_id, reported_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)', reporterId, reportedId, reason, details, Date.now());
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
