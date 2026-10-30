import type { AppConfig } from "../../config.js";
import { MockModelProvider } from "./mock.js";
import { OpenAICompatProvider } from "./openaiCompat.js";
import type {
  ChatJSONRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ModelRouter,
  VisionJSONRequest
} from "./types.js";
import { ModelError } from "./types.js";

export class FallbackModelRouter implements ModelRouter {
  readonly mode = "live" as const;

  constructor(private readonly providers: ModelRouter[]) {}

  private async tryEach<T>(run: (provider: ModelRouter) => Promise<T>): Promise<T> {
    let lastError: unknown = null;
    for (const provider of this.providers) {
      try {
        return await run(provider);
      } catch (err) {
        lastError = err;
        if (err instanceof ModelError && err.code === "aborted") throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ModelError("missing_config", "no_model_provider");
  }

  async *chatStream(req: ChatStreamRequest): AsyncIterable<ChatStreamEvent> {
    let lastError: unknown = null;
    for (const provider of this.providers) {
      let emitted = false;
      try {
        for await (const event of provider.chatStream(req)) {
          emitted = true;
          yield event;
        }
        return;
      } catch (err) {
        lastError = err;
        if (err instanceof ModelError && err.code === "aborted") throw err;
        if (emitted) throw err;
      }
    }
    // 所有真实模型都不可用且尚未输出任何内容时，退回确定性 Mock，保证演示与陪伴不中断。
    const reason = lastError instanceof Error ? lastError.message : "no_model_provider";
    console.warn("[llm] all providers failed, falling back to mock:", reason);
    const fallback = new MockModelProvider();
    for await (const event of fallback.chatStream(req)) {
      yield event.type === "done" ? { ...event, fallback: true } : event;
    }
  }

  chatJSON<T>(req: ChatJSONRequest<T>): Promise<T> {
    return this.tryEach((provider) => provider.chatJSON(req));
  }

  visionJSON<T>(req: VisionJSONRequest<T>): Promise<T> {
    return this.tryEach((provider) => provider.visionJSON(req));
  }

  embed(texts: string[]): Promise<number[][]> {
    return this.tryEach((provider) => provider.embed(texts));
  }
}

export function createModelRouter(config: AppConfig): ModelRouter {
  if (config.llm.mode === "mock" || config.llm.providers.length === 0) {
    return new MockModelProvider();
  }
  return new FallbackModelRouter(
    config.llm.providers.map((provider) => new OpenAICompatProvider(provider, config.llm.timeoutMs))
  );
}
