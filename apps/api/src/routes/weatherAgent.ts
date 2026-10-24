import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../services/auth/rbac.js";

const QuerySchema = z.object({
  location: z.string().min(1).max(64).default("南京")
});

export const weatherAgentRoutes: FastifyPluginAsync = async (server) => {
  server.get("/today", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const weather = await server.weather.getToday(parsed.data.location);
    return { ok: true, weather };
  });
};
