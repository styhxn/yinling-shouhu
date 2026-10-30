import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth } from "../services/auth/rbac.js";

const QuerySchema = z.object({
  elderId: z.string().max(80).optional(),
  refresh: z.enum(["0", "1"]).optional()
});
const CheckSchema = z.object({
  food: z.string().min(1).max(80),
  elderId: z.string().max(80).optional()
});

export const dietRoutes: FastifyPluginAsync = async (server) => {
  server.get("/plan", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden", message: "请先绑定长辈" });
    const plan = await server.diet.dailyPlan(elderId, { refresh: query.data.refresh === "1" });
    return { ok: true, plan };
  });

  server.post("/check", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CheckSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "请告诉我菜名" });
    }
    const elderId = await resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden", message: "请先绑定长辈" });
    const result = await server.diet.checkFood(elderId, parsed.data.food.trim());
    return { ok: true, result };
  });
};
