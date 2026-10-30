import type { FastifyPluginAsync } from "fastify";
import { MockEmitRequestSchema } from "@eha/shared";
import { requireAuth } from "../services/auth/rbac.js";

export const mockRoutes: FastifyPluginAsync = async (server) => {
  server.post("/emit", { preHandler: requireAuth }, async (req, reply) => {
    if (!server.config.demoMode) {
      return reply.status(404).send({ error: "not_found" });
    }
    const parsed = MockEmitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    server.eventBus.publish({ ...parsed.data, ts: Date.now() });
    return { ok: true };
  });
};
