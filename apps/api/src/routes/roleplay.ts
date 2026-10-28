import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth } from "../services/auth/rbac.js";
import { createRoleplayService } from "../services/safety/roleplay.js";

const StartSchema = z.object({ scenarioId: z.string().min(1).max(40) });
const TurnSchema = z.object({ text: z.string().min(1).max(1000) });
const IdParamsSchema = z.object({ id: z.string().min(1).max(80) });

export const roleplayRoutes: FastifyPluginAsync = async (server) => {
  const roleplay = createRoleplayService(server.db, server.modelRouter);

  server.get("/scenarios", { preHandler: requireAuth }, async () => {
    return { items: roleplay.scenarios() };
  });

  server.post("/start", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = StartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, ...roleplay.start(elderId, parsed.data.scenarioId) };
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });

  server.post("/:id/turn", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    const body = TurnSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, ...(await roleplay.turn(params.data.id, elderId, body.data.text.trim())) };
    } catch (err) {
      const code = err instanceof Error ? err.message : "failed";
      if (code === "not_found") return reply.code(404).send({ error: "not_found" });
      if (code === "roleplay_closed") return reply.code(409).send({ error: "roleplay_closed" });
      return reply.code(400).send({ error: "invalid_request" });
    }
  });

  server.post("/:id/end", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, ...roleplay.end(params.data.id, elderId) };
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });
};
