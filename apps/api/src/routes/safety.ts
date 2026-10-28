import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { canAccessElder, requireAuth, requireRole } from "../services/auth/rbac.js";
import { analyzeScamHybrid } from "../services/safety/scamAI.js";
import { analyzeScamImage } from "../services/safety/scamImage.js";

const ScamCheckSchema = z
  .object({
    inputType: z.enum(["text", "url", "image"]),
    text: z.string().max(4000).optional(),
    url: z.string().max(500).optional(),
    imageId: z.string().min(1).max(80).optional()
  })
  .refine((value) => value.inputType !== "image" || Boolean(value.imageId), {
    message: "image_required"
  });

const SearchSchema = z.object({ query: z.string().min(1).max(500) });
const CoolingOffSchema = z.object({
  amount: z.number().positive().optional(),
  counterparty: z.string().max(100).optional(),
  reason: z.string().max(500).optional()
});
const CoolingOffRespondSchema = z.object({ action: z.enum(["cancel", "continue"]) });
const PendingQuerySchema = z.object({ elderId: z.string().max(80).optional() });
const ConfirmRespondSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().max(500).optional()
});

function resolveElderId(req: FastifyRequest, requested?: string): string | null {
  const user = req.user;
  if (!user) return null;
  if (user.role === "elder") return user.elderId ?? null;
  if (user.role === "family") {
    const candidate =
      requested ?? req.server.db.users.listFamilyLinks(user.userId)[0]?.elderId ?? null;
    if (!candidate) return null;
    return canAccessElder(req, candidate) ? candidate : null;
  }
  return null;
}

function dedupeSources(sources: { title: string; url: string }[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.title}|${source.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const safetyRoutes: FastifyPluginAsync = async (server) => {
  server.post("/scam/check", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ScamCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "请提供文字、链接或截图" });
    }
    const elderId = resolveElderId(req);
    if (!elderId) {
      return reply.code(403).send({ error: "forbidden", message: "请先绑定老人" });
    }

    if (parsed.data.inputType === "image") {
      const upload = server.db.uploads.getById(parsed.data.imageId ?? "");
      if (!upload) return reply.code(404).send({ error: "not_found", message: "图片不存在" });
      const user = req.user!;
      const allowed =
        upload.ownerUserId === user.userId ||
        (upload.elderId ? canAccessElder(req, upload.elderId) : false);
      if (!allowed) return reply.code(403).send({ error: "forbidden" });

      let buffer: Buffer;
      try {
        buffer = await fs.readFile(path.join(server.config.uploadsDir, upload.path));
      } catch {
        return reply.code(404).send({ error: "not_found", message: "图片文件不存在" });
      }

      const result = await analyzeScamImage({
        buffer,
        mime: upload.mime,
        modelRouter: server.modelRouter
      });
      const hits = result.extractedText
        ? await server.antiFraud.search(result.extractedText, 2)
        : [];
      const enriched = {
        ...result,
        sources: dedupeSources([...result.sources, ...hits.map((hit) => hit.source)])
      };
      server.db.scamChecks.insert({
        elderId,
        inputType: "image",
        inputText: result.extractedText ?? null,
        imageUploadId: upload.id,
        url: null,
        riskLevel: enriched.riskLevel,
        scamType: enriched.scamType,
        confidence: enriched.confidence,
        result: enriched,
        model: server.modelRouter.mode
      });
      return { ok: true, result: enriched, related: hits };
    }

    const query =
      parsed.data.inputType === "url"
        ? (parsed.data.url ?? "").trim()
        : (parsed.data.text ?? "").trim();
    if (!query) {
      return reply.code(400).send({ error: "invalid_body", message: "内容不能为空" });
    }

    const hits = await server.antiFraud.search(query, 3);
    const result = await analyzeScamHybrid({
      inputType: parsed.data.inputType,
      ...(parsed.data.text ? { text: parsed.data.text } : {}),
      ...(parsed.data.url ? { url: parsed.data.url } : {}),
      modelRouter: server.modelRouter,
      knowledge: hits
    });
    const enriched = {
      ...result,
      sources: dedupeSources([...result.sources, ...hits.map((hit) => hit.source)])
    };
    server.db.scamChecks.insert({
      elderId,
      inputType: parsed.data.inputType,
      inputText: parsed.data.text ?? null,
      url: parsed.data.url ?? null,
      riskLevel: enriched.riskLevel,
      scamType: enriched.scamType,
      confidence: enriched.confidence,
      result: enriched,
      model: server.modelRouter.mode
    });
    return { ok: true, result: enriched, related: hits };
  });

  server.post("/anti-fraud/search", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const items = await server.antiFraud.search(parsed.data.query, 5);
    return { ok: true, items };
  });

  server.post(
    "/cooling-off",
    { preHandler: requireRole("elder") },
    async (req, reply) => {
      const parsed = CoolingOffSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      const user = req.user!;
      if (!user.elderId) {
        return reply.code(403).send({ error: "forbidden", message: "当前账号未绑定老人" });
      }
      const result = server.coolingOff.start({
        elderId: user.elderId,
        userId: user.userId,
        ...(parsed.data.amount ? { amount: parsed.data.amount } : {}),
        ...(parsed.data.counterparty ? { counterparty: parsed.data.counterparty } : {}),
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {})
      });
      return { ok: true, ...result };
    }
  );

  server.post(
    "/cooling-off/:id/respond",
    { preHandler: requireRole("elder") },
    async (req, reply) => {
      const params = z.object({ id: z.string().min(1).max(80) }).safeParse(req.params);
      const body = CoolingOffRespondSchema.safeParse(req.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      const user = req.user!;
      if (!user.elderId) return reply.code(403).send({ error: "forbidden" });
      try {
        const coolingOff = server.coolingOff.respond({
          id: params.data.id,
          elderId: user.elderId,
          action: body.data.action
        });
        return { ok: true, coolingOff };
      } catch (err) {
        const code = err instanceof Error ? err.message : "failed";
        if (code === "not_found") return reply.code(404).send({ error: "not_found" });
        if (code === "already_responded") {
          return reply.code(409).send({ error: "already_responded" });
        }
        return reply.code(400).send({ error: "invalid_request" });
      }
    }
  );

  server.get(
    "/confirm/pending",
    { preHandler: requireRole("family") },
    async (req, reply) => {
      const query = PendingQuerySchema.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: "invalid_body" });
      const elderId = resolveElderId(req, query.data.elderId);
      if (!elderId) return reply.code(403).send({ error: "forbidden" });
      return { items: server.db.familyConfirms.listPending(elderId) };
    }
  );

  server.post(
    "/confirm/:id/respond",
    { preHandler: requireRole("family") },
    async (req, reply) => {
      const params = z.object({ id: z.string().min(1).max(80) }).safeParse(req.params);
      const body = ConfirmRespondSchema.safeParse(req.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      const confirm = server.db.familyConfirms.get(params.data.id);
      if (!confirm) return reply.code(404).send({ error: "not_found" });
      if (!canAccessElder(req, confirm.elderId)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (confirm.status !== "pending") {
        return reply.code(409).send({ error: "already_responded" });
      }

      const user = req.user!;
      server.db.familyConfirms.respond(
        confirm.id,
        body.data.decision,
        user.userId,
        body.data.note
      );
      server.db.auditLogs.insert({
        userId: user.userId,
        action: "family.confirm.respond",
        targetType: "family_confirm",
        targetId: confirm.id,
        meta: { decision: body.data.decision },
        ip: req.ip
      });
      const updated = { ...confirm, status: body.data.decision };
      server.eventBus.publish({
        type: "family.confirm.responded",
        ts: Date.now(),
        payload: { confirm: updated }
      });
      return { ok: true, confirm: updated };
    }
  );
};
