import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const server = await createServer();

try {
  await server.listen({ port: server.config.port, host: server.config.host });
  server.log.info(
    {
      host: server.config.host,
      port: server.config.port,
      db: server.config.dbPath,
      llm: server.config.llm.mode,
      demo: server.config.demoMode
    },
    "api started"
  );
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
