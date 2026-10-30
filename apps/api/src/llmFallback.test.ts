import { describe, expect, it } from "vitest";
import { FallbackModelRouter } from "./services/llm/router.js";
import { ModelError } from "./services/llm/types.js";
import type {
  ChatJSONRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ModelRouter,
  VisionJSONRequest
} from "./services/llm/types.js";

class FailingProvider implements ModelRouter {
  readonly mode = "live" as const;

  constructor(private readonly emitFirst: boolean) {}

  async *chatStream(_req: ChatStreamRequest): AsyncIterable<ChatStreamEvent> {
    if (this.emitFirst) yield { type: "token", text: "半句" };
    throw new ModelError("network", "upstream down");
  }

  async chatJSON<T>(_req: ChatJSONRequest<T>): Promise<T> {
    throw new ModelError("network", "upstream down");
  }

  async visionJSON<T>(_req: VisionJSONRequest<T>): Promise<T> {
    throw new ModelError("network", "upstream down");
  }

  async embed(): Promise<number[][]> {
    throw new ModelError("network", "upstream down");
  }
}

describe("model fallback", () => {
  it("falls back to the deterministic mock when every provider fails before output", async () => {
    const router = new FallbackModelRouter([new FailingProvider(false)]);
    const events: ChatStreamEvent[] = [];
    for await (const event of router.chatStream({
      messages: [{ role: "user", content: "你好" }]
    })) {
      events.push(event);
    }
    const text = events
      .filter((event): event is Extract<ChatStreamEvent, { type: "token" }> => event.type === "token")
      .map((event) => event.text)
      .join("");
    const done = events.find((event) => event.type === "done");
    expect(text.length).toBeGreaterThan(0);
    expect(done && "fallback" in done ? done.fallback : false).toBe(true);
  });

  it("does not restart mid-answer when a provider fails after partial output", async () => {
    const router = new FallbackModelRouter([new FailingProvider(true)]);
    const seen: string[] = [];
    const consume = async () => {
      for await (const event of router.chatStream({
        messages: [{ role: "user", content: "你好" }]
      })) {
        if (event.type === "token") seen.push(event.text);
      }
    };
    await expect(consume()).rejects.toThrow("upstream down");
    expect(seen).toEqual(["半句"]);
  });
});
