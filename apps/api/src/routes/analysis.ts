import type { FastifyPluginAsync } from "fastify";
import {
  callOpenAICompatibleChatWithFallback,
  ExternalServiceError,
  type ChatMessage
} from "../services/llm.js";
import { buildQwenCandidates } from "../services/ai.js";

export const analysisRoutes: FastifyPluginAsync = async (server) => {
  server.get("/health", async (req, reply) => {
    const metrics = await server.store.getRecentMetrics();
    const history = await server.store.getVitalityHistory();
    const candidates = buildQwenCandidates();
    if (candidates.length === 0) {
      return reply.status(503).send({ error: "missing_config", message: "llm_missing_config" });
    }

    const latest: Record<string, number> = {};
    for (const m of metrics) {
      if (typeof latest[m.type] === "undefined" || m.ts > (latest[m.type] as number)) {
        latest[m.type] = m.value;
      }
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是健康数据分析助手。根据近期的步数、睡眠、活动、户外、心情等数据，用通俗中文给出一段简短的健康洞察与生活建议。避免诊断性表述。"
      },
      {
        role: "user",
        content: JSON.stringify({ recentMetrics: metrics, vitalityHistory: history })
      }
    ];

    try {
      const { provider, content } = await callOpenAICompatibleChatWithFallback({
        candidates,
        timeoutMs: 60000,
        temperature: 0.4,
        maxTokens: 800,
        messages
      });
      return reply.status(200).send({
        ok: true,
        insights: content,
        raw: content,
        provider,
        latest,
        metrics
      });
    } catch (err) {
      const code = err instanceof ExternalServiceError ? err.code : "unknown_error";
      const message = err instanceof ExternalServiceError ? err.message : "health_analysis_failed";
      return reply.status(503).send({ error: code, message });
    }
  });
};
