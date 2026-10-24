import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get("/health", async () => {
    return { ok: true };
  });

  server.get("/ready", async (_req, reply) => {
    try {
      server.db.raw.prepare("SELECT 1 AS ok").get();
      return {
        ok: true,
        db: "ok",
        llm: server.config.llm.mode,
        demoMode: server.config.demoMode
      };
    } catch {
      return reply.code(503).send({ ok: false, db: "error" });
    }
  });
};

