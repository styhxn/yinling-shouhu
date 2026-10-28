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
  { createModelRouter },
  { loadOrCreateMasterKey },
  { runEvaluation }
] = await Promise.all([
  import("../apps/api/src/config.js"),
  import("../apps/api/src/store/db.js"),
  import("../apps/api/src/services/llm/router.js"),
  import("../apps/api/src/services/crypto.js"),
  import("../apps/api/src/services/eval.js")
]);

const config = loadConfig();
const masterKey = config.masterKeyB64
  ? Buffer.from(config.masterKeyB64, "base64")
  : loadOrCreateMasterKey({ dataDir: config.dataDir });
if (masterKey.length !== 32) throw new Error("invalid_master_key");

const moduleArg = process.argv
  .find((item) => item.startsWith("--module="))
  ?.slice("--module=".length);
const modules = moduleArg
  ? moduleArg
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is "scam" | "story" => item === "scam" || item === "story")
  : undefined;

const db = createDb(config.dbPath, { masterKey, seed: config.demoMode });
try {
  const report = await runEvaluation({
    db,
    modelRouter: createModelRouter(config),
    ...(modules && modules.length > 0 ? { modules } : {})
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`评测运行 ${report.runId} · 模式 ${report.mode}`);
    for (const module of report.modules) {
      console.log(
        `- ${module.module}: ${module.passed}/${module.total} 通过 (${module.passRate}%) · ${module.durationMs}ms`
      );
      for (const [key, value] of Object.entries(module.metrics)) {
        console.log(`    ${key}: ${value}`);
      }
      for (const failure of module.failures) {
        console.log(`    ✗ ${failure.id}: ${failure.reasons.join("；")}`);
      }
    }
    console.log(
      `总体：${report.overall.passed}/${report.overall.total} 通过 (${report.overall.passRate}%)`
    );
  }

  const minPass = Number(process.env.EVAL_MIN_PASS ?? 80);
  if (report.overall.passRate < minPass) process.exitCode = 1;
} finally {
  db.close();
}
