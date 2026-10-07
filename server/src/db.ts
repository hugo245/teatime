export type SqlValue = string | number | null | Uint8Array | ArrayBuffer;

export interface SqlDriver {
  exec(sql: string): void;
  get(sql: string, ...params: SqlValue[]): unknown;
  all(sql: string, ...params: SqlValue[]): unknown[];
  run(sql: string, ...params: SqlValue[]): void;
  close(): void;
}

type DurableSqlCursor = { toArray(): Record<string, unknown>[] };
type DurableSql = { exec(sql: string, ...params: unknown[]): DurableSqlCursor };

export class DurableObjectSqlDriver implements SqlDriver {
  constructor(private sql: DurableSql) {}

  exec(sql: string) {
    for (const statement of sql.split(';')) {
      if (statement.trim()) this.sql.exec(statement);
    }
  }

  get(sql: string, ...params: SqlValue[]) {
    return this.sql.exec(sql, ...params).toArray()[0];
  }

  all(sql: string, ...params: SqlValue[]) {
    return this.sql.exec(sql, ...params).toArray();
  }

  run(sql: string, ...params: SqlValue[]) {
    this.sql.exec(sql, ...params).toArray();
  }

  close() {}
}
