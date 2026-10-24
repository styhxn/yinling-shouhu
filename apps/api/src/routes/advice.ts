import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  callOpenAICompatibleChatWithFallback,
  ExternalServiceError,
  type ChatMessage
} from "../services/llm.js";
import { buildQwenCandidates } from "../services/ai.js";

const SymptomsSchema = z.object({ symptoms: z.string().max(2000).optional() });
const GoalSchema = z.object({ goal: z.string().max(500).optional() });
const MealsSchema = z.object({ meals: z.string().min(1).max(2000) });
const PreferencesSchema = z.object({ preferences: z.string().max(500).optional() });

function safeJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function errBody(err: unknown) {
  const code = err instanceof ExternalServiceError ? err.code : "unknown_error";
  const message = err instanceof ExternalServiceError ? err.message : "advice_failed";
  return { error: code, message };
}

export const adviceRoutes: FastifyPluginAsync = async (server) => {
  async function askLlm(system: string, user: string, maxTokens = 800) {
    const candidates = buildQwenCandidates();
    if (candidates.length === 0) {
      throw new ExternalServiceError("missing_config", "llm_missing_config", false);
    }
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user }
    ];
    return await callOpenAICompatibleChatWithFallback({
      candidates,
      timeoutMs: 60000,
      temperature: 0.4,
      maxTokens,
      messages
    });
  }

  server.post("/generate", async (req, reply) => {
    const parsed = SymptomsSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    const profile = await server.store.getProfile();
    try {
      const { provider, content } = await askLlm(
        "你是健康生活建议助手。根据用户资料与描述的身体感受/症状，给出风险等级与几点生活化建议。必须明确你不是医生、不能诊断，若有明确或紧急症状应建议尽快就医。输出一个 JSON：{\"riskLevel\":\"low|medium|high\",\"advice\":[\"建议1\",\"建议2\"]}。",
        JSON.stringify({ profile: profile ?? null, symptoms: parsed.data.symptoms ?? "" })
      );
      const obj = safeJsonObject(content);
      const riskLevel =
        obj?.riskLevel === "high" || obj?.riskLevel === "medium" || obj?.riskLevel === "low"
          ? (obj.riskLevel as "low" | "medium" | "high")
          : "low";
      const advice = Array.isArray(obj?.advice)
        ? obj.advice.filter((x: unknown) => typeof x === "string").slice(0, 8)
        : [];
      return reply.status(200).send({ ok: true, provider, raw: content, structured: { riskLevel, advice } });
    } catch (err) {
      return reply.status(503).send(errBody(err));
    }
  });

  server.post("/checkup-plan", async (req, reply) => {
    const parsed = GoalSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    const profile = await server.store.getProfile();
    try {
      const { provider, content } = await askLlm(
        "你是健康管理助手。根据用户资料与目标，给出一份日常自我健康监测/体检计划建议，生活化、可执行。中文，避免诊断性表述。",
        JSON.stringify({ profile: profile ?? null, goal: parsed.data.goal ?? "" })
      );
      return reply.status(200).send({ ok: true, provider, raw: content });
    } catch (err) {
      return reply.status(503).send(errBody(err));
    }
  });

  server.post("/diet-evaluate", async (req, reply) => {
    const parsed = MealsSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    const profile = await server.store.getProfile();
    try {
      const { provider, content } = await askLlm(
        "你是营养评估助手。根据用户资料与今日饮食描述，给出通俗易懂的膳食评价与改善建议。中文，避免诊断。",
        JSON.stringify({ profile: profile ?? null, meals: parsed.data.meals })
      );
      return reply.status(200).send({ ok: true, provider, raw: content });
    } catch (err) {
      return reply.status(503).send(errBody(err));
    }
  });

  server.post("/meal-recommend", async (req, reply) => {
    const parsed = PreferencesSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    const profile = await server.store.getProfile();
    try {
      const { provider, content } = await askLlm(
        "你是膳食推荐助手。根据用户资料与饮食偏好，推荐几款适合的日常食谱或食材搭配，清淡、易消化、适合中老年人。中文。",
        JSON.stringify({ profile: profile ?? null, preferences: parsed.data.preferences ?? "" })
      );
      return reply.status(200).send({ ok: true, provider, raw: content });
    } catch (err) {
      return reply.status(503).send(errBody(err));
    }
  });
};
