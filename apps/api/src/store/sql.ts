import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import mysql, { type Pool, type ResultSetHeader } from "mysql2/promise";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (
    path: string,
    options?: { enableForeignKeyConstraints?: boolean }
  ) => DatabaseSyncType;
};

export type SqlDriver = "sqlite" | "mysql";

export type SqlRunResult = {
  changes: number;
  lastInsertRowid?: number | bigint;
};

export interface SqlStatement {
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<SqlRunResult>;
}

export interface SqlClient {
  readonly driver: SqlDriver;
  exec(sql: string): Promise<void>;
  prepare(sql: string): SqlStatement;
  ping(): Promise<void>;
  close(): Promise<void>;
}

function sqliteStatement(
  statement: ReturnType<DatabaseSyncType["prepare"]>
): SqlStatement {
  return {
    async get<T>(...params: unknown[]) {
      return statement.get(...(params as any[])) as T | undefined;
    },
    async all<T>(...params: unknown[]) {
      return statement.all(...(params as any[])) as T[];
    },
    async run(...params: unknown[]) {
      const result = statement.run(...(params as any[]));
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowid: result.lastInsertRowid
      };
    }
  };
}

export function createSqliteClient(path: string): SqlClient {
  const raw = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  raw.exec("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") raw.exec("PRAGMA journal_mode = WAL");

  return {
    driver: "sqlite",
    async exec(sql: string) {
      raw.exec(sql);
    },
    prepare(sql: string) {
      return sqliteStatement(raw.prepare(sql));
    },
    async ping() {
      raw.prepare("SELECT 1 AS ok").get();
    },
    async close() {
      raw.close();
    }
  };
}

function mysqlStatement(pool: Pool, sql: string): SqlStatement {
  const values = (params: unknown[]) =>
    params.map((value) => (typeof value === "undefined" ? null : value));

  return {
    async get<T>(...params: unknown[]) {
      const [rows] = await pool.query(sql, values(params));
      return (Array.isArray(rows) ? rows[0] : undefined) as T | undefined;
    },
    async all<T>(...params: unknown[]) {
      const [rows] = await pool.query(sql, values(params));
      return (Array.isArray(rows) ? rows : []) as T[];
    },
    async run(...params: unknown[]) {
      const [result] = await pool.query(sql, values(params));
      const header = result as ResultSetHeader;
      return {
        changes: Number(header?.affectedRows ?? 0),
        lastInsertRowid: header?.insertId
      };
    }
  };
}

export function createMysqlClient(options: {
  connectionString: string;
  max?: number;
  ssl?: boolean;
}): SqlClient {
  const url = new URL(options.connectionString);
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL must use mysql:// or mariadb://");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) throw new Error("DATABASE_URL must include a database name");

  const pool = mysql.createPool({
    host: decodeURIComponent(url.hostname),
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    waitForConnections: true,
    connectionLimit: options.max ?? 10,
    connectTimeout: 5_000,
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: false,
    ...(options.ssl ? { ssl: { rejectUnauthorized: false } } : {})
  });

  return {
    driver: "mysql",
    async exec(sql: string) {
      await pool.query(sql);
    },
    prepare(sql: string) {
      return mysqlStatement(pool, sql);
    },
    async ping() {
      await pool.query("SELECT 1 AS ok");
    },
    async close() {
      await pool.end();
    }
  };
}
