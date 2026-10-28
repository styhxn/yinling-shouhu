import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get("/health", async () => {
    return { ok: true };
  });

  server.get("/ready", async (_req, reply) => {
    try {
      await server.db.sql.ping();
      const vector = await server.vectorStore.status();
      return {
        ok: true,
        db: "ok",
        dbDriver: server.config.db.driver,
        vector,
        llm: server.config.llm.mode,
        demoMode: server.config.demoMode
      };
    } catch {
      return reply.code(503).send({ ok: false, db: "error" });
    }
  });
};

