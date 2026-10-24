import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { callOpenAICompatibleChatWithFallback, ExternalServiceError, type OpenAICompatCandidate } from "../services/llm.js";

const LogFromSpeechSchema = z.object({
  text: z.string().min(1).max(2000)
});

function safeJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = trimmed.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

export const vitalityRoutes: FastifyPluginAsync = async (server) => {
  function buildCandidates(): OpenAICompatCandidate[] {
    const doubaoKey = process.env.ARK_API_KEY ?? process.env.DOUBAO_API_KEY ?? "";
    const rawDoubaoBaseUrl = process.env.ARK_BASE_URL ?? process.env.DOUBAO_BASE_URL ?? "";
    const doubaoBaseUrl = rawDoubaoBaseUrl.endsWith("/v3") ? `${rawDoubaoBaseUrl}/` : rawDoubaoBaseUrl;
    const doubaoModel = process.env.ARK_MODEL ?? process.env.DOUBAO_MODEL ?? "";

    const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";
    const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
    const deepseekModel = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

    const qwenKey = process.env.QWEN_API_KEY ?? "";
    const qwenRawBaseUrl = process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    const qwenBaseUrl = qwenRawBaseUrl.endsWith("/v1") ? `${qwenRawBaseUrl}/` : qwenRawBaseUrl;
    const qwenModel = process.env.QWEN_MODEL ?? "qwen-plus";

    const candidates: OpenAICompatCandidate[] = [];
    if (doubaoKey && doubaoBaseUrl && doubaoModel)
      candidates.push({ provider: "doubao", baseUrl: doubaoBaseUrl, apiKey: doubaoKey, model: doubaoModel });
    if (deepseekKey) candidates.push({ provider: "deepseek", baseUrl: deepseekBaseUrl, apiKey: deepseekKey, model: deepseekModel });
    if (qwenKey) candidates.push({ provider: "qwen", baseUrl: qwenBaseUrl, apiKey: qwenKey, model: qwenModel });
    return candidates;
  }

  server.post("/log-from-speech", async (req, reply) => {
    const parsed = LogFromSpeechSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const text = parsed.data.text.trim();
    if (!text) return reply.status(400).send({ error: "empty_text" });

    const profile = await server.store.getProfile();
    const metrics = await server.store.getRecentMetrics();
    const candidates = buildCandidates();
    if (candidates.length === 0) return reply.status(503).send({ error: "missing_config", message: "llm_missing_config" });

    const started = Date.now();
    try {
      const { provider, content } = await callOpenAICompatibleChatWithFallback({
        candidates,
        timeoutMs: 60000,
        temperature: 0.15,
        maxTokens: 400,
        messages: [
          {
            role: "system",
            content:
              "你是生活陪伴系统中的数据整理助手。根据用户用中文口述的一段话，从中提取与日常状态相关的数值信息，字段包括：steps(步数)、sleepHours(睡眠时长，小时)、activeMinutes(活动时长，分钟)、outdoorMinutes(户外时长，分钟)、moodScore(心情评分0-100)。输出格式为一个JSON对象，只包含上述字段以及一个summary字段用于简短总结，例如：{\"steps\":5000,\"sleepHours\":7.5,\"activeMinutes\":40,\"outdoorMinutes\":20,\"moodScore\":78,\"summary\":\"今天外出散步，睡眠略少，整体状态尚可\"}。没有信息的字段可以省略或设为null。避免使用医疗相关词汇。"
          },
          {
            role: "user",
            content: JSON.stringify({
              profile: profile ?? { displayName: "用户", gender: "other", age: 30 },
              text,
              recentMetrics: metrics
            })
          }
        ]
      });

      const latencyMs = Date.now() - started;
      server.log.info({ module: "vitality_log", provider, latencyMs }, "ai ok");

      const obj = safeJsonObject(content) ?? {};
      const out: Record<string, unknown> = typeof obj === "object" && obj !== null ? obj : {};

      const now = Date.now();
      const numericMetrics: { type: string; value: number; ts: number; source: string }[] = [];

      const steps = typeof out.steps === "number" && Number.isFinite(out.steps) ? out.steps : null;
      const sleepHours = typeof out.sleepHours === "number" && Number.isFinite(out.sleepHours) ? out.sleepHours : null;
      const activeMinutes = typeof out.activeMinutes === "number" && Number.isFinite(out.activeMinutes) ? out.activeMinutes : null;
      const outdoorMinutes =
        typeof out.outdoorMinutes === "number" && Number.isFinite(out.outdoorMinutes) ? out.outdoorMinutes : null;
      const moodScore = typeof out.moodScore === "number" && Number.isFinite(out.moodScore) ? out.moodScore : null;

      if (steps !== null) numericMetrics.push({ type: "steps", value: steps, ts: now, source: "speech" });
      if (sleepHours !== null) numericMetrics.push({ type: "sleepHours", value: sleepHours, ts: now, source: "speech" });
      if (activeMinutes !== null)
        numericMetrics.push({ type: "activeMinutes", value: activeMinutes, ts: now, source: "speech" });
      if (outdoorMinutes !== null)
        numericMetrics.push({ type: "outdoorMinutes", value: outdoorMinutes, ts: now, source: "speech" });
      if (moodScore !== null) numericMetrics.push({ type: "moodScore", value: moodScore, ts: now, source: "speech" });

      if (numericMetrics.length > 0) {
        await server.store.addMetrics(numericMetrics);
      }

      const summary = typeof out.summary === "string" ? out.summary : "";

      return reply.status(200).send({
        ok: true,
        provider,
        raw: content,
        parsed: {
          steps,
          sleepHours,
          activeMinutes,
          outdoorMinutes,
          moodScore,
          summary
        }
      });
    } catch (err) {
      const code = err instanceof ExternalServiceError ? err.code : "unknown_error";
      const message = err instanceof ExternalServiceError ? err.message : "vitality_log_failed";
      server.log.warn({ module: "vitality_log", code, message }, "ai failed");
      return reply.status(503).send({ error: code, message });
    }
  });

  server.get("/history", async () => {
    const history = await server.store.getVitalityHistory();
    return { ok: true, history };
  });

  server.post("/score", async (_req, reply) => {
    const metrics = await server.store.getRecentMetrics();
    const history = await server.store.getVitalityHistory();
    const candidates = buildCandidates();
    if (candidates.length === 0) return reply.status(503).send({ error: "missing_config", message: "llm_missing_config" });

    const started = Date.now();
    try {
      const { provider, content } = await callOpenAICompatibleChatWithFallback({
        candidates,
        timeoutMs: 60000,
        temperature: 0.25,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content:
              "你是生活陪伴系统中的“活力指数”助手。根据最近一段时间的行为数据（如步数、睡眠时长、活动时长、户外时长、心情评分等），给出一个0-100分的活力指数，并给出几条简短、生活化的提升建议。输出一个JSON对象，格式例如：{\"score\":82,\"suggestions\":[\"继续保持适度运动\",\"可以多安排一些户外活动\"]}。避免使用医疗相关词汇和诊断类表述。"
          },
          {
            role: "user",
            content: JSON.stringify({
              recentMetrics: metrics,
              vitalityHistory: history
            })
          }
        ]
      });

      const latencyMs = Date.now() - started;
      server.log.info({ module: "vitality_score", provider, latencyMs }, "ai ok");

      const obj = safeJsonObject(content) ?? {};
      const scoreRaw = typeof obj.score === "number" && Number.isFinite(obj.score) ? obj.score : 0;
      const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));
      const suggestions = Array.isArray(obj.suggestions)
        ? obj.suggestions.filter((x) => typeof x === "string").slice(0, 8)
        : [];

      const ts = Date.now();
      const entry = { ts, score, factors: suggestions };
      await server.store.addVitalityRecord(entry);
      const nextHistory = [...history, entry].slice(-365);

      const lastThree = nextHistory.slice(-3);
      if (lastThree.length === 3 && lastThree.every((h) => h.score < 40)) {
        server.eventBus.publish({
          type: "vitality.alert",
          ts,
          payload: { scores: lastThree.map((h) => h.score) }
        });
      }

      return reply.status(200).send({
        ok: true,
        provider,
        raw: content,
        score,
        suggestions,
        history: nextHistory
      });
    } catch (err) {
      const code = err instanceof ExternalServiceError ? err.code : "unknown_error";
      const message = err instanceof ExternalServiceError ? err.message : "vitality_score_failed";
      server.log.warn({ module: "vitality_score", code, message }, "ai failed");
      return reply.status(503).send({ error: code, message });
    }
  });
};
