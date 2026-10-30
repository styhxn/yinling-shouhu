import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth } from "../services/auth/rbac.js";

const ProfileBodySchema = z.object({
  conditions: z.array(z.string().min(1).max(30)).max(12),
  allergies: z.array(z.string().min(1).max(30)).max(12),
  dietNotes: z.string().max(200).nullable().optional(),
  homeAddress: z.string().max(200).nullable().optional()
});

const QuerySchema = z.object({ elderId: z.string().max(80).optional() });

export const healthProfileRoutes: FastifyPluginAsync = async (server) => {
  server.get("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden", message: "请先绑定长辈" });
    const profile = await server.db.healthProfiles.getByElder(elderId);
    return {
      ok: true,
      profile: profile ?? {
        elderId,
        conditions: [],
        allergies: [],
        dietNotes: null,
        homeAddress: null,
        updatedAt: 0
      }
    };
  });

  server.put("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ProfileBodySchema.safeParse(req.body);
    const query = QuerySchema.safeParse(req.query);
    if (!parsed.success || !query.success) {
      return reply.code(400).send({ error: "invalid_body", message: "健康档案格式不正确" });
    }
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden", message: "请先绑定长辈" });

    const profile = await server.db.healthProfiles.upsert({
      elderId,
      conditions: parsed.data.conditions.map((item) => item.trim()).filter(Boolean),
      allergies: parsed.data.allergies.map((item) => item.trim()).filter(Boolean),
      dietNotes: parsed.data.dietNotes?.trim() || null,
      homeAddress: parsed.data.homeAddress?.trim() || null
    });
    await server.db.auditLogs.insert({
      userId: req.user!.userId,
      action: "health.profile.update",
      targetType: "elder",
      targetId: elderId,
      meta: {
        conditions: profile.conditions,
        allergies: profile.allergies
      },
      ip: req.ip
    });
    return { ok: true, profile };
  });
};
