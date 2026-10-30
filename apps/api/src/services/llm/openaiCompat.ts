import type { LlmProviderConfig } from "../../config.js";
import type {
  ChatJSONRequest,
  ChatMessage,
  ChatStreamEvent,
  ChatStreamRequest,
  ModelRouter,
  Usage,
  VisionJSONRequest
} from "./types.js";
import { ModelError } from "./types.js";

type ToolCallAccumulator = {
  id?: string;
  name?: string;
  args: string;
};

function joinUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.tool_call_id ?? ""
      };
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) }
        }))
      };
    }
    return { role: message.role, content: message.content };
  });
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  try {
    return JSON.parse(slice);
  } catch {
    throw new ModelError("bad_response", "model_did_not_return_json");
  }
}

function errorForStatus(status: number) {
  if (status === 401 || status === 403) return new ModelError("missing_config", `auth_${status}`);
  if (status === 429) return new ModelError("rate_limited", "rate_limited");
  if (status >= 500) return new ModelError("upstream_error", `upstream_${status}`);
  return new ModelError("bad_response", `http_${status}`);
}

async function fetchWithTimeout(input: {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    return await fetch(input.url, { ...input.init, signal: controller.signal });
  } catch (err) {
    if (input.signal?.aborted) throw new ModelError("aborted", "request_aborted");
    if (controller.signal.aborted) throw new ModelError("timeout", "upstream_timeout");
    if (err instanceof ModelError) throw err;
    throw new ModelError("network_error", "upstream_network_error");
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onAbort);
  }
}

export class OpenAICompatProvider implements ModelRouter {
  readonly mode = "live" as const;

  constructor(
    private readonly config: LlmProviderConfig,
    private readonly defaultTimeoutMs: number
  ) {}

  private thinkingBody(): Record<string, unknown> {
    return this.config.thinking === false ? { enable_thinking: false } : {};
  }

  async *chatStream(req: ChatStreamRequest): AsyncIterable<ChatStreamEvent> {
    const timeoutMs = this.defaultTimeoutMs;
    const res = await fetchWithTimeout({
      url: joinUrl(this.config.baseUrl, "chat/completions"),
      timeoutMs,
      ...(req.signal ? { signal: req.signal } : {}),
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: toOpenAIMessages(req.messages),
          stream: true,
          ...this.thinkingBody(),
          ...(typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
          ...(typeof req.maxTokens === "number" ? { max_tokens: req.maxTokens } : {}),
          ...(req.tools?.length ? { tools: req.tools, tool_choice: "auto" } : {})
        })
      }
    });

    if (!res.ok) throw errorForStatus(res.status);
    if (!res.body) throw new ModelError("bad_response", "empty_stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const toolCalls = new Map<number, ToolCallAccumulator>();
    let buffer = "";
    let usage: Usage | undefined;
    let finished = false;

    try {
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") {
            finished = true;
            break;
          }

          let json: any;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }

          if (json.usage) {
            usage = {
              ...(typeof json.usage.prompt_tokens === "number"
                ? { promptTokens: json.usage.prompt_tokens }
                : {}),
              ...(typeof json.usage.completion_tokens === "number"
                ? { completionTokens: json.usage.completion_tokens }
                : {})
            };
          }

          const delta = json.choices?.[0]?.delta;
          if (typeof delta?.content === "string" && delta.content) {
            yield { type: "token", text: delta.content };
          }

          const calls = delta?.tool_calls;
          if (Array.isArray(calls)) {
            for (const call of calls) {
              const index = typeof call.index === "number" ? call.index : 0;
              const current = toolCalls.get(index) ?? { args: "" };
              if (typeof call.id === "string" && call.id) current.id = call.id;
              if (typeof call.function?.name === "string" && call.function.name) {
                current.name = call.function.name;
              }
              if (typeof call.function?.arguments === "string") {
                current.args += call.function.arguments;
              }
              toolCalls.set(index, current);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof ModelError) throw err;
      throw new ModelError("network_error", "stream_read_failed");
    } finally {
      reader.releaseLock();
    }

    for (const [index, call] of toolCalls) {
      if (!call.name) continue;
      let args: unknown = {};
      if (call.args.trim()) {
        try {
          args = JSON.parse(call.args);
        } catch {
          args = {};
        }
      }
      yield {
        type: "tool_call",
        id: call.id ?? `call_${index}`,
        name: call.name,
        args
      };
    }

    yield { type: "done", ...(usage ? { usage } : {}) };
  }

  async chatJSON<T>(req: ChatJSONRequest<T>): Promise<T> {
    const res = await fetchWithTimeout({
      url: joinUrl(this.config.baseUrl, "chat/completions"),
      timeoutMs: req.timeoutMs ?? this.defaultTimeoutMs,
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: toOpenAIMessages(req.messages),
          stream: false,
          ...this.thinkingBody(),
          temperature: req.temperature ?? 0.1,
          ...(typeof req.maxTokens === "number" ? { max_tokens: req.maxTokens } : {})
        })
      }
    });

    if (!res.ok) throw errorForStatus(res.status);
    const json = (await res.json().catch(() => null)) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ModelError("bad_response", "empty_json_response");
    }
    return req.schema.parse(parseJsonText(content));
  }

  async visionJSON<T>(req: VisionJSONRequest<T>): Promise<T> {
    const model = this.config.visionModel;
    if (!model) throw new ModelError("missing_config", "vision_model_not_configured");

    const dataUrl = `data:${req.image.mime};base64,${req.image.data.toString("base64")}`;
    const res = await fetchWithTimeout({
      url: joinUrl(this.config.baseUrl, "chat/completions"),
      timeoutMs: req.timeoutMs ?? this.defaultTimeoutMs,
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          stream: false,
          ...this.thinkingBody(),
          temperature: 0.1,
          messages: [
            { role: "system", content: "只输出 JSON，不要输出其他文字。" },
            {
              role: "user",
              content: [
                { type: "text", text: req.prompt },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ]
        })
      }
    });

    if (!res.ok) throw errorForStatus(res.status);
    const json = (await res.json().catch(() => null)) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ModelError("bad_response", "empty_vision_response");
    }
    return req.schema.parse(parseJsonText(content));
  }

  async embed(texts: string[]): Promise<number[][]> {
    const model = this.config.embedModel;
    if (!model) throw new ModelError("missing_config", "embedding_model_not_configured");

    const res = await fetchWithTimeout({
      url: joinUrl(this.config.baseUrl, "embeddings"),
      timeoutMs: this.defaultTimeoutMs,
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ model, input: texts })
      }
    });

    if (!res.ok) throw errorForStatus(res.status);
    const json = (await res.json().catch(() => null)) as any;
    const data = Array.isArray(json?.data) ? json.data : [];
    if (data.length !== texts.length) throw new ModelError("bad_response", "embedding_count_mismatch");
    return data.map((row: any) => {
      if (!Array.isArray(row?.embedding)) throw new ModelError("bad_response", "bad_embedding");
      return row.embedding.map((n: unknown) => Number(n));
    });
  }
}
