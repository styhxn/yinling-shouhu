import type { AppConfig } from "../../config.js";
import type {
  AgentCitation,
  AgentDecision,
  AgentTraceStep,
  AppDb,
  DbSession
} from "../../store/db.js";
import type { SessionUser } from "../auth/types.js";
import type { createEventBus } from "../eventBus.js";
import type { ChatMessage, ModelRouter, ToolCall, Usage } from "../llm/types.js";
import { ModelError } from "../llm/types.js";
import type { MemoryProfileService } from "../memory/profile.js";
import type { createStore } from "../store.js";
import { AGENT_SYSTEM_PROMPT } from "./prompts.js";
import type { ToolContext, ToolRegistry, ToolResult } from "./tools.js";

export type AgentEvent =
  | { type: "meta"; sessionId: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown; risk: "read" | "write" | "high" }
  | { type: "tool_result"; id: string; ok: boolean; summary: string; latencyMs: number }
  | {
      type: "confirmation_required";
      id: string;
      tool: string;
      summary: string;
      risk: "high";
      expiresAt: number;
    }
  | {
      type: "done";
      sessionId: string;
      riskLevel: "low" | "medium" | "high";
      citations: AgentCitation[];
      traceId: string;
      usage?: Usage;
    }
  | { type: "error"; code: string; message: string };

export type AgentRunnerDeps = {
  db: AppDb;
  store: Awaited<ReturnType<typeof createStore>>;
  config: AppConfig;
  modelRouter: ModelRouter;
  toolRegistry: ToolRegistry;
  eventBus: ReturnType<typeof createEventBus>;
  memoryProfile: MemoryProfileService;
};

export type AgentRunInput = {
  user: SessionUser;
  requestId: string;
  message: string;
  sessionId?: string;
  confirmationId?: string;
  confirmationDecision?: "approve" | "cancel";
  signal?: AbortSignal;
};

export type AgentRunner = {
  run(input: AgentRunInput): AsyncGenerator<AgentEvent>;
};

function chunkText(text: string, size = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const REDACT_KEYS = new Set([
  "text",
  "reason",
  "counterparty",
  "url",
  "contact",
  "note",
  "amount"
]);

function redactArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key) ? "[redacted]" : value;
  }
  return out;
}

function lastToolCallId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "assistant" && msg.tool_calls?.length) {
      return msg.tool_calls[0]?.id ?? null;
    }
  }
  return null;
}

function confirmationSummary(tool: string, args: unknown): string {
  if (tool === "start_cooling_off") {
    const amount =
      args && typeof args === "object" && typeof (args as any).amount === "number"
        ? ` ¥${(args as any).amount}`
        : "";
    return `检测到准备转账${amount}，需要家属确认后才能继续。本系统不会执行真实转账。`;
  }
  if (tool === "generate_missing_poster") {
    return "即将发布寻人海报，请确认衣着、最后位置和联系方式已脱敏。";
  }
  return "这一步涉及高风险操作，需要您确认。";
}

type Citation = AgentCitation;

function extractCitations(data: unknown): Citation[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const list = Array.isArray(record.citations)
    ? record.citations
    : Array.isArray(record.sources)
      ? record.sources
      : [];
  const out: Citation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    if (typeof source.title !== "string" || !source.title.trim()) continue;
    out.push({
      title: source.title.slice(0, 120),
      ...(typeof source.url === "string" ? { url: source.url.slice(0, 300) } : {}),
      ...(typeof source.type === "string" ? { type: source.type.slice(0, 20) } : {}),
      ...(typeof source.id === "string" ? { id: source.id.slice(0, 80) } : {})
    });
  }
  return out;
}

function mergeCitations(current: Citation[], incoming: Citation[]): Citation[] {
  const seen = new Set(
    current.map((item) => `${item.url ?? ""}|${item.type ?? ""}|${item.id ?? ""}|${item.title}`)
  );
  for (const item of incoming) {
    const key = `${item.url ?? ""}|${item.type ?? ""}|${item.id ?? ""}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(item);
  }
  return current.slice(0, 8);
}

function errorMessage(err: unknown): string {
  if (err instanceof ModelError) return err.message;
  if (err instanceof Error) return err.message;
  return "agent_failed";
}

type TraceRecorder = {
  startedAt: number;
  steps: AgentTraceStep[];
  facts: string[];
  citations: Citation[];
};

function newRecorder(): TraceRecorder {
  return { startedAt: Date.now(), steps: [], facts: [], citations: [] };
}

function pushStep(recorder: TraceRecorder, step: Omit<AgentTraceStep, "index">) {
  recorder.steps.push({ index: recorder.steps.length, ...step });
}

function traceDecision(input: {
  summary: string;
  riskLevel: "low" | "medium" | "high";
  citations: Citation[];
  engine?: "rules" | "rules+llm";
  needsConfirmation?: boolean;
  escalation?: "none" | "family" | "emergency";
}): AgentDecision {
  return {
    summary: input.summary,
    riskLevel: input.riskLevel,
    confidence: 0.8,
    needsConfirmation: input.needsConfirmation ?? false,
    escalation: input.escalation ?? "none",
    facts: input.citations.map((citation) => citation.title).slice(0, 6),
    actions: [],
    explanation: "对话 Agent 的模型回复与工具调用轨迹。",
    citations: input.citations,
    engine: input.engine ?? "rules+llm",
    model: "chat"
  };
}

export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  function resolveElderId(user: SessionUser): string | undefined {
    if (user.elderId) return user.elderId;
    if (user.role === "family") {
      return deps.db.users.listFamilyLinks(user.userId)[0]?.elderId;
    }
    return undefined;
  }

  function buildSystemPrompt(user: SessionUser): string {
    const name = deps.db.users.getById(user.userId)?.displayName ?? "用户";
    const elderId = resolveElderId(user);
    const profile = elderId ? deps.memoryProfile.getCached(elderId) : null;
    const profileLine =
      profile?.summary && !profile.summary.startsWith("还没有")
        ? `\n已知记忆画像（只用于个性化陪伴，不要逐条复述）：${profile.summary}` +
          (profile.sensitivities.length ? ` 沟通注意：${profile.sensitivities.join("；")}` : "")
        : "";
    return `${AGENT_SYSTEM_PROMPT}\n当前用户：${name}（${user.role}）。${profileLine}`;
  }

  function persistTrace(input: {
    ctx: ToolContext;
    goal: string;
    status: "ok" | "needs_confirmation" | "error";
    decision: AgentDecision;
    recorder: TraceRecorder;
  }): string {
    const elderId = input.ctx.elderId ?? input.ctx.user.elderId ?? input.ctx.user.userId;
    const trace = deps.db.agentTraces.create({
      elderId,
      userId: input.ctx.user.userId,
      agent: "companion",
      trigger: "user",
      goal: input.goal.slice(0, 300),
      status: input.status,
      decision: {
        ...input.decision,
        citations: input.recorder.citations,
        model: deps.modelRouter.mode
      },
      steps: input.recorder.steps,
      citations: input.recorder.citations,
      model: deps.modelRouter.mode,
      latencyMs: Date.now() - input.recorder.startedAt
    });
    return trace.id;
  }

  function saveSession(session: DbSession, messages: ChatMessage[], summary?: string) {
    deps.db.sessions.upsert({
      id: session.id,
      userId: session.userId,
      elderId: session.elderId,
      messages: messages.slice(-30),
      summary: summary ?? session.summary
    });
  }

  async function executeTool(
    call: ToolCall,
    ctx: ToolContext
  ): Promise<ToolResult & { ok: boolean; latencyMs: number }> {
    const started = Date.now();
    const tool = deps.toolRegistry.get(call.name);
    try {
      const result = await deps.toolRegistry.execute(call.name, call.args, ctx);
      const latencyMs = Date.now() - started;
      deps.db.toolLogs.insert({
        sessionId: ctx.sessionId,
        userId: ctx.user.userId,
        tool: call.name,
        argsRedacted: redactArgs(call.args),
        resultSummary: result.summary,
        ok: true,
        latencyMs,
        model: deps.modelRouter.mode,
        riskLevel: tool?.risk ?? "read"
      });
      return { ...result, ok: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = errorMessage(err);
      deps.db.toolLogs.insert({
        sessionId: ctx.sessionId,
        userId: ctx.user.userId,
        tool: call.name,
        argsRedacted: redactArgs(call.args),
        resultSummary: message,
        ok: false,
        latencyMs,
        model: deps.modelRouter.mode,
        riskLevel: tool?.risk ?? "read"
      });
      return {
        summary: `工具执行失败：${message}`,
        ok: false,
        latencyMs
      };
    }
  }

  async function* runLoop(input: {
    messages: ChatMessage[];
    session: DbSession;
    ctx: ToolContext;
    recorder: TraceRecorder;
    goal: string;
    signal?: AbortSignal;
    initialRisk?: "low" | "medium" | "high";
    initialCitations?: Citation[];
  }): AsyncGenerator<AgentEvent> {
    const { messages, session, ctx, signal, recorder } = input;
    let riskLevel: "low" | "medium" | "high" = input.initialRisk ?? "low";
    let lastUsage: Usage | undefined;
    if (input.initialCitations?.length) {
      mergeCitations(recorder.citations, input.initialCitations);
    }
    const citations = recorder.citations;

    for (let step = 0; step < 4; step += 1) {
      const toolSchemas = deps.toolRegistry.schemas(ctx.user.role);
      const modelMessages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(ctx.user) },
        ...messages
      ];

      let text = "";
      const calls: ToolCall[] = [];
      try {
        for await (const event of deps.modelRouter.chatStream({
          messages: modelMessages,
          tools: toolSchemas,
          temperature: 0.3,
          maxTokens: 800,
          ...(signal ? { signal } : {})
        })) {
          if (event.type === "token") text += event.text;
          else if (event.type === "tool_call") {
            calls.push({ id: event.id, name: event.name, args: event.args });
          } else if (event.type === "done") {
            lastUsage = event.usage;
          }
        }
      } catch (err) {
        const message = errorMessage(err);
        pushStep(recorder, {
          type: "error",
          label: "模型调用失败",
          detail: message,
          ok: false
        });
        persistTrace({
          ctx,
          goal: input.goal,
          status: "error",
          decision: traceDecision({ summary: message, riskLevel, citations, engine: "rules" }),
          recorder
        });
        yield {
          type: "error",
          code: err instanceof ModelError ? err.code : "agent_failed",
          message
        };
        return;
      }

      if (!calls.length) {
        const answer = text.trim() || "我在呢，您可以慢慢说。";
        for (const piece of chunkText(answer)) yield { type: "token", text: piece };
        messages.push({ role: "assistant", content: answer });
        saveSession(session, messages);
        pushStep(recorder, {
          type: "decision",
          label: "生成回答",
          detail: answer.slice(0, 300),
          ok: true
        });
        const traceId = persistTrace({
          ctx,
          goal: input.goal,
          status: "ok",
          decision: traceDecision({ summary: answer, riskLevel, citations }),
          recorder
        });
        yield {
          type: "done",
          sessionId: session.id,
          riskLevel,
          citations,
          traceId,
          ...(lastUsage ? { usage: lastUsage } : {})
        };
        return;
      }

      messages.push({ role: "assistant", content: text, tool_calls: calls });

      for (const call of calls) {
        const tool = deps.toolRegistry.get(call.name);
        if (!tool) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.name,
            content: "未知工具"
          });
          pushStep(recorder, {
            type: "tool_result",
            label: `${call.name} 不可用`,
            tool: call.name,
            ok: false,
            latencyMs: 0,
            detail: "未知工具"
          });
          yield { type: "tool_result", id: call.id, ok: false, summary: "未知工具", latencyMs: 0 };
          continue;
        }

        yield { type: "tool_call", id: call.id, name: call.name, args: redactArgs(call.args), risk: tool.risk };
        pushStep(recorder, {
          type: "tool_call",
          label: `调用 ${call.name}`,
          tool: call.name,
          args: redactArgs(call.args),
          detail: tool.description
        });

        if (tool.requiresConfirmation) {
          let preparedArgs: unknown = call.args;
          let preparedSummary = confirmationSummary(call.name, call.args);
          if (tool.prepare) {
            try {
              const prepared = await tool.prepare(call.args, ctx);
              preparedArgs = prepared.args;
              preparedSummary = prepared.summary;
            } catch (err) {
              const message = errorMessage(err);
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                name: call.name,
                content: `准备失败：${message}`
              });
              pushStep(recorder, {
                type: "tool_result",
                label: `${call.name} 准备失败`,
                tool: call.name,
                ok: false,
                latencyMs: 0,
                detail: message
              });
              yield {
                type: "tool_result",
                id: call.id,
                ok: false,
                summary: `准备失败：${message}`,
                latencyMs: 0
              };
              continue;
            }
          }
          const confirmation = deps.db.confirmations.create({
            sessionId: session.id,
            userId: ctx.user.userId,
            tool: call.name,
            args: preparedArgs,
            ttlMs: call.name === "start_cooling_off" ? 60_000 : 5 * 60_000
          });
          saveSession(session, messages);
          pushStep(recorder, {
            type: "decision",
            label: "等待用户确认",
            detail: preparedSummary,
            ok: true
          });
          persistTrace({
            ctx,
            goal: input.goal,
            status: "needs_confirmation",
            decision: traceDecision({
              summary: preparedSummary,
              riskLevel: "high",
              citations,
              needsConfirmation: true,
              escalation: call.name === "start_cooling_off" ? "family" : "none"
            }),
            recorder
          });
          yield {
            type: "confirmation_required",
            id: confirmation.id,
            tool: call.name,
            summary: preparedSummary,
            risk: "high",
            expiresAt: confirmation.expiresAt
          };
          return;
        }

        const result = await executeTool(call, ctx);
        mergeCitations(citations, extractCitations(result.data));
        recorder.facts.push(result.summary.slice(0, 200));
        pushStep(recorder, {
          type: "tool_result",
          label: `${call.name} 返回`,
          tool: call.name,
          ok: result.ok,
          latencyMs: result.latencyMs,
          detail: result.summary.slice(0, 300)
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: result.summary
        });
        if (!result.ok) riskLevel = "medium";
        if (call.name === "check_scam" && /风险等级：high/.test(result.summary)) {
          riskLevel = "high";
        }
        yield {
          type: "tool_result",
          id: call.id,
          ok: result.ok,
          summary: result.summary.slice(0, 500),
          latencyMs: result.latencyMs
        };
      }
    }

    const fallback = "我先帮您整理到这里。建议联系家人，或者再问我一次。";
    for (const piece of chunkText(fallback)) yield { type: "token", text: piece };
    messages.push({ role: "assistant", content: fallback });
    saveSession(session, messages);
    pushStep(recorder, {
      type: "decision",
      label: "达到工具步数上限",
      detail: fallback,
      ok: true
    });
    const traceId = persistTrace({
      ctx,
      goal: input.goal,
      status: "ok",
      decision: traceDecision({ summary: fallback, riskLevel, citations }),
      recorder
    });
    yield { type: "done", sessionId: session.id, riskLevel, citations, traceId };
  }

  async function* resumeConfirmation(
    input: AgentRunInput,
    session: DbSession,
    ctx: ToolContext,
    recorder: TraceRecorder
  ): AsyncGenerator<AgentEvent> {
    const confirmation = deps.db.confirmations.get(input.confirmationId!);
    const goal = confirmation ? `确认并继续：${confirmation.tool}` : "确认高风险操作";
    if (!confirmation) {
      persistTrace({
        ctx,
        goal,
        status: "error",
        decision: traceDecision({ summary: "确认记录不存在", riskLevel: "medium", citations: [] }),
        recorder
      });
      yield { type: "error", code: "confirmation_not_found", message: "确认记录不存在" };
      return;
    }
    if (confirmation.sessionId !== session.id || confirmation.userId !== input.user.userId) {
      persistTrace({
        ctx,
        goal,
        status: "error",
        decision: traceDecision({ summary: "确认记录不属于当前会话", riskLevel: "medium", citations: [] }),
        recorder
      });
      yield { type: "error", code: "forbidden", message: "确认记录不属于当前会话" };
      return;
    }
    if (confirmation.status !== "pending") {
      persistTrace({
        ctx,
        goal,
        status: "error",
        decision: traceDecision({ summary: "这条确认已经处理过了", riskLevel: "medium", citations: [] }),
        recorder
      });
      yield { type: "error", code: "confirmation_used", message: "这条确认已经处理过了" };
      return;
    }
    if (confirmation.expiresAt < Date.now()) {
      deps.db.confirmations.setStatus(confirmation.id, "expired");
      persistTrace({
        ctx,
        goal,
        status: "error",
        decision: traceDecision({ summary: "确认已过期，请重新发起", riskLevel: "medium", citations: [] }),
        recorder
      });
      yield { type: "error", code: "confirmation_expired", message: "确认已过期，请重新发起" };
      return;
    }

    const messages = [...(session.messages as ChatMessage[])];

    if (input.confirmationDecision !== "approve") {
      deps.db.confirmations.setStatus(confirmation.id, "cancelled");
      const answer = "好的，已经取消。您先不要转账，有需要可以再叫我。";
      messages.push({ role: "assistant", content: answer });
      saveSession(session, messages);
      pushStep(recorder, {
        type: "decision",
        label: "用户取消高风险操作",
        detail: answer,
        ok: true
      });
      const traceId = persistTrace({
        ctx,
        goal,
        status: "ok",
        decision: traceDecision({ summary: answer, riskLevel: "high", citations: [] }),
        recorder
      });
      yield { type: "token", text: answer };
      yield {
        type: "done",
        sessionId: session.id,
        riskLevel: "high",
        citations: [],
        traceId
      };
      return;
    }

    deps.db.confirmations.setStatus(confirmation.id, "approved");
    const tool = deps.toolRegistry.get(confirmation.tool);
    if (!tool) {
      persistTrace({
        ctx,
        goal,
        status: "error",
        decision: traceDecision({ summary: "工具不存在", riskLevel: "medium", citations: [] }),
        recorder
      });
      yield { type: "error", code: "unknown_tool", message: "工具不存在" };
      return;
    }

    const callId = lastToolCallId(messages) ?? `call_${confirmation.id}`;
    const call: ToolCall = { id: callId, name: confirmation.tool, args: confirmation.args };
    yield { type: "tool_call", id: callId, name: call.name, args: redactArgs(call.args), risk: tool.risk };
    pushStep(recorder, {
      type: "tool_call",
      label: `用户确认后执行 ${call.name}`,
      tool: call.name,
      args: redactArgs(call.args),
      detail: tool.description
    });

    const result = await executeTool(call, ctx);
    const approvedCitations = extractCitations(result.data);
    recorder.facts.push(result.summary.slice(0, 200));
    messages.push({
      role: "tool",
      tool_call_id: callId,
      name: call.name,
      content: result.summary
    });
    pushStep(recorder, {
      type: "tool_result",
      label: `${call.name} 返回`,
      tool: call.name,
      ok: result.ok,
      latencyMs: result.latencyMs,
      detail: result.summary.slice(0, 300)
    });
    yield {
      type: "tool_result",
      id: callId,
      ok: result.ok,
      summary: result.summary.slice(0, 500),
      latencyMs: result.latencyMs
    };

    yield* runLoop({
      messages,
      session,
      ctx,
      recorder,
      goal,
      ...(input.signal ? { signal: input.signal } : {}),
      initialRisk: "high",
      initialCitations: approvedCitations
    });
  }

  async function* run(input: AgentRunInput): AsyncGenerator<AgentEvent> {
    const elderId = resolveElderId(input.user);
    const recorder = newRecorder();
    const ctx: ToolContext = {
      user: input.user,
      sessionId: input.sessionId ?? "",
      requestId: input.requestId,
      ...(elderId ? { elderId } : {}),
      ...(input.signal ? { signal: input.signal } : {})
    };

    let session = input.sessionId ? deps.db.sessions.get(input.sessionId) : null;
    if (session && session.userId !== input.user.userId) {
      yield { type: "error", code: "forbidden", message: "会话不属于当前用户" };
      return;
    }
    if (!session) {
      session = deps.db.sessions.create(input.user.userId, elderId ?? null);
    }
    ctx.sessionId = session.id;
    yield { type: "meta", sessionId: session.id };

    if (input.confirmationId) {
      yield* resumeConfirmation(input, session, ctx, recorder);
      return;
    }

    if (!input.message.trim()) {
      pushStep(recorder, {
        type: "error",
        label: "空消息",
        detail: "请说点什么",
        ok: false
      });
      persistTrace({
        ctx,
        goal: "用户对话",
        status: "error",
        decision: traceDecision({ summary: "请说点什么", riskLevel: "low", citations: [] }),
        recorder
      });
      yield { type: "error", code: "empty_message", message: "请说点什么" };
      return;
    }

    pushStep(recorder, {
      type: "plan",
      label: "理解用户请求",
      detail: input.message.slice(0, 300)
    });
    const messages = [...(session.messages as ChatMessage[]), { role: "user", content: input.message } as ChatMessage];
    yield* runLoop({
      messages,
      session,
      ctx,
      recorder,
      goal: input.message,
      ...(input.signal ? { signal: input.signal } : {})
    });
  }

  return { run };
}
