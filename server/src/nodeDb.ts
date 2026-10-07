import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDriver, SqlValue } from './db.js';

function input(params: SqlValue[]): SQLInputValue[] {
  return params.map((p) => (p instanceof ArrayBuffer ? new Uint8Array(p) : p)) as SQLInputValue[];
}

export class NodeSqlDriver implements SqlDriver {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  get(sql: string, ...params: SqlValue[]) {
    return this.db.prepare(sql).get(...input(params));
  }

  all(sql: string, ...params: SqlValue[]) {
    return this.db.prepare(sql).all(...input(params));
  }

  run(sql: string, ...params: SqlValue[]) {
    this.db.prepare(sql).run(...input(params));
  }

  close() {
    this.db.close();
  }
}
