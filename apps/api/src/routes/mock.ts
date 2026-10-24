import type { FastifyPluginAsync } from "fastify";
import { MockEmitRequestSchema } from "@eha/shared";

export const mockRoutes: FastifyPluginAsync = async (server) => {
  server.post("/emit", async (req, reply) => {
    const parsed = MockEmitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    server.eventBus.publish({ ...parsed.data, ts: Date.now() });
    return { ok: true };
  });
};
