import path from "node:path";

export type LlmMode = "mock" | "live";

export type LlmProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel?: string;
  embedModel?: string;
};

export type AppConfig = {
  env: string;
  port: number;
  host: string;
  logLevel: string;
  appBaseUrl: string;
  dataDir: string;
  dbPath: string;
  publicDir: string;
  webDistDir: string;
  uploadsDir: string;
  demoMode: boolean;
  demoResetToken: string;
  cookieName: string;
  cookieSecure: boolean;
  sessionSecret: string;
  sessionTtlMs: number;
  masterKeyB64: string;
  amapWebKey: string;
  corsOrigins: string[];
  trustProxy: boolean;
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    max: number;
    authMax: number;
    aiMax: number;
    uploadMax: number;
    locationMax: number;
  };
  retention: {
    locationDays: number;
    toolLogDays: number;
    auditDays: number;
    alertDays: number;
    posterDays: number;
  };
  llm: {
    mode: LlmMode;
    timeoutMs: number;
    maxRetries: number;
    providers: LlmProviderConfig[];
  };
};

export type ConfigOverrides = Partial<Omit<AppConfig, "llm">> & {
  llm?: Partial<AppConfig["llm"]>;
};

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function num(name: string, fallback: number) {
  const n = Number(env(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(name: string, fallback: boolean) {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function csv(name: string) {
  return env(name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function provider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel?: string;
  embedModel?: string;
}): LlmProviderConfig | null {
  if (!input.baseUrl || !input.apiKey || !input.model) return null;
  return {
    name: input.name,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    ...(input.visionModel ? { visionModel: input.visionModel } : {}),
    ...(input.embedModel ? { embedModel: input.embedModel } : {})
  };
}

function gatherProviders(): LlmProviderConfig[] {
  const list = [
    provider({
      name: "custom",
      baseUrl: env("LLM_BASE_URL"),
      apiKey: env("LLM_API_KEY"),
      model: env("LLM_MODEL"),
      visionModel: env("LLM_VISION_MODEL"),
      embedModel: env("LLM_EMBED_MODEL")
    }),
    provider({
      name: "deepseek",
      baseUrl: env("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
      apiKey: env("DEEPSEEK_API_KEY"),
      model: env("DEEPSEEK_MODEL") || "deepseek-chat",
      visionModel: env("LLM_VISION_MODEL"),
      embedModel: env("LLM_EMBED_MODEL")
    }),
    provider({
      name: "qwen",
      baseUrl: env("QWEN_BASE_URL") || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: env("QWEN_API_KEY"),
      model: env("QWEN_MODEL") || "qwen-plus",
      visionModel: env("LLM_VISION_MODEL") || "qwen-vl-plus",
      embedModel: env("LLM_EMBED_MODEL") || "text-embedding-v3"
    }),
    provider({
      name: "doubao",
      baseUrl: env("ARK_BASE_URL"),
      apiKey: env("ARK_API_KEY"),
      model: env("ARK_MODEL"),
      visionModel: env("LLM_VISION_MODEL"),
      embedModel: env("LLM_EMBED_MODEL")
    })
  ].filter((x): x is LlmProviderConfig => x !== null);

  const seen = new Set<string>();
  return list.filter((p) => {
    const key = `${p.name}:${p.baseUrl}:${p.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function loadConfig(overrides: ConfigOverrides = {}): AppConfig {
  const envName = overrides.env ?? (env("NODE_ENV") || "development");
  const dataDir = overrides.dataDir ?? path.resolve(process.cwd(), env("DATA_DIR") || "data");
  const publicDir = overrides.publicDir ?? path.resolve(process.cwd(), env("PUBLIC_DIR") || "public");
  const webDistDir =
    overrides.webDistDir ??
    path.resolve(process.cwd(), env("WEB_DIST_DIR") || path.join("..", "..", "frontend", "dist"));
  const providers = overrides.llm?.providers ?? gatherProviders();
  const shouldMock =
    envName === "test" || env("LLM_MOCK") === "1" || providers.length === 0;

  const sessionSecret =
    overrides.sessionSecret ??
    (env("SESSION_SECRET") || (envName === "production" ? "" : "dev-insecure-session-secret"));
  if (!sessionSecret) throw new Error("SESSION_SECRET is required in production");

  const appBaseUrl = overrides.appBaseUrl ?? (env("APP_BASE_URL") || "http://localhost:5173");
  const configuredOrigins = csv("CORS_ORIGINS");
  const defaultOrigins =
    envName === "production"
      ? [appBaseUrl]
      : [appBaseUrl, "http://localhost:5173", "http://127.0.0.1:5173"];
  const corsOrigins =
    overrides.corsOrigins ??
    Array.from(new Set(configuredOrigins.length ? configuredOrigins : defaultOrigins));
  const rawCookieSecure = env("COOKIE_SECURE");
  const cookieSecure =
    overrides.cookieSecure ??
    (rawCookieSecure ? bool("COOKIE_SECURE", true) : envName === "production");

  return {
    env: envName,
    port: overrides.port ?? num("PORT", 3100),
    host: overrides.host ?? (env("HOST") || "127.0.0.1"),
    logLevel: overrides.logLevel ?? (env("LOG_LEVEL") || "info"),
    appBaseUrl,
    dataDir,
    dbPath: overrides.dbPath ?? (env("DB_PATH") || path.join(dataDir, "app.db")),
    publicDir,
    webDistDir,
    uploadsDir: overrides.uploadsDir ?? path.join(publicDir, "uploads"),
    demoMode: overrides.demoMode ?? (env("DEMO_MODE") === "1" || envName === "test"),
    demoResetToken: overrides.demoResetToken ?? (env("DEMO_RESET_TOKEN") || "change-me"),
    cookieName: overrides.cookieName ?? "yl_session",
    cookieSecure,
    sessionSecret,
    sessionTtlMs: overrides.sessionTtlMs ?? num("SESSION_TTL_MS", 7 * 24 * 60 * 60 * 1000),
    masterKeyB64: overrides.masterKeyB64 ?? (env("MASTER_KEY") || env("APP_MASTER_KEY_B64")),
    amapWebKey: overrides.amapWebKey ?? (env("AMAP_WEB_KEY") || env("AMAP_API_KEY")),
    corsOrigins,
    trustProxy: overrides.trustProxy ?? bool("TRUST_PROXY", false),
    rateLimit: {
      enabled: overrides.rateLimit?.enabled ?? bool("RATE_LIMIT_ENABLED", true),
      windowMs: overrides.rateLimit?.windowMs ?? num("RATE_LIMIT_WINDOW_MS", 60_000),
      max: overrides.rateLimit?.max ?? num("RATE_LIMIT_MAX", 300),
      authMax: overrides.rateLimit?.authMax ?? num("RATE_LIMIT_AUTH_MAX", 20),
      aiMax: overrides.rateLimit?.aiMax ?? num("RATE_LIMIT_AI_MAX", 40),
      uploadMax: overrides.rateLimit?.uploadMax ?? num("RATE_LIMIT_UPLOAD_MAX", 20),
      locationMax: overrides.rateLimit?.locationMax ?? num("RATE_LIMIT_LOCATION_MAX", 120)
    },
    retention: {
      locationDays: overrides.retention?.locationDays ?? num("RETENTION_LOCATION_DAYS", 90),
      toolLogDays: overrides.retention?.toolLogDays ?? num("RETENTION_TOOL_LOG_DAYS", 30),
      auditDays: overrides.retention?.auditDays ?? num("RETENTION_AUDIT_DAYS", 180),
      alertDays: overrides.retention?.alertDays ?? num("RETENTION_ALERT_DAYS", 180),
      posterDays: overrides.retention?.posterDays ?? num("RETENTION_POSTER_DAYS", 7)
    },
    llm: {
      mode: overrides.llm?.mode ?? (shouldMock ? "mock" : "live"),
      timeoutMs: overrides.llm?.timeoutMs ?? num("LLM_TIMEOUT_MS", 20_000),
      maxRetries: overrides.llm?.maxRetries ?? num("LLM_MAX_RETRIES", 2),
      providers
    }
  };
}
