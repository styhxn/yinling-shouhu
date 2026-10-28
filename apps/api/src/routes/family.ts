import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth } from "../services/auth/rbac.js";
import { createFamilyService } from "../services/family/family.js";

const QuerySchema = z.object({ elderId: z.string().max(80).optional() });

export const familyRoutes: FastifyPluginAsync = async (server) => {
  const family = createFamilyService(server.db);

  server.get("/summary", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, summary: await family.summary(elderId) };
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });

  server.get("/report/weekly", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, report: await family.weeklyReport(elderId) };
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });
};
