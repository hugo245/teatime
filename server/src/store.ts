import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { InterestId } from './interests.js';
import type { ReportReason } from './validation.js';

export type User = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: InterestId[];
  photoVersion: number;
  createdAt: number;
  lastSeen: number;
  banned: boolean;
};

export type PublicUser = {
  id: string;
  name: string;
  location: string;
  about: string;
  interests: InterestId[];
  photoUrl: string | null;
};

export type ProfileInput = {
  name: string;
  location: string;
  about: string;
  interests: InterestId[];
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
    photoVersion: row.photo_version,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    banned: row.banned === 1,
  };
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    location: user.location,
    about: user.about,
    interests: user.interests,
    photoUrl: user.photoVersion > 0 ? `/api/users/${user.id}/photo?v=${user.photoVersion}` : null,
  };
}

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  createUser(profile: ProfileInput, deviceId: string | null): { user: User; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO users (id, token_hash, device_id, name, location, about, interests, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, hashToken(token), deviceId, profile.name, profile.location, profile.about, JSON.stringify(profile.interests), now, now);
    return { user: this.getUser(id)!, token };
  }

  getUser(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  getUserByToken(token: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE token_hash = ?').get(hashToken(token)) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  updateProfile(id: string, profile: Partial<ProfileInput>) {
    const current = this.getUser(id);
    if (!current) return null;
    const next = { ...current, ...profile };
    this.db
      .prepare('UPDATE users SET name = ?, location = ?, about = ?, interests = ? WHERE id = ?')
      .run(next.name, next.location, next.about, JSON.stringify(next.interests), id);
    return this.getUser(id);
  }

  touch(id: string) {
    this.db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), id);
  }

  setPhoto(id: string, data: Buffer) {
    this.db.prepare('INSERT INTO photos (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').run(id, data);
    this.db.prepare('UPDATE users SET photo_version = photo_version + 1 WHERE id = ?').run(id);
    return this.getUser(id);
  }

  deletePhoto(id: string) {
    this.db.prepare('DELETE FROM photos WHERE user_id = ?').run(id);
    this.db.prepare('UPDATE users SET photo_version = 0 WHERE id = ?').run(id);
    return this.getUser(id);
  }

  getPhoto(id: string): Buffer | null {
    const row = this.db.prepare('SELECT data FROM photos WHERE user_id = ?').get(id) as { data: Uint8Array } | undefined;
    return row ? Buffer.from(row.data) : null;
  }

  deleteUser(id: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM reports WHERE reporter_id = ?').run(id);
  }

  setBanned(id: string, banned: boolean) {
    this.db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id);
    const row = this.db.prepare('SELECT device_id FROM users WHERE id = ?').get(id) as { device_id: string | null } | undefined;
    if (row?.device_id) {
      if (banned) {
        this.db.prepare('INSERT OR IGNORE INTO banned_devices (device_id, created_at) VALUES (?, ?)').run(row.device_id, Date.now());
      } else {
        this.db.prepare('DELETE FROM banned_devices WHERE device_id = ?').run(row.device_id);
      }
    }
  }

  isDeviceBanned(deviceId: string) {
    return !!this.db.prepare('SELECT 1 FROM banned_devices WHERE device_id = ?').get(deviceId);
  }

  areFriends(a: string, b: string) {
    const [x, y] = pair(a, b);
    return !!this.db.prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?').get(x, y);
  }

  addFriendship(a: string, b: string) {
    const [x, y] = pair(a, b);
    this.db.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(x, y, Date.now());
    this.db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(a, b, b, a);
  }

  removeFriendship(a: string, b: string) {
    const [x, y] = pair(a, b);
    this.db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(x, y);
    this.db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(a, b, b, a);
  }

  friendIds(id: string): string[] {
    const rows = this.db
      .prepare('SELECT user_b AS id FROM friendships WHERE user_a = ? UNION SELECT user_a AS id FROM friendships WHERE user_b = ?')
      .all(id, id) as { id: string }[];
    return rows.map((r) => r.id);
  }

  friends(id: string): { user: User; since: number }[] {
    const rows = this.db
      .prepare(
        `SELECT u.*, f.created_at AS since FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
         WHERE (f.user_a = ? OR f.user_b = ?) AND u.banned = 0
         ORDER BY u.name COLLATE NOCASE`,
      )
      .all(id, id, id) as (UserRow & { since: number })[];
    return rows.map((row) => ({ user: toUser(row), since: row.since }));
  }

  addFriendRequest(from: string, to: string) {
    this.db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').run(from, to, Date.now());
  }

  hasFriendRequest(from: string, to: string) {
    return !!this.db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(from, to);
  }

  incomingRequests(id: string): { user: User; createdAt: number }[] {
    const rows = this.db
      .prepare(
        `SELECT u.*, r.created_at AS requested_at FROM friend_requests r JOIN users u ON u.id = r.from_id
         WHERE r.to_id = ? AND u.banned = 0 ORDER BY r.created_at DESC`,
      )
      .all(id) as (UserRow & { requested_at: number })[];
    return rows.map((row) => ({ user: toUser(row), createdAt: row.requested_at }));
  }

  outgoingRequestIds(id: string): Set<string> {
    const rows = this.db.prepare('SELECT to_id FROM friend_requests WHERE from_id = ?').all(id) as { to_id: string }[];
    return new Set(rows.map((r) => r.to_id));
  }

  block(blocker: string, blocked: string) {
    this.db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(blocker, blocked, Date.now());
    this.removeFriendship(blocker, blocked);
  }

  unblock(blocker: string, blocked: string) {
    this.db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blocker, blocked);
  }

  isBlockedEither(a: string, b: string) {
    return !!this.db
      .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
      .get(a, b, b, a);
  }

  blockedUsers(id: string): User[] {
    const rows = this.db
      .prepare('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC')
      .all(id) as UserRow[];
    return rows.map(toUser);
  }

  recordCall(id: string, a: string, b: string, kind: string) {
    this.db.prepare('INSERT INTO calls (id, user_a, user_b, kind, started_at) VALUES (?, ?, ?, ?, ?)').run(id, a, b, kind, Date.now());
  }

  endCall(id: string) {
    this.db.prepare('UPDATE calls SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(Date.now(), id);
  }

  haveMet(a: string, b: string) {
    return !!this.db
      .prepare('SELECT 1 FROM calls WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?) LIMIT 1')
      .get(a, b, b, a);
  }

  recentPartners(id: string, since: number, limit: number): { user: User; metAt: number }[] {
    const rows = this.db
      .prepare(
        `SELECT u.*, MAX(c.started_at) AS met_at FROM calls c
         JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
         WHERE (c.user_a = ? OR c.user_b = ?) AND c.kind = 'random' AND c.started_at >= ? AND u.banned = 0
         GROUP BY u.id ORDER BY met_at DESC LIMIT ?`,
      )
      .all(id, id, id, since, limit) as (UserRow & { met_at: number })[];
    return rows.map((row) => ({ user: toUser(row), metAt: row.met_at }));
  }

  addReport(reporterId: string, reportedId: string, reason: ReportReason, details: string) {
    this.db
      .prepare('INSERT INTO reports (reporter_id, reported_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(reporterId, reportedId, reason, details, Date.now());
  }

  distinctReporters(reportedId: string, since: number): number {
    const row = this.db
      .prepare('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE reported_id = ? AND created_at >= ?')
      .get(reportedId, since) as { n: number };
    return row.n;
  }

  openReports(limit = 200): Report[] {
    const rows = this.db
      .prepare(
        `SELECT r.*, u.name AS reported_name FROM reports r LEFT JOIN users u ON u.id = r.reported_id
         WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT ?`,
      )
      .all(limit) as {
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
    this.db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(id);
  }
}
