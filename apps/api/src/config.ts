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
  uploadsDir: string;
  demoMode: boolean;
  demoResetToken: string;
  cookieName: string;
  sessionSecret: string;
  sessionTtlMs: number;
  masterKeyB64: string;
  amapWebKey: string;
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
  const publicDir = overrides.publicDir ?? path.resolve(process.cwd(), "public");
  const providers = overrides.llm?.providers ?? gatherProviders();
  const shouldMock =
    envName === "test" || env("LLM_MOCK") === "1" || providers.length === 0;

  const sessionSecret =
    overrides.sessionSecret ??
    (env("SESSION_SECRET") || (envName === "production" ? "" : "dev-insecure-session-secret"));
  if (!sessionSecret) throw new Error("SESSION_SECRET is required in production");

  return {
    env: envName,
    port: overrides.port ?? num("PORT", 3100),
    host: overrides.host ?? (env("HOST") || "127.0.0.1"),
    logLevel: overrides.logLevel ?? (env("LOG_LEVEL") || "info"),
    appBaseUrl: overrides.appBaseUrl ?? (env("APP_BASE_URL") || "http://localhost:5173"),
    dataDir,
    dbPath: overrides.dbPath ?? (env("DB_PATH") || path.join(dataDir, "app.db")),
    publicDir,
    uploadsDir: overrides.uploadsDir ?? path.join(publicDir, "uploads"),
    demoMode: overrides.demoMode ?? (env("DEMO_MODE") === "1" || envName === "test"),
    demoResetToken: overrides.demoResetToken ?? (env("DEMO_RESET_TOKEN") || "change-me"),
    cookieName: overrides.cookieName ?? "yl_session",
    sessionSecret,
    sessionTtlMs: overrides.sessionTtlMs ?? num("SESSION_TTL_MS", 7 * 24 * 60 * 60 * 1000),
    masterKeyB64: overrides.masterKeyB64 ?? (env("MASTER_KEY") || env("APP_MASTER_KEY_B64")),
    amapWebKey: overrides.amapWebKey ?? (env("AMAP_WEB_KEY") || env("AMAP_API_KEY")),
    llm: {
      mode: overrides.llm?.mode ?? (shouldMock ? "mock" : "live"),
      timeoutMs: overrides.llm?.timeoutMs ?? num("LLM_TIMEOUT_MS", 20_000),
      maxRetries: overrides.llm?.maxRetries ?? num("LLM_MAX_RETRIES", 2),
      providers
    }
  };
}
