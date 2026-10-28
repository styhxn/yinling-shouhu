import fs from "node:fs";
import path from "node:path";
import { MYSQL_SCHEMA_SQL, SCHEMA_SQL } from "../apps/api/src/store/migrations.js";

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

const mysqlHeader = `-- 银龄守护 MySQL 8 schema
-- 由 apps/api/src/store/migrations.ts 生成，请勿手工修改。
-- 重新生成：npm run db:schema
--
-- 说明：后端启动时会自动执行同一份迁移；本文件用于 DBA 审计或手动建库。
-- 手动初始化：mysql -u root -p yinling < docs/schema.mysql.sql
-- 需要 MySQL 8.0+；业务时间戳统一为 BIGINT（毫秒），字符集 utf8mb4。

SET NAMES utf8mb4;
`;

const sqliteTarget = path.resolve("docs/schema.sql");
const mysqlTarget = path.resolve("docs/schema.mysql.sql");
fs.writeFileSync(
  sqliteTarget,
  `${sqliteHeader}${SCHEMA_SQL}\n\nPRAGMA user_version = 1;\n`,
  "utf8"
);
fs.writeFileSync(mysqlTarget, `${mysqlHeader}${MYSQL_SCHEMA_SQL}\n`, "utf8");
console.log(`wrote ${sqliteTarget}`);
console.log(`wrote ${mysqlTarget}`);
