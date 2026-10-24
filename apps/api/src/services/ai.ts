import type { OpenAICompatCandidate } from "./llm.js";

// 仅使用已配置的通义千问（免费，经 moma.cmecloud.cn 网关）。
// 不读取任何其他 provider 的 key，确保不引入付费 API。
export function buildQwenCandidates(): OpenAICompatCandidate[] {
  const key = process.env.QWEN_API_KEY ?? "";
  const rawBaseUrl = process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const baseUrl = rawBaseUrl.endsWith("/v1") ? `${rawBaseUrl}/` : rawBaseUrl;
  const model = process.env.QWEN_MODEL ?? "qwen-plus";
  if (key && baseUrl && model) {
    return [{ provider: "qwen", baseUrl, apiKey: key, model }];
  }
  return [];
}
