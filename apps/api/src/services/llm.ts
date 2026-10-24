import crypto from "node:crypto";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type LlmProvider = "qwen" | "spark" | "doubao" | "deepseek";

export class ExternalServiceError extends Error {
  public readonly code:
    | "missing_config"
    | "timeout"
    | "rate_limited"
    | "bad_response"
    | "network_error"
    | "upstream_error";
  public readonly retryable: boolean;

  constructor(
    code:
      | "missing_config"
      | "timeout"
      | "rate_limited"
      | "bad_response"
      | "network_error"
      | "upstream_error",
    message: string,
    retryable: boolean
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function nowMs() {
  return Date.now();
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function randomJitter(ms: number) {
  return Math.floor(ms * (0.85 + Math.random() * 0.3));
}

function parseRetryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - nowMs());
  return null;
}

type RateLimiter = {
  take: () => Promise<void>;
};

function createTokenBucketRateLimiter({
  refillPerSecond,
  capacity
}: {
  refillPerSecond: number;
  capacity: number;
}): RateLimiter {
  let tokens = capacity;
  let last = nowMs();
  let chain = Promise.resolve();

  function refill() {
    const t = nowMs();
    const dt = Math.max(0, t - last);
    last = t;
    tokens = Math.min(capacity, tokens + (dt / 1000) * refillPerSecond);
  }

  async function takeOne() {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    const deficit = 1 - tokens;
    const waitMs = Math.ceil((deficit / refillPerSecond) * 1000);
    await sleepMs(waitMs);
    refill();
    tokens = Math.max(0, tokens - 1);
  }

  return {
    take: () => {
      chain = chain.then(takeOne);
      return chain;
    }
  };
}

const providerLimiters = new Map<LlmProvider, RateLimiter>();

function limiterFor(provider: LlmProvider) {
  const existing = providerLimiters.get(provider);
  if (existing) return existing;

  const rps = clamp(Number(process.env.LLM_RPS ?? 2), 0.2, 50);
  const burst = clamp(Number(process.env.LLM_BURST ?? 4), 1, 100);
  const limiter = createTokenBucketRateLimiter({ refillPerSecond: rps, capacity: burst });
  providerLimiters.set(provider, limiter);
  return limiter;
}

async function fetchJsonWithRetry<T>({
  provider,
  url,
  init,
  timeoutMs,
  maxRetries
}: {
  provider: LlmProvider;
  url: string;
  init: RequestInit;
  timeoutMs: number;
  maxRetries: number;
}): Promise<T> {
  const limiter = limiterFor(provider);
  const started = nowMs();
  const deadline = started + timeoutMs;

  let attempt = 0;
  let backoffMs = 150;

  while (true) {
    attempt += 1;
    await limiter.take();

    const remainingMs = deadline - nowMs();
    if (remainingMs <= 0) throw new ExternalServiceError("timeout", "upstream_timeout", true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
      const text = await res.text();

      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (res.status === 401 || res.status === 403) {
        throw new ExternalServiceError("missing_config", `upstream_auth_failed: ${res.status} ${text}`, false);
      }

      if (res.status === 429) {
        const waitMs = retryAfterMs ?? randomJitter(backoffMs);
        if (attempt > maxRetries) throw new ExternalServiceError("rate_limited", "upstream_rate_limited", true);
        await sleepMs(waitMs);
        backoffMs = Math.min(1200, backoffMs * 2);
        continue;
      }

      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 408;
        if (!retryable || attempt > maxRetries) {
          throw new ExternalServiceError("upstream_error", `upstream_${res.status}`, retryable);
        }
        await sleepMs(randomJitter(backoffMs));
        backoffMs = Math.min(1200, backoffMs * 2);
        continue;
      }

      return json as T;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) throw new ExternalServiceError("timeout", "upstream_timeout", true);
      if (attempt > maxRetries) throw new ExternalServiceError("network_error", "upstream_network_error", true);
      await sleepMs(randomJitter(backoffMs));
      backoffMs = Math.min(1200, backoffMs * 2);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function callOpenAICompatibleChat({
  provider,
  baseUrl,
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs
}: {
  provider: Exclude<LlmProvider, "spark">;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
}): Promise<string> {
  const url = new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  const json = await fetchJsonWithRetry<{
    choices?: Array<{ message?: { content?: string } }>;
    error?: any;
  }>({
    provider,
    url,
    timeoutMs,
    maxRetries: 2,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof temperature === "number" ? temperature : 0.4,
        max_tokens: typeof maxTokens === "number" ? maxTokens : 800
      })
    }
  });

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    const errorMsg = json?.error ? JSON.stringify(json.error) : "empty_response";
    throw new ExternalServiceError("bad_response", `upstream_bad_response: ${errorMsg}`, false);
  }
  return content.trim();
}

export type OpenAICompatProvider = Exclude<LlmProvider, "spark">;
export type OpenAICompatCandidate = { provider: OpenAICompatProvider; baseUrl: string; apiKey: string; model: string };

function isUnavailable(err: unknown) {
  if (!(err instanceof ExternalServiceError)) return true;
  if (err.code === "missing_config") return true;
  if (err.code === "timeout") return true;
  if (err.code === "network_error") return true;
  if (err.code === "rate_limited") return true;
  if (err.code === "upstream_error") return err.retryable;
  return false;
}

export async function callOpenAICompatibleChatWithFallback({
  candidates,
  messages,
  timeoutMs,
  temperature,
  maxTokens
}: {
  candidates: OpenAICompatCandidate[];
  messages: ChatMessage[];
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ provider: OpenAICompatProvider; content: string }> {
  let lastErr: unknown = null;
  for (const c of candidates) {
    if (!c.apiKey || !c.baseUrl || !c.model) continue;
    try {
      const content = await callOpenAICompatibleChat({
        provider: c.provider,
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        model: c.model,
        messages,
        timeoutMs,
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(typeof maxTokens === "number" ? { maxTokens } : {})
      });
      return { provider: c.provider, content };
    } catch (err) {
      lastErr = err;
      if (!isUnavailable(err)) throw err;
    }
  }
  if (lastErr) throw lastErr;
  throw new ExternalServiceError("missing_config", "fallback_missing_config", false);
}

export async function callDeepseekWithFallbackToDoubao({
  deepseek,
  doubao,
  messages,
  timeoutMs,
  temperature,
  maxTokens
}: {
  deepseek: { baseUrl: string; apiKey: string; model: string } | null;
  doubao: { baseUrl: string; apiKey: string; model: string } | null;
  messages: ChatMessage[];
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ provider: "deepseek" | "doubao"; content: string }> {
  if (deepseek?.apiKey) {
    try {
      const content = await callOpenAICompatibleChat({
        provider: "deepseek",
        baseUrl: deepseek.baseUrl,
        apiKey: deepseek.apiKey,
        model: deepseek.model,
        messages,
        timeoutMs,
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(typeof maxTokens === "number" ? { maxTokens } : {})
      });
      return { provider: "deepseek", content };
    } catch (err) {
      if (!isUnavailable(err)) throw err;
    }
  }

  if (!doubao?.apiKey) throw new ExternalServiceError("missing_config", "fallback_missing_config", false);
  const content = await callOpenAICompatibleChat({
    provider: "doubao",
    baseUrl: doubao.baseUrl,
    apiKey: doubao.apiKey,
    model: doubao.model,
    messages,
    timeoutMs,
    ...(typeof temperature === "number" ? { temperature } : {}),
    ...(typeof maxTokens === "number" ? { maxTokens } : {})
  });
  return { provider: "doubao", content };
}

function rfc1123Date() {
  return new Date().toUTCString();
}

function createSparkAuthUrl({
  apiKey,
  apiSecret,
  url
}: {
  apiKey: string;
  apiSecret: string;
  url: string;
}) {
  const u = new URL(url);
  const host = u.host;
  const path = u.pathname;
  const date = rfc1123Date();

  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signatureSha = crypto.createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");

  u.searchParams.set("authorization", authorization);
  u.searchParams.set("date", date);
  u.searchParams.set("host", host);
  return u.toString();
}

export async function callSparkChat({
  appId,
  apiKey,
  apiSecret,
  url,
  domain,
  messages,
  timeoutMs
}: {
  appId: string;
  apiKey: string;
  apiSecret: string;
  url: string;
  domain: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<string> {
  const limiter = limiterFor("spark");
  await limiter.take();

  const Ws = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!Ws) {
    throw new ExternalServiceError("missing_config", "spark_websocket_unavailable", false);
  }

  const wsUrl = createSparkAuthUrl({ apiKey, apiSecret, url });
  const started = nowMs();

  return await new Promise<string>((resolve, reject) => {
    let done = false;
    let acc = "";

    const ws = new Ws(wsUrl);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        undefined;
      }
      reject(new ExternalServiceError("timeout", "spark_timeout", true));
    }, timeoutMs);

    function finishOk(text: string) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        undefined;
      }
      const out = text.trim();
      if (!out) {
        reject(new ExternalServiceError("bad_response", "spark_empty_response", false));
        return;
      }
      resolve(out);
    }

    function finishErr(err: unknown) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        undefined;
      }
      if (err instanceof ExternalServiceError) reject(err);
      else reject(new ExternalServiceError("network_error", "spark_network_error", true));
    }

    ws.onopen = () => {
      const payload = {
        header: { app_id: appId, uid: "local" },
        parameter: {
          chat: {
            domain,
            temperature: 0.3,
            max_tokens: 1024,
            auditing: "default"
          }
        },
        payload: {
          message: {
            text: messages.map((m) => ({ role: m.role, content: m.content }))
          }
        }
      };
      ws.send(JSON.stringify(payload));
    };

    ws.onerror = () => finishErr(new Error("spark_ws_error"));

    ws.onmessage = (evt) => {
      try {
        const data = typeof evt.data === "string" ? evt.data : "";
        const json = data ? (JSON.parse(data) as any) : null;
        const code = json?.header?.code;
        const status = json?.header?.status;
        if (typeof code === "number" && code !== 0) {
          finishErr(new ExternalServiceError("upstream_error", `spark_${code}`, false));
          return;
        }
        const chunk = json?.payload?.choices?.text?.[0]?.content;
        if (typeof chunk === "string") acc += chunk;
        if (status === 2) finishOk(acc);
      } catch {
        finishErr(new ExternalServiceError("bad_response", "spark_bad_response", false));
      }
    };

    ws.onclose = () => {
      if (done) return;
      const elapsed = nowMs() - started;
      if (elapsed > timeoutMs - 10) return;
      finishErr(new ExternalServiceError("network_error", "spark_closed", true));
    };
  });
}
