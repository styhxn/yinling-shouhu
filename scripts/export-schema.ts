import fs from "node:fs";
import path from "node:path";
import { postgresSchema, SCHEMA_SQL } from "../apps/api/src/store/migrations.js";

const sqliteHeader = `-- 银龄守护 SQLite schema
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

const postgresHeader = `-- 银龄守护 PostgreSQL schema（含 pgvector）
-- 由 apps/api/src/store/migrations.ts 生成，请勿手工修改。
-- 重新生成：npm run db:schema
--
-- 说明：后端启动时会自动执行同一份迁移；本文件用于 DBA 审计或手动建库。
-- 手动初始化：psql "$DATABASE_URL" -f docs/schema.postgres.sql
-- 需要 PostgreSQL 16+ 与 pgvector 扩展；业务时间戳统一为 BIGINT（毫秒）。
-- 若数据库不允许创建扩展，请勿执行本文件，直接启动应用（会自动降级为内存检索）。

CREATE EXTENSION IF NOT EXISTS vector;
`;

const sqliteTarget = path.resolve("docs/schema.sql");
const postgresTarget = path.resolve("docs/schema.postgres.sql");
fs.writeFileSync(
  sqliteTarget,
  `${sqliteHeader}${SCHEMA_SQL}\n\nPRAGMA user_version = 1;\n`,
  "utf8"
);
fs.writeFileSync(
  postgresTarget,
  `${postgresHeader}${postgresSchema()}\n\nALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding vector;\n\nCREATE TABLE IF NOT EXISTS schema_migrations (\n  version INTEGER PRIMARY KEY,\n  applied_at BIGINT NOT NULL\n);\nINSERT INTO schema_migrations (version, applied_at) VALUES (1, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT) ON CONFLICT (version) DO NOTHING;\n`,
  "utf8"
);
console.log(`wrote ${sqliteTarget}`);
console.log(`wrote ${postgresTarget}`);
