import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigOverrides } from "./config.js";
import type {
  ChatJSONRequest,
  ChatStreamEvent,
  ModelRouter,
  VisionJSONRequest
} from "./services/llm/types.js";

export function testConfig(overrides: ConfigOverrides = {}): ConfigOverrides {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yl-test-"));
  return {
    env: "test",
    logLevel: "silent",
    dataDir: dir,
    dbPath: ":memory:",
    publicDir: path.join(dir, "public"),
    uploadsDir: path.join(dir, "public", "uploads"),
    demoMode: true,
    demoResetToken: "test-reset",
    sessionSecret: "test-session-secret",
    masterKeyB64: crypto.randomBytes(32).toString("base64"),
    amapWebKey: "",
    llm: {
      mode: "mock",
      timeoutMs: 2000,
      maxRetries: 0,
      providers: []
    },
    ...overrides
  };
}

export function cookieFrom(headers: Record<string, unknown>): string {
  const raw = headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string" || !first) throw new Error("missing_set_cookie");
  return first.split(";")[0] ?? first;
}

/** Deterministic router for JSON-only tests; throws when constructed with an Error. */
export class StubModelRouter implements ModelRouter {
  readonly mode = "mock" as const;

  constructor(private readonly payload: Record<string, unknown> | Error) {}

  async *chatStream(): AsyncIterable<ChatStreamEvent> {
    yield { type: "done" };
  }

  async chatJSON<T>(req: ChatJSONRequest<T>): Promise<T> {
    if (this.payload instanceof Error) throw this.payload;
    return req.schema.parse(this.payload);
  }

  async visionJSON<T>(req: VisionJSONRequest<T>): Promise<T> {
    return req.schema.parse({});
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

export function parseSse(body: string, eventName: string): unknown[] {
  const out: unknown[] = [];
  for (const block of body.split("\n\n")) {
    const lines = block.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    if (event !== eventName) continue;
    const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
    if (!data) continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // ignore malformed fixture
    }
  }
  return out;
}
