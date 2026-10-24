import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { AskRequestSchema } from "@eha/shared";
import type { ChatMessage } from "../services/llm/types.js";
import { ModelError } from "../services/llm/types.js";

export const qaRoutes: FastifyPluginAsync = async (server) => {
  server.post("/ask", async (req, reply) => {
    const parsed = AskRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    const profile = await server.store.getProfile();
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是智伴银龄的健康生活陪伴助手，主要服务老年人。请用通俗、温和、简洁的中文回答日常生活与健康相关问题，给出生活化建议；明确说明你不是医生、不能替代专业诊断，若涉及疾病或紧急症状应建议就医。避免堆砌医疗术语。"
      },
      {
        role: "user",
        content: JSON.stringify({
          profile: profile ?? { displayName: "用户", gender: "other", age: 30 },
          question: parsed.data.question
        })
      }
    ];

    const started = Date.now();
    let content = "";
    try {
      for await (const event of server.modelRouter.chatStream({
        messages,
        temperature: 0.5,
        maxTokens: 800
      })) {
        if (event.type === "token") content += event.text;
      }
      if (!content.trim()) throw new ModelError("bad_response", "empty_response");

      server.log.info(
        { module: "qa", provider: server.modelRouter.mode, latencyMs: Date.now() - started },
        "ai ok"
      );
      server.eventBus.publish({
        type: "qa.answered",
        ts: Date.now(),
        payload: { question: parsed.data.question, answer: content }
      });
      return {
        answer: content,
        raw: content,
        provider: server.modelRouter.mode,
        conversationId: randomUUID()
      };
    } catch (err) {
      const code = err instanceof ModelError ? err.code : "unknown_error";
      const message = err instanceof Error ? err.message : "qa_failed";
      server.log.warn({ module: "qa", code, message }, "ai failed");
      return reply.status(503).send({ error: code, message });
    }
  });
};
