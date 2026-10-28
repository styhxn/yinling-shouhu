import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import pg from "pg";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (
    path: string,
    options?: { enableForeignKeyConstraints?: boolean }
  ) => DatabaseSyncType;
};

export type SqlDriver = "sqlite" | "postgres";

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
  supportsVector: boolean;
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
    supportsVector: false,
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

export function toPostgresPlaceholders(sql: string) {
  let out = "";
  let index = 0;
  let state: "normal" | "single" | "double" | "line" | "block" | "dollar" = "normal";
  let dollarTag = "";

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i] ?? "";
    const next = sql[i + 1] ?? "";

    if (state === "normal") {
      if (ch === "'") {
        state = "single";
        out += ch;
        continue;
      }
      if (ch === '"') {
        state = "double";
        out += ch;
        continue;
      }
      if (ch === "-" && next === "-") {
        state = "line";
        out += `${ch}${next}`;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block";
        out += `${ch}${next}`;
        i += 1;
        continue;
      }
      if (ch === "$") {
        const match = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
        if (match) {
          dollarTag = match[0];
          state = "dollar";
          out += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      }
      if (ch === "?") {
        index += 1;
        out += `$${index}`;
        continue;
      }
      out += ch;
      continue;
    }

    if (state === "single") {
      out += ch;
      if (ch === "'" && next === "'") {
        out += next;
        i += 1;
      } else if (ch === "'") {
        state = "normal";
      }
      continue;
    }

    if (state === "double") {
      out += ch;
      if (ch === '"') state = "normal";
      continue;
    }

    if (state === "line") {
      out += ch;
      if (ch === "\n") state = "normal";
      continue;
    }

    if (state === "block") {
      out += ch;
      if (ch === "*" && next === "/") {
        out += next;
        i += 1;
        state = "normal";
      }
      continue;
    }

    if (state === "dollar") {
      out += ch;
      if (sql.startsWith(dollarTag, i)) {
        out += dollarTag.slice(1);
        i += dollarTag.length - 1;
        state = "normal";
      }
    }
  }

  return out;
}

export function createPostgresClient(options: {
  connectionString: string;
  max?: number;
  ssl?: boolean;
}): SqlClient {
  pg.types.setTypeParser(20, (value) => Number(value));

  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ...(options.ssl ? { ssl: { rejectUnauthorized: false } } : {})
  });
  pool.on("error", () => {
    // Keep the pool alive; individual queries surface their own errors.
  });

  return {
    driver: "postgres",
    supportsVector: true,
    async exec(sql: string) {
      await pool.query(sql);
    },
    prepare(sql: string) {
      const text = toPostgresPlaceholders(sql);
      const values = (params: unknown[]) =>
        params.map((value) => (typeof value === "undefined" ? null : value));
      return {
        async get<T>(...params: unknown[]) {
          const result = await pool.query(text, values(params));
          return result.rows[0] as T | undefined;
        },
        async all<T>(...params: unknown[]) {
          const result = await pool.query(text, values(params));
          return result.rows as T[];
        },
        async run(...params: unknown[]) {
          const result = await pool.query(text, values(params));
          return { changes: result.rowCount ?? 0 };
        }
      };
    },
    async ping() {
      await pool.query("SELECT 1 AS ok");
    },
    async close() {
      await pool.end();
    }
  };
}
