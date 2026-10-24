import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { canAccessElder, requireAuth, requireRole } from "../services/auth/rbac.js";

const MemoryCreateSchema = z.object({
  elderId: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(80),
  timeRange: z.string().max(40).nullable().optional(),
  place: z.string().max(80).nullable().optional(),
  people: z.array(z.string().min(1).max(30)).max(20).optional(),
  tags: z.array(z.string().min(1).max(20)).max(20).optional(),
  photoIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  transcript: z.string().min(1).max(5000),
  summary: z.string().max(500).nullable().optional(),
  visibility: z.enum(["private", "family", "public"]).optional(),
  consent: z.boolean()
});

const MemoryUpdateSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  timeRange: z.string().max(40).nullable().optional(),
  place: z.string().max(80).nullable().optional(),
  people: z.array(z.string().min(1).max(30)).max(20).optional(),
  tags: z.array(z.string().min(1).max(20)).max(20).optional(),
  photoIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  transcript: z.string().min(1).max(5000).optional(),
  summary: z.string().max(500).nullable().optional(),
  visibility: z.enum(["private", "family", "public"]).optional(),
  consent: z.boolean().optional()
});

const InterviewStartSchema = z.object({
  topic: z.string().max(20).optional(),
  photoId: z.string().max(80).optional()
});
const InterviewAnswerSchema = z.object({ text: z.string().min(1).max(4000) });
const StoryGenerateSchema = z.object({
  elderId: z.string().max(80).optional(),
  memoryIds: z.array(z.string().min(1).max(80)).min(1).max(10),
  style: z.string().max(40).optional()
});
const ListQuerySchema = z.object({
  elderId: z.string().max(80).optional(),
  q: z.string().max(100).optional()
});
const StoryQuerySchema = z.object({ elderId: z.string().max(80).optional() });
const IdParamsSchema = z.object({ id: z.string().min(1).max(80) });

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

export const memoryRoutes: FastifyPluginAsync = async (server) => {
  server.get("/items", { preHandler: requireAuth }, async (req, reply) => {
    const query = ListQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    let items = server.db.memories.listByElder(elderId);
    const keyword = query.data.q?.trim();
    if (keyword) {
      const lower = keyword.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(lower) ||
          (item.summary ?? "").toLowerCase().includes(lower) ||
          item.transcript.toLowerCase().includes(lower)
      );
    }
    return { items };
  });

  server.post("/items", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = MemoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "记忆内容不完整" });
    }
    const elderId = resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const item = server.db.memories.create({
      elderId,
      title: parsed.data.title,
      timeRange: parsed.data.timeRange ?? null,
      place: parsed.data.place ?? null,
      people: parsed.data.people ?? [],
      tags: parsed.data.tags ?? [],
      photoIds: parsed.data.photoIds ?? [],
      transcript: parsed.data.transcript,
      summary: parsed.data.summary ?? null,
      visibility: parsed.data.visibility ?? "family",
      consent: parsed.data.consent
    });
    return { item };
  });

  server.patch("/items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    const body = MemoryUpdateSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const current = server.db.memories.getById(params.data.id);
    if (!current || current.status === "deleted") {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!canAccessElder(req, current.elderId)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const patch = Object.fromEntries(
      Object.entries(body.data).filter(([, value]) => value !== undefined)
    ) as Parameters<typeof server.db.memories.update>[1];
    const item = server.db.memories.update(params.data.id, patch);
    return { item };
  });

  server.delete("/items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const current = server.db.memories.getById(params.data.id);
    if (!current || current.status === "deleted") {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!canAccessElder(req, current.elderId)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    server.db.memories.softDelete(current.id);
    server.db.auditLogs.insert({
      userId: req.user!.userId,
      action: "memory.delete",
      targetType: "memory",
      targetId: current.id,
      ip: req.ip
    });
    return { ok: true };
  });

  server.post(
    "/interview/start",
    { preHandler: requireRole("elder") },
    async (req, reply) => {
      const parsed = InterviewStartSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      const user = req.user!;
      if (!user.elderId) {
        return reply.code(403).send({ error: "forbidden", message: "当前账号未绑定老人" });
      }
      const result = server.interview.start({
        elderId: user.elderId,
        ...(parsed.data.topic ? { topic: parsed.data.topic } : {}),
        ...(parsed.data.photoId ? { photoId: parsed.data.photoId } : {})
      });
      return { ok: true, ...result };
    }
  );

  server.post(
    "/interview/:id/answer",
    { preHandler: requireRole("elder") },
    async (req, reply) => {
      const params = IdParamsSchema.safeParse(req.params);
      const body = InterviewAnswerSchema.safeParse(req.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      const user = req.user!;
      if (!user.elderId) return reply.code(403).send({ error: "forbidden" });
      try {
        const result = server.interview.answer({
          interviewId: params.data.id,
          elderId: user.elderId,
          text: body.data.text
        });
        return { ok: true, ...result };
      } catch (err) {
        const code = err instanceof Error ? err.message : "failed";
        if (code === "not_found") return reply.code(404).send({ error: "not_found" });
        if (code === "interview_closed") {
          return reply.code(409).send({ error: "interview_closed" });
        }
        if (code === "empty_answer") {
          return reply.code(400).send({ error: "invalid_body", message: "回答不能为空" });
        }
        return reply.code(400).send({ error: "invalid_request" });
      }
    }
  );

  server.post("/story/generate", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = StoryGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "请选择要整理的记忆" });
    }
    const elderId = resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      const result = await server.story.generate({
        elderId,
        memoryIds: parsed.data.memoryIds,
        ...(parsed.data.style ? { style: parsed.data.style } : {})
      });
      return { ok: true, ...result };
    } catch (err) {
      const code = err instanceof Error ? err.message : "failed";
      if (code === "no_memories") {
        return reply.code(400).send({ error: "invalid_body", message: "没有可用的记忆" });
      }
      return reply.code(500).send({ error: "story_failed" });
    }
  });

  server.get("/story", { preHandler: requireAuth }, async (req, reply) => {
    const query = StoryQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    return { ok: true, ...server.story.listByElder(elderId) };
  });

  server.get("/story/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const found = server.story.get(params.data.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!canAccessElder(req, found.book.elderId)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    return { ok: true, ...found };
  });

  server.post("/story/:id/audio", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const found = server.story.get(params.data.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!canAccessElder(req, found.book.elderId)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    // Server-side TTS is a later milestone; the client uses SpeechSynthesis.
    return {
      ok: true,
      audioUrl: null,
      mode: "browser_tts",
      text: found.chapter.content,
      message: "请在浏览器端使用语音朗读"
    };
  });
};
