import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "packages", "shared", "src");
const targetDir = path.join(root, "frontend", "shared");
const files = ["index.ts", "schemas.ts", "types.ts"];

await fs.mkdir(targetDir, { recursive: true });
for (const file of files) {
  await fs.copyFile(path.join(sourceDir, file), path.join(targetDir, file));
  console.log(`synced ${file}`);
}
