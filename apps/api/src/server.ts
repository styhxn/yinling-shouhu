import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import type { ConfigOverrides, AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { registerRoutes } from "./routes/index.js";
import { createAgentRunner, type AgentRunner } from "./services/agent/runner.js";
import { createAgentRuntime, type AgentRuntime } from "./services/agent/runtime.js";
import { createBriefService, type BriefService } from "./services/agent/brief.js";
import { createProactiveAgent, type ProactiveAgent } from "./services/agent/proactive.js";
import { createToolRegistry, type ToolRegistry } from "./services/agent/tools.js";
import { readCookie, verifySessionToken } from "./services/auth/session.js";
import type { SessionUser } from "./services/auth/types.js";
import { loadOrCreateMasterKey } from "./services/crypto.js";
import { createEventBus } from "./services/eventBus.js";
import { createLocationService } from "./services/location/location.js";
import { createModelRouter } from "./services/llm/router.js";
import type { ModelRouter } from "./services/llm/types.js";
import { createRateLimiter } from "./services/rateLimit.js";
import { createInterviewService, type InterviewService } from "./services/memory/interview.js";
import { createMemoryProfileService, type MemoryProfileService } from "./services/memory/profile.js";
import { createStoryService, type StoryService } from "./services/memory/story.js";
import { createAntiFraudService, type AntiFraudService } from "./services/safety/antiFraud.js";
import { createCoolingOffService, type CoolingOffService } from "./services/safety/coolingOff.js";
import { createStore } from "./services/store.js";
import { createWeatherService } from "./services/weather.js";
import { createDb, type AppDb } from "./store/db.js";

export type CreateServerOptions = {
  config?: ConfigOverrides;
};

export async function createServer(options: CreateServerOptions = {}) {
  const config = loadConfig(options.config ?? {});
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.publicDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const masterKey = config.masterKeyB64
    ? Buffer.from(config.masterKeyB64, "base64")
    : loadOrCreateMasterKey({ dataDir: config.dataDir });
  if (masterKey.length !== 32) throw new Error("invalid_master_key");

  const db = createDb(config.dbPath, { masterKey, seed: config.demoMode });
  const store = await createStore({ dataDir: config.dataDir, masterKey });
  const eventBus = createEventBus();
  const modelRouter = createModelRouter(config);
  const rateLimiter = createRateLimiter(config.rateLimit.enabled);
  const weather = createWeatherService(config);
  const location = createLocationService(db);
  const antiFraud = createAntiFraudService(modelRouter);
  const coolingOff = createCoolingOffService({ db, eventBus });
  const interview = createInterviewService(db, modelRouter);
  const story = createStoryService(db, modelRouter);
  const toolRegistry = createToolRegistry({
    db,
    store,
    config,
    eventBus,
    weather,
    location,
    antiFraud,
    coolingOff,
    modelRouter
  });
  const memoryProfile = createMemoryProfileService(db, modelRouter);
  const agentRuntime = createAgentRuntime({ db, modelRouter, toolRegistry });
  const brief = createBriefService({ db, runtime: agentRuntime, memoryProfile });
  const proactive = createProactiveAgent({
    db,
    eventBus,
    runtime: agentRuntime,
    memoryProfile
  });
  const agent = createAgentRunner({
    db,
    store,
    config,
    modelRouter,
    toolRegistry,
    eventBus,
    memoryProfile
  });

  const server = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel
    }
  });

  server.decorateRequest("user", null);
  server.decorate("config", config);
  server.decorate("db", db);
  server.decorate("eventBus", eventBus);
  server.decorate("store", store);
  server.decorate("modelRouter", modelRouter);
  server.decorate("rateLimiter", rateLimiter);
  server.decorate("toolRegistry", toolRegistry);
  server.decorate("agent", agent);
  server.decorate("agentRuntime", agentRuntime);
  server.decorate("brief", brief);
  server.decorate("proactive", proactive);
  server.decorate("memoryProfile", memoryProfile);
  server.decorate("antiFraud", antiFraud);
  server.decorate("coolingOff", coolingOff);
  server.decorate("weather", weather);
  server.decorate("interview", interview);
  server.decorate("story", story);

  server.addHook("onRequest", async (req, reply) => {
    const token = readCookie(req.headers.cookie, config.cookieName);
    req.user = token ? verifySessionToken(token, config.sessionSecret) : null;
    reply.header("x-request-id", req.id);
  });

  server.addHook("onRequest", async (req, reply) => {
    if (!config.rateLimit.enabled || req.method === "OPTIONS") return;
    const pathname = req.url.split("?")[0] ?? "";
    if (
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/qa") &&
      !pathname.startsWith("/dh-live-api")
    ) {
      return;
    }

    const isAiPath =
      pathname === "/api/agent/chat" ||
      pathname === "/api/agent/brief" ||
      pathname === "/qa/ask" ||
      pathname.startsWith("/dh-live-api") ||
      pathname.startsWith("/api/memory/interview") ||
      pathname === "/api/memory/story/generate" ||
      pathname === "/api/safety/scam/check" ||
      pathname.startsWith("/api/safety/roleplay");
    const bucket = pathname === "/api/auth/demo-login"
      ? { name: "auth", max: config.rateLimit.authMax }
      : isAiPath
        ? { name: "ai", max: config.rateLimit.aiMax }
        : pathname === "/api/uploads"
          ? { name: "upload", max: config.rateLimit.uploadMax }
          : pathname === "/api/safety/location"
            ? { name: "location", max: config.rateLimit.locationMax }
            : { name: "default", max: config.rateLimit.max };

    const result = rateLimiter.consume(`${bucket.name}:${req.ip}`, {
      max: bucket.max,
      windowMs: config.rateLimit.windowMs
    });
    reply.header("x-ratelimit-limit", bucket.max);
    reply.header("x-ratelimit-remaining", result.remaining);
    reply.header("x-ratelimit-reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      return reply
        .code(429)
        .header("retry-after", String(retryAfter))
        .send({
          error: "rate_limited",
          message: "操作太频繁，请稍后再试",
          retryAfter
        });
    }
  });

  await server.register(fastifyStatic, {
    root: config.publicDir,
    prefix: "/public/"
  });

  await server.register(cors, {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "accept", "x-request-id"],
    maxAge: 86_400
  });

  await server.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  await server.register(websocket);

  server.addHook("onSend", async (_req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
    reply.header(
      "permissions-policy",
      "geolocation=(self), microphone=(self), camera=()"
    );
    if (config.env === "production") {
      reply.header(
        "content-security-policy",
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          "font-src 'self' data:",
          "connect-src 'self' ws: wss:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join("; ")
      );
    }
    return payload;
  });

  server.setErrorHandler((error, request, reply) => {
    const err = error as { message?: string; code?: string; statusCode?: number };
    if (err.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      reply.status(400).send({
        error: "invalid_body",
        message: "Body cannot be empty when Content-Type is set to 'application/json'"
      });
      return;
    }

    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    request.log.error(
      {
        requestId: request.id,
        code: err.code,
        message: err.message
      },
      "request failed"
    );

    if (status >= 500) {
      reply.status(500).send({
        error: "internal_error",
        message: "服务暂时不可用",
        requestId: request.id
      });
      return;
    }

    reply.status(status).send({
      error: "bad_request",
      message: err.message ?? "bad_request",
      requestId: request.id
    });
  });

  await registerRoutes(server);
  const stopProactive = proactive.start();

  const webIndex = path.join(config.webDistDir, "index.html");
  if (config.env === "production" && fs.existsSync(webIndex)) {
    await server.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: "/",
      wildcard: false,
      decorateReply: false,
      index: false,
      maxAge: "30d",
      immutable: true
    });

    server.setNotFoundHandler(async (req, reply) => {
      const pathname = req.url.split("?")[0] ?? "";
      const isBackend =
        pathname === "/api" ||
        pathname.startsWith("/api/") ||
        pathname === "/public" ||
        pathname.startsWith("/public/") ||
        pathname.startsWith("/ws") ||
        pathname === "/health" ||
        pathname === "/ready" ||
        pathname.startsWith("/dh-live-api");
      if (req.method !== "GET" || isBackend) {
        return reply.code(404).send({ error: "not_found" });
      }
      const html = await fs.promises.readFile(webIndex, "utf8");
      return reply.type("text/html; charset=utf-8").header("cache-control", "no-cache").send(html);
    });
  }

  server.addHook("onClose", async () => {
    stopProactive();
    store.close();
    db.close();
  });

  return server;
}

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }

  interface FastifyInstance {
    config: AppConfig;
    db: AppDb;
    eventBus: ReturnType<typeof createEventBus>;
    store: Awaited<ReturnType<typeof createStore>>;
    modelRouter: ModelRouter;
    rateLimiter: ReturnType<typeof createRateLimiter>;
    toolRegistry: ToolRegistry;
    agent: AgentRunner;
    agentRuntime: AgentRuntime;
    brief: BriefService;
    proactive: ProactiveAgent;
    memoryProfile: MemoryProfileService;
    antiFraud: AntiFraudService;
    coolingOff: CoolingOffService;
    weather: ReturnType<typeof createWeatherService>;
    interview: InterviewService;
    story: StoryService;
  }
}
