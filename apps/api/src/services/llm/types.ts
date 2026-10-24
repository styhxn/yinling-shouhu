import type { z } from "zod";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
};

export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type Usage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "done"; usage?: Usage };

export type ChatStreamRequest = {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type ChatJSONRequest<T> = {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type VisionJSONRequest<T> = {
  image: { data: Buffer; mime: string };
  prompt: string;
  schema: z.ZodType<T>;
  timeoutMs?: number;
};

export interface ModelRouter {
  readonly mode: "mock" | "live";
  chatStream(req: ChatStreamRequest): AsyncIterable<ChatStreamEvent>;
  chatJSON<T>(req: ChatJSONRequest<T>): Promise<T>;
  visionJSON<T>(req: VisionJSONRequest<T>): Promise<T>;
  embed(texts: string[]): Promise<number[][]>;
}

export class ModelError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ModelError";
    this.code = code;
  }
}
