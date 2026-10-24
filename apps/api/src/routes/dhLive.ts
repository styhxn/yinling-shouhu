import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ChatMessage } from "../services/llm/types.js";
import { ModelError } from "../services/llm/types.js";

const EbStreamSchema = z
  .object({
    input_mode: z.literal("text"),
    prompt: z.string().min(1).max(4000),
    voice_id: z.any().optional(),
    voice_speed: z.any().optional()
  })
  .passthrough();

export const dhLiveRoutes: FastifyPluginAsync = async (server) => {
  server.get("/health", async () => ({ ok: true }));

  server.post("/eb_stream", async (req, reply) => {
    const parsed = EbStreamSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const prompt = parsed.data.prompt.trim();
    if (!prompt) return reply.status(400).send({ error: "empty_prompt" });

    const profile = await server.store.getProfile().catch(() => null);
    const displayName =
      typeof profile?.displayName === "string" && profile.displayName.trim()
        ? profile.displayName.trim()
        : "用户";

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          `你是“银龄守护”的智能陪伴数字人，擅长用中文进行温暖、清晰、简洁的陪伴式对话。` +
          `面向长辈时要更口语、分点说明、少术语。` +
          `避免做出医疗诊断与用药建议；如果涉及健康风险，建议线下就医并给出一般性建议。`
      },
      { role: "user", content: `用户昵称：${displayName}\n用户问题：${prompt}` }
    ];

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache, no-transform"
    });

    let aborted = false;
    req.raw.on("close", () => {
      aborted = true;
    });

    const write = (payload: { text: string; audio: string; endpoint: boolean }) => {
      if (!aborted && !reply.raw.writableEnded) {
        reply.raw.write(`${JSON.stringify(payload)}\n`);
      }
    };

    const started = Date.now();
    let wroteText = false;
    try {
      for await (const event of server.modelRouter.chatStream({
        messages,
        temperature: 0.35,
        maxTokens: 900
      })) {
        if (aborted) break;
        if (event.type === "token" && event.text) {
          wroteText = true;
          write({ text: event.text, audio: "", endpoint: false });
        }
      }
      if (!wroteText) {
        write({ text: "我在呢，您慢慢说。", audio: "", endpoint: false });
      }
      write({ text: "", audio: "", endpoint: true });
      server.log.info(
        { module: "dh_live", provider: server.modelRouter.mode, latencyMs: Date.now() - started },
        "ai ok"
      );
    } catch (err) {
      const code = err instanceof ModelError ? err.code : "unknown_error";
      server.log.warn({ module: "dh_live", code }, "ai failed");
      write({ text: "我现在有点忙，请稍后再试。", audio: "", endpoint: true });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
};
