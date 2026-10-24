import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { migrate } from "../apps/api/src/store/migrations.js";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncType;
};

const db = new DatabaseSync(":memory:");
migrate(db);

const rows = db
  .prepare(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
     ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
  )
  .all() as Array<{ type: string; name: string; sql: string }>;

db.close();

const header = `-- 银龄守护 SQLite schema
-- 由 apps/api/src/store/migrations.ts 生成，请勿手工修改。
-- 重新生成：npm run db:schema
--
-- 说明：后端启动时会自动执行同一份迁移，通常无需手动建表。
-- 手动初始化：sqlite3 /path/to/app.db < docs/schema.sql
-- 语句均为 IF NOT EXISTS，可在已有库上重复执行。
-- 演示数据由 DEMO_MODE=1 启动时写入，本文件只包含表结构。

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

`;

const body = rows
  .map((row) =>
    row.sql
      .replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
      .replace(/^CREATE INDEX\s+(?!IF NOT EXISTS)/i, "CREATE INDEX IF NOT EXISTS ")
  )
  .map((sql) => `${sql};`)
  .join("\n\n");
const target = path.resolve("docs/schema.sql");
fs.writeFileSync(target, `${header}${body}\n\nPRAGMA user_version = 1;\n`, "utf8");
console.log(`wrote ${target} (${rows.length} statements)`);
