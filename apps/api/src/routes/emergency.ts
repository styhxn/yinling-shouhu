import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const TriggerSchema = z.object({
  reason: z.string().min(1).max(200)
});

export const emergencyRoutes: FastifyPluginAsync = async (server) => {
  server.post("/trigger", async (req, reply) => {
    const parsed = TriggerSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const profile = await server.store.getProfile();

    server.eventBus.publish({
      type: "emergency.triggered",
      ts: Date.now(),
      payload: { reason: parsed.data.reason }
    });

    return { ok: true, profilePresent: Boolean(profile) };
  });
};

