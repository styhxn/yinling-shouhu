import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { canAccessElder, requireAuth, requireRole } from "../services/auth/rbac.js";
import type { StoryFidelity } from "../store/db.js";

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
const ProfileQuerySchema = z.object({
  elderId: z.string().max(80).optional(),
  refresh: z.enum(["0", "1"]).optional()
});
const IdParamsSchema = z.object({ id: z.string().min(1).max(80) });


function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function storyBookHtml(input: {
  bookTitle: string;
  elderName: string;
  createdAt: number;
  chapters: { title: string; content: string; fidelity: StoryFidelity | null }[];
}) {
  const date = new Date(input.createdAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const chapters = input.chapters
    .map((chapter, index) => {
      const paragraphs = chapter.content
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("\n");
      const quotes = chapter.fidelity?.verifiedQuotes ?? [];
      const quotesHtml = quotes.length
        ? `<aside class="quotes">
    <h3>口述原话</h3>
    ${quotes
      .map(
        (quote) =>
          `<blockquote>“${escapeHtml(quote.text)}”<cite>《${escapeHtml(quote.sourceTitle)}》</cite></blockquote>`
      )
      .join("\n    ")}
  </aside>`
        : "";
      const warnings = chapter.fidelity?.warnings ?? [];
      const warningsHtml = warnings.length
        ? `<p class="warn">${warnings.map((warning) => escapeHtml(warning)).join(" ")}</p>`
        : "";
      const fidelityLine = chapter.fidelity
        ? `依据 ${chapter.fidelity.sources.length} 段口述 · 原文引语 ${quotes.length} 处 · 口述要点保留 ${chapter.fidelity.groundingPct}%`
        : "根据长辈口述整理，家人可修改。";
      return `<section class="chapter">
  <header><span class="no">第 ${index + 1} 篇</span><h2>${escapeHtml(chapter.title)}</h2></header>
  ${paragraphs}
  ${quotesHtml}
  ${warningsHtml}
  <footer>根据长辈口述整理，家人可修改。<br /><span class="basis">${fidelityLine}</span></footer>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.bookTitle)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #EDEFE8; color: #1C2724; font-family: "Songti SC", "STSong", "SimSun", serif; }
  .paper { max-width: 720px; margin: 0 auto; padding: 56px 64px; background: #FBFBF7; }
  .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; padding: 12px 0; background: #FBFBF7; }
  .toolbar button { border: 1px solid #5E7F71; background: transparent; color: #3F5A50; padding: 8px 16px; font: inherit; font-size: 14px; cursor: pointer; }
  .cover { min-height: 78vh; display: flex; flex-direction: column; justify-content: center; border-bottom: 1px solid #DDE3DA; padding-bottom: 56px; }
  .seal { display: inline-block; align-self: flex-start; padding: 6px 10px; border: 1px solid #8C3B2E; color: #8C3B2E; font-size: 12px; letter-spacing: 0.4em; }
  .kicker { margin: 28px 0 8px; color: #7A8983; font-size: 13px; letter-spacing: 0.3em; }
  .cover h1 { margin: 0 0 18px; font-size: 46px; font-weight: 600; line-height: 1.25; letter-spacing: 0.04em; }
  .cover .name { margin: 0; font-size: 18px; color: #3F5A50; }
  .cover .meta { margin: 6px 0 0; font-size: 13px; color: #7A8983; }
  .cover .note { margin-top: 40px; max-width: 30em; color: #7A8983; font-size: 12px; line-height: 1.9; }
  .chapter { padding: 56px 0; border-bottom: 1px solid #E7EBE4; }
  .chapter header { margin-bottom: 28px; }
  .chapter .no { color: #8C3B2E; font-size: 12px; letter-spacing: 0.25em; }
  .chapter h2 { margin: 10px 0 0; font-size: 30px; font-weight: 600; letter-spacing: 0.03em; }
  .chapter p { margin: 0 0 1.1em; font-size: 17px; line-height: 2; text-align: justify; }
  .chapter footer { margin-top: 32px; color: #8A968F; font-size: 12px; line-height: 1.8; }
  .chapter .basis { letter-spacing: 0.04em; }
  .quotes { margin: 28px 0; padding: 18px 22px; background: #F2F5EF; border-left: 3px solid #5E7F71; }
  .quotes h3 { margin: 0 0 10px; font-size: 14px; letter-spacing: 0.2em; color: #5E7F71; font-weight: 600; }
  .quotes blockquote { margin: 0 0 10px; font-size: 15px; line-height: 1.9; color: #33423D; }
  .quotes cite { display: block; margin-top: 4px; color: #8A968F; font-size: 12px; font-style: normal; }
  .chapter .warn { margin: 18px 0 0; padding: 10px 12px; background: #FBF2EF; color: #8C3B2E; font-size: 12px; line-height: 1.7; }
  .end { padding: 56px 0 8px; text-align: center; color: #5E7F71; }
  .end .note { color: #8A968F; font-size: 12px; letter-spacing: 0.2em; }
  @page { size: A4; margin: 20mm 18mm; }
  @media print {
    body { background: #fff; }
    .paper { padding: 0; max-width: none; }
    .toolbar { display: none; }
    .cover { min-height: 60vh; }
    .chapter { break-before: page; border-bottom: 0; }
  }
</style>
</head>
<body>
<main class="paper">
  <div class="toolbar"><button type="button" onclick="window.print()">打印 / 另存为 PDF</button></div>
  <section class="cover">
    <span class="seal">岁月</span>
    <p class="kicker">家庭记忆册</p>
    <h1>${escapeHtml(input.bookTitle)}</h1>
    <p class="name">${escapeHtml(input.elderName)} 口述</p>
    <p class="meta">整理于 ${escapeHtml(date)}</p>
    <p class="note">本册由长辈口述、家人整理，AI 仅协助润色。文中引语均逐字回查口述原文；其余润色内容请家人核对。各篇末尾附「口述原话」与口述要点保留率，便于溯源。</p>
  </section>
  ${chapters}
  <section class="end"><p>— 完 —</p><p class="note">银龄守护 · 家庭记忆</p></section>
</main>
</body>
</html>`;
}

export const memoryRoutes: FastifyPluginAsync = async (server) => {
  server.get("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const query = ProfileQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const profile = await server.memoryProfile.get(elderId, {
      refresh: query.data.refresh === "1"
    });
    const record = await server.db.memoryProfiles.getByElder(elderId);
    return { ok: true, profile, sourceCount: record?.sourceCount ?? 0 };
  });

  server.get("/items", { preHandler: requireAuth }, async (req, reply) => {
    const query = ListQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    let items = await server.db.memories.listByElder(elderId);
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
    const elderId = await resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const item = await server.db.memories.create({
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
    void server.memoryProfile.refresh(elderId).catch(() => undefined);
    return { item };
  });

  server.patch("/items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    const body = MemoryUpdateSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const current = await server.db.memories.getById(params.data.id);
    if (!current || current.status === "deleted") {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!(await canAccessElder(req, current.elderId))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const patch = Object.fromEntries(
      Object.entries(body.data).filter(([, value]) => value !== undefined)
    ) as Parameters<typeof server.db.memories.update>[1];
    const item = await server.db.memories.update(params.data.id, patch);
    void server.memoryProfile.refresh(current.elderId).catch(() => undefined);
    return { item };
  });

  server.delete("/items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const current = await server.db.memories.getById(params.data.id);
    if (!current || current.status === "deleted") {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!(await canAccessElder(req, current.elderId))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    await server.db.memories.softDelete(current.id);
    void server.memoryProfile.refresh(current.elderId).catch(() => undefined);
    await server.db.auditLogs.insert({
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
        return reply.code(403).send({ error: "forbidden", message: "当前账号未绑定长辈" });
      }
      const result = await server.interview.start({
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
        const result = await server.interview.answer({
          interviewId: params.data.id,
          elderId: user.elderId,
          text: body.data.text
        });
        if ((result as { done?: boolean }).done) {
          void server.memoryProfile.refresh(user.elderId).catch(() => undefined);
        }
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
    const elderId = await resolveElderId(req, parsed.data.elderId);
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
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    return { ok: true, ...(await server.story.listByElder(elderId)) };
  });

  server.get("/story/export", { preHandler: requireAuth }, async (req, reply) => {
    const query = StoryQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const { book, chapters } = await server.story.listByElder(elderId);
    if (!book || chapters.length === 0) {
      return reply.code(404).send({ error: "not_found", message: "还没有生成故事章节" });
    }

    const elder = await server.db.elders.getById(elderId);
    const html = storyBookHtml({
      bookTitle: book.title,
      elderName: elder?.displayName ?? "长辈",
      createdAt: book.createdAt,
      chapters
    });
    const filename = `${book.title}.html`.replace(/[\\/:*?"<>|]/g, "_");
    await server.db.auditLogs.insert({
      userId: req.user!.userId,
      action: "story.export",
      targetType: "story_book",
      targetId: book.id,
      ip: req.ip
    });
    return reply
      .type("text/html; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="story-book.html"; filename*=UTF-8''${encodeURIComponent(filename)}`
      )
      .send(html);
  });

  server.get("/story/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const found = await server.story.get(params.data.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!(await canAccessElder(req, found.book.elderId))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    return { ok: true, ...found };
  });

  server.post("/story/:id/audio", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const found = await server.story.get(params.data.id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!(await canAccessElder(req, found.book.elderId))) {
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
