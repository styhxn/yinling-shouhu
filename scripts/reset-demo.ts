import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "apps/api");

dotenv.config({ path: path.join(apiDir, ".env"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });
process.chdir(apiDir);

const [
  { loadConfig },
  { createDb },
  { createMysqlClient, createSqliteClient },
  { loadOrCreateMasterKey }
] = await Promise.all([
  import("../apps/api/src/config.js"),
  import("../apps/api/src/store/db.js"),
  import("../apps/api/src/store/sql.js"),
  import("../apps/api/src/services/crypto.js")
]);

const config = loadConfig();
if (!config.demoMode) {
  console.error("当前 DEMO_MODE 未开启，拒绝重置。演示重置只允许在演示环境执行。");
  process.exit(1);
}

const masterKey = config.masterKeyB64
  ? Buffer.from(config.masterKeyB64, "base64")
  : loadOrCreateMasterKey({ dataDir: config.dataDir });
if (masterKey.length !== 32) throw new Error("invalid_master_key");

const target =
  config.db.driver === "mysql"
    ? `MySQL ${new URL(config.db.url).host}${new URL(config.db.url).pathname}`
    : `SQLite ${config.dbPath}`;

if (!process.argv.includes("--yes")) {
  console.log(`将清空演示业务数据并重新生成种子：${target}`);
  console.log("这是预演，不会写入数据库。确认执行请追加 --yes：");
  console.log("  npm run reset:demo -- --yes");
  process.exit(0);
}

const sql =
  config.db.driver === "mysql"
    ? createMysqlClient({
        connectionString: config.db.url,
        max: config.db.poolMax,
        ssl: config.db.ssl
      })
    : createSqliteClient(config.dbPath);

const db = await createDb(sql, { masterKey, seed: false });
try {
  const result = await db.resetDemoData();
  console.log(`已重置 ${result.tables} 张业务表，并重新写入演示种子数据。`);
  console.log("登录状态会保留；刷新页面即可看到重置后的数据。");
} finally {
  await db.close();
}
