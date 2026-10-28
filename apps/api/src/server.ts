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
import { createToolRegistry, type ToolRegistry } from "./services/agent/tools.js";
import { readCookie, verifySessionToken } from "./services/auth/session.js";
import type { SessionUser } from "./services/auth/types.js";
import { loadOrCreateMasterKey } from "./services/crypto.js";
import { createEventBus } from "./services/eventBus.js";
import { createLocationService } from "./services/location/location.js";
import { createModelRouter } from "./services/llm/router.js";
import type { ModelRouter } from "./services/llm/types.js";
import { createInterviewService, type InterviewService } from "./services/memory/interview.js";
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
  const agent = createAgentRunner({ db, store, config, modelRouter, toolRegistry, eventBus });

  const server = Fastify({
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
  server.decorate("toolRegistry", toolRegistry);
  server.decorate("agent", agent);
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

  await server.register(fastifyStatic, {
    root: config.publicDir,
    prefix: "/public/"
  });

  await server.register(cors, {
    origin: true,
    credentials: true
  });

  await server.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  await server.register(websocket);

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
    toolRegistry: ToolRegistry;
    agent: AgentRunner;
    antiFraud: AntiFraudService;
    coolingOff: CoolingOffService;
    weather: ReturnType<typeof createWeatherService>;
    interview: InterviewService;
    story: StoryService;
  }
}
