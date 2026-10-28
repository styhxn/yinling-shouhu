import { z } from "zod";
import type {
  AgentAction,
  AgentBriefItem,
  AgentCitation,
  AgentDecision,
  AgentTraceStep,
  AppDb
} from "../../store/db.js";
import type { SessionUser } from "../auth/types.js";
import type { ModelRouter } from "../llm/types.js";
import type { ToolContext, ToolRegistry } from "./tools.js";

export type AgentRole = "companion" | "guardian" | "family";
export type AgentTrigger = "user" | "schedule" | "event" | "family" | "system";
export type AgentTaskKind = "brief" | "alert" | "custom";

export type AgentTaskInput = {
  kind: AgentTaskKind;
  agent: AgentRole;
  trigger: AgentTrigger;
  elderId: string;
  userId: string;
  goal: string;
  requestId: string;
  context?: Record<string, unknown>;
  allowedTools?: string[];
  sessionId?: string;
  maxTools?: number;
  signal?: AbortSignal;
};

export type AgentTaskResult = {
  decision: AgentDecision;
  traceId: string;
};

const PlannedToolSchema = z.object({
  tool: z.string().min(1).max(60),
  args: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1).max(160).optional()
});

const AgentPlanSchema = z.object({
  steps: z.array(PlannedToolSchema).min(1).max(5),
  rationale: z.string().min(1).max(300)
});

const AgentActionSchema = z.object({
  label: z.string().min(1).max(40),
  kind: z.enum(["link", "call", "confirm", "tool"]),
  href: z.string().max(200).optional(),
  tool: z.string().max(60).optional()
});

const BriefItemSchema = z.object({
  title: z.string().min(1).max(40),
  detail: z.string().min(1).max(160),
  priority: z.enum(["now", "today", "later"]),
  actionLabel: z.string().max(30).optional(),
  href: z.string().max(200).optional()
});

const AgentDecisionSchema = z.object({
  summary: z.string().min(1).max(240),
  riskLevel: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  escalation: z.enum(["none", "family", "emergency"]),
  facts: z.array(z.string().min(1).max(160)).max(6),
  actions: z.array(AgentActionSchema).max(4),
  briefItems: z.array(BriefItemSchema).max(4).optional(),
  explanation: z.string().min(1).max(400)
});

type AgentPlan = z.infer<typeof AgentPlanSchema>;
type AgentDecisionPayload = z.infer<typeof AgentDecisionSchema>;

const DEFAULT_TOOLS: Record<AgentTaskKind, string[]> = {
  brief: [
    "get_memory_profile",
    "get_medications",
    "get_weather",
    "get_location",
    "search_memories",
    "get_health_records"
  ],
  alert: ["get_location", "get_memory_profile", "get_medications", "get_weather", "search_memories"],
  custom: ["get_weather", "get_medications", "get_memory_profile", "get_location", "search_memories"]
};

const ROLE_PROMPTS: Record<AgentRole, string> = {
  companion:
    "你是「银龄守护」的陪伴 Agent，服务对象是江苏长者。语气短句、口语、温暖克制，一次只给一个明确动作。",
  guardian:
    "你是「银龄守护」的守护 Agent，负责安全事件研判。先共情，再给事实和下一步；不制造恐慌，不替代警方或医生。",
  family:
    "你是「银龄守护」的家属协同 Agent，帮助家属理解老人的状态。只陈述记录与依据，不推测隐私，不制造焦虑。"
};

const PLAN_SYSTEM_PROMPT = `你在为一个长者守护系统制定只读工具计划。只输出 JSON：
{"steps":[{"tool":"工具名","args":{},"reason":"为什么查"}],"rationale":"一句话计划理由"}
规则：
1. 只能使用提供的工具，不得编造工具名。
2. 只查生成任务所需的最少信息，最多 4 个工具。
3. 不调用任何写操作或高风险工具，不访问链接。
4. 工具参数使用 JSON 对象；天气默认城市南京。`;

const DECISION_SYSTEM_PROMPT = `你在为一个长者守护系统生成结构化决策。只输出 JSON：
{"summary":"给用户看的一两句话","riskLevel":"low|medium|high","confidence":0到1,
"needsConfirmation":true或false,"escalation":"none|family|emergency",
"facts":["引用到的事实"],"actions":[{"label":"动作","kind":"link|call|confirm|tool","href":"可选"}],
"briefItems":[{"title":"标题","detail":"说明","priority":"now|today|later","actionLabel":"可选","href":"可选"}],
"explanation":"为什么这样判断"}
规则：
1. 只用提供的事实，不编造时间、地点、金额或健康结论。
2. 今日简报任务给 2-4 条 briefItems，按 now/today/later 排序；安全告警任务不给 briefItems。
3. 安全告警的风险等级不得低于事件本身的级别；无法确认时建议先电话核实并通知家属。
4. 医疗、金融、定位建议必须保留不确定性，不替代医生、警方或银行。
5. 长者端动作优先“联系家人 / 打 96110 / 查看位置”，不要给复杂步骤。`;

function localDateKey(ts = Date.now()) {
  const date = new Date(ts);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayKey(ts = Date.now()) {
  return localDateKey(ts);
}

function toolArgs(tool: string, raw: unknown): Record<string, unknown> {
  const args =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  if (tool === "get_weather") {
    return {
      location: typeof args.location === "string" && args.location.trim() ? args.location : "南京"
    };
  }
  if (tool === "search_memories") {
    return {
      limit: 2,
      ...(typeof args.query === "string" && args.query.trim() ? { query: args.query.trim() } : {})
    };
  }
  return args;
}

function extractCitations(data: unknown): AgentCitation[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const list = Array.isArray(record.citations)
    ? record.citations
    : Array.isArray(record.sources)
      ? record.sources
      : [];
  const out: AgentCitation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    if (typeof source.title !== "string" || !source.title.trim()) continue;
    out.push({
      title: source.title.slice(0, 120),
      ...(typeof source.url === "string" && source.url ? { url: source.url.slice(0, 300) } : {}),
      ...(typeof source.type === "string" ? { type: source.type.slice(0, 20) } : {}),
      ...(typeof source.id === "string" ? { id: source.id.slice(0, 80) } : {})
    });
  }
  return out;
}

function mergeCitations(current: AgentCitation[], incoming: AgentCitation[]) {
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

function briefItemForFact(fact: string, index: number): AgentBriefItem {
  if (/记忆画像|常提到|沟通提醒/.test(fact)) {
    return {
      title: "AI 记得您",
      detail: fact.replace(/^记忆画像：/, "").slice(0, 150),
      priority: "later",
      actionLabel: "看看故事",
      href: "/elder/story"
    };
  }
  if (/药|服用|打卡|mg|片|每日|每次/.test(fact)) {
    return {
      title: "按时吃药",
      detail: fact.slice(0, 150),
      priority: "now",
      actionLabel: "去打卡",
      href: "/elder/meds"
    };
  }
  if (/天气|℃|雨|风/.test(fact)) {
    return {
      title: "今天出门看天气",
      detail: fact.slice(0, 150),
      priority: "today",
      actionLabel: "问小助手",
      href: "/elder/chat"
    };
  }
  if (/位置|围栏|最后/.test(fact)) {
    return {
      title: "位置与安全",
      detail: fact.slice(0, 150),
      priority: "today",
      actionLabel: "查看守护",
      href: "/elder/safety"
    };
  }
  if (/记忆|回忆|找到/.test(fact)) {
    return {
      title: "今天的回忆",
      detail: fact.slice(0, 150),
      priority: "later",
      actionLabel: "看看故事",
      href: "/elder/story"
    };
  }
  return {
    title: index === 0 ? "今天先照顾好自己" : "今日提醒",
    detail: fact.slice(0, 150),
    priority: "later"
  };
}

function fallbackPlan(input: AgentTaskInput, allowed: string[]): AgentPlan {
  const picked = DEFAULT_TOOLS[input.kind].filter((tool) => allowed.includes(tool)).slice(0, 4);
  const steps = (picked.length ? picked : allowed.slice(0, 2)).map((tool) => ({
    tool,
    args: toolArgs(tool, {}),
    reason: "规则兜底：读取与任务直接相关的数据"
  }));
  return {
    steps: steps.length ? steps : [{ tool: "get_medications", args: {}, reason: "默认读取用药" }],
    rationale: "模型不可用时，按任务类型读取最少必要信息。"
  };
}

function fallbackDecision(input: AgentTaskInput, facts: string[]): AgentDecisionPayload {
  const context = input.context ?? {};
  if (input.kind === "brief") {
    const items = facts.slice(0, 3).map((fact, index) => briefItemForFact(fact, index));
    return {
      summary: "今天先把药吃好、把天气看明白，其他的慢慢来。",
      riskLevel: "low",
      confidence: 0.72,
      needsConfirmation: false,
      escalation: "none",
      facts: facts.slice(0, 6),
      actions: [
        { label: "和小助手说说", kind: "link", href: "/elder/chat" },
        { label: "看看故事", kind: "link", href: "/elder/story" }
      ],
      briefItems: items.length
        ? items
        : [
            {
              title: "今天先照顾好自己",
              detail: "还没有足够的数据生成更多提醒，先喝口水、慢慢来。",
              priority: "today"
            }
          ],
      explanation: "根据用药、天气、位置和记忆记录整理；模型不可用时使用规则简报。"
    };
  }

  const alertLevel =
    typeof context.alertLevel === "string" ? context.alertLevel.toLowerCase() : "warn";
  const riskLevel = alertLevel === "critical" ? "high" : alertLevel === "info" ? "low" : "medium";
  const alertLabel = typeof context.alertType === "string" ? context.alertType : "安全提醒";
  return {
    summary:
      riskLevel === "high"
        ? "我注意到一条比较紧急的安全提醒，先别慌，建议马上电话确认并联系家人。"
        : "我注意到一条安全提醒，先确认一下情况，再决定要不要通知家人。",
    riskLevel,
    confidence: 0.66,
    needsConfirmation: riskLevel === "high",
    escalation: riskLevel === "high" ? "family" : "none",
    facts: facts.slice(0, 6),
    actions: [
      { label: "查看位置", kind: "link", href: "/elder/safety" },
      { label: "联系家人", kind: "link", href: "/elder/chat" },
      ...(riskLevel === "high"
        ? [{ label: "拨打 110", kind: "call" as const, href: "tel:110" }]
        : [])
    ],
    explanation: `事件类型：${alertLabel}；结合最近位置、用药和天气记录做规则研判。`
  };
}

function normalizeDecision(
  input: AgentTaskInput,
  payload: AgentDecisionPayload,
  citations: AgentCitation[],
  usedModel: boolean,
  model: string
): AgentDecision {
  const briefItems =
    input.kind === "brief"
      ? payload.briefItems && payload.briefItems.length
        ? payload.briefItems
        : payload.facts.slice(0, 3).map((fact, index) => briefItemForFact(fact, index))
      : undefined;

  return {
    summary: payload.summary,
    riskLevel: input.kind === "alert" ? maxRiskLevel(payload.riskLevel, alertRisk(input)) : payload.riskLevel,
    confidence: Number(Math.max(0, Math.min(1, payload.confidence)).toFixed(2)),
    needsConfirmation: payload.needsConfirmation,
    escalation: payload.escalation,
    facts: payload.facts,
    actions: payload.actions.map((action) => ({
      ...action,
      kind: action.kind ?? "link"
    })),
    ...(briefItems ? { briefItems } : {}),
    explanation: payload.explanation,
    citations,
    engine: usedModel ? "rules+llm" : "rules",
    model
  };
}

function alertRisk(input: AgentTaskInput): "low" | "medium" | "high" {
  const level =
    typeof input.context?.alertLevel === "string"
      ? input.context.alertLevel.toLowerCase()
      : "warn";
  return level === "critical" ? "high" : level === "info" ? "low" : "medium";
}

function maxRiskLevel(a: "low" | "medium" | "high", b: "low" | "medium" | "high") {
  const rank = { low: 1, medium: 2, high: 3 };
  return rank[a] >= rank[b] ? a : b;
}

export function createAgentRuntime(deps: { db: AppDb; modelRouter: ModelRouter; toolRegistry: ToolRegistry }) {
  async function plan(
    input: AgentTaskInput,
    allowed: string[],
    steps: AgentTraceStep[]
  ): Promise<{ plan: AgentPlan; usedModel: boolean }> {
    const catalog = deps.toolRegistry
      .list("elder")
      .filter((tool) => allowed.includes(tool.name))
      .map((tool) => ({ name: tool.name, description: tool.description }));

    try {
      const result = await deps.modelRouter.chatJSON({
        task: "agent_plan",
        schema: AgentPlanSchema,
        temperature: 0.1,
        maxTokens: 500,
        timeoutMs: 8_000,
        messages: [
          { role: "system", content: PLAN_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              kind: input.kind,
              agent: input.agent,
              goal: input.goal,
              context: input.context ?? {},
              allowedTools: catalog
            })
          }
        ]
      });
      const valid = result.steps.filter((step) => allowed.includes(step.tool));
      const plan = valid.length ? { ...result, steps: valid.slice(0, 4) } : fallbackPlan(input, allowed);
      steps.push({
        index: steps.length,
        type: "plan",
        label: "制定只读工具计划",
        detail: plan.rationale,
        args: { steps: plan.steps.map((step) => step.tool) }
      });
      return { plan, usedModel: valid.length > 0 };
    } catch {
      const plan = fallbackPlan(input, allowed);
      steps.push({
        index: steps.length,
        type: "plan",
        label: "使用规则工具计划",
        detail: plan.rationale,
        args: { steps: plan.steps.map((step) => step.tool) }
      });
      return { plan, usedModel: false };
    }
  }

  async function runTask(input: AgentTaskInput): Promise<AgentTaskResult> {
    const started = Date.now();
    const steps: AgentTraceStep[] = [];
    const citations: AgentCitation[] = [];
    const facts: string[] = [];
    let usedModel = false;

    const user: SessionUser = {
      userId: input.userId,
      role: input.agent === "family" ? "family" : "elder",
      elderId: input.elderId,
      exp: Date.now() + 60_000
    };
    const ctx: ToolContext = {
      user,
      sessionId: input.sessionId ?? `trace_${input.requestId}`,
      requestId: input.requestId,
      elderId: input.elderId,
      ...(input.signal ? { signal: input.signal } : {})
    };

    const allowed = Array.from(
      new Set(
        (input.allowedTools ?? DEFAULT_TOOLS[input.kind]).filter((name) => {
          const tool = deps.toolRegistry.get(name);
          return Boolean(tool && tool.roles.includes(user.role) && tool.risk === "read");
        })
      )
    );

    try {
      const planned = await plan(input, allowed, steps);
      usedModel = usedModel || planned.usedModel;
      const plannedSteps = planned.plan.steps.slice(0, Math.max(1, Math.min(input.maxTools ?? 4, 4)));

      for (const step of plannedSteps) {
        const tool = deps.toolRegistry.get(step.tool);
        if (!tool) continue;
        const args = toolArgs(step.tool, step.args);
        steps.push({
          index: steps.length,
          type: "tool_call",
          label: `调用 ${step.tool}`,
          tool: step.tool,
          args,
          detail: step.reason
        });
        const toolStarted = Date.now();
        try {
          const result = await deps.toolRegistry.execute(step.tool, args, ctx);
          const latencyMs = Date.now() - toolStarted;
          steps.push({
            index: steps.length,
            type: "tool_result",
            label: `${step.tool} 返回`,
            tool: step.tool,
            ok: true,
            latencyMs,
            detail: result.summary.slice(0, 300)
          });
          facts.push(result.summary.slice(0, 300));
          mergeCitations(citations, extractCitations(result.data));
        } catch (err) {
          steps.push({
            index: steps.length,
            type: "tool_result",
            label: `${step.tool} 失败`,
            tool: step.tool,
            ok: false,
            latencyMs: Date.now() - toolStarted,
            detail: err instanceof Error ? err.message : "tool_failed"
          });
        }
      }

      const decisionMessages = [
        { role: "system" as const, content: `${ROLE_PROMPTS[input.agent]}\n${DECISION_SYSTEM_PROMPT}` },
        {
          role: "user" as const,
          content: JSON.stringify({
            kind: input.kind,
            agent: input.agent,
            trigger: input.trigger,
            goal: input.goal,
            context: input.context ?? {},
            facts,
            citations
          })
        }
      ];

      let payload: AgentDecisionPayload;
      try {
        payload = await deps.modelRouter.chatJSON({
          task: "agent_decision",
          schema: AgentDecisionSchema,
          temperature: 0.2,
          maxTokens: 900,
          timeoutMs: 12_000,
          messages: decisionMessages
        });
        usedModel = true;
      } catch {
        payload = fallbackDecision(input, facts);
      }

      const decision = normalizeDecision(input, payload, citations, usedModel, deps.modelRouter.mode);
      steps.push({
        index: steps.length,
        type: "decision",
        label: "生成结构化决策",
        detail: decision.summary,
        ok: true
      });

      const trace = deps.db.agentTraces.create({
        elderId: input.elderId,
        userId: input.userId,
        agent: input.agent,
        trigger: input.trigger,
        goal: input.goal,
        status: decision.needsConfirmation ? "needs_confirmation" : "ok",
        decision,
        steps,
        citations,
        model: deps.modelRouter.mode,
        latencyMs: Date.now() - started
      });

      return { decision, traceId: trace.id };
    } catch (err) {
      steps.push({
        index: steps.length,
        type: "error",
        label: "任务失败",
        detail: err instanceof Error ? err.message : "agent_failed",
        ok: false
      });
      const decision = normalizeDecision(
        input,
        fallbackDecision(input, facts),
        citations,
        false,
        deps.modelRouter.mode
      );
      const trace = deps.db.agentTraces.create({
        elderId: input.elderId,
        userId: input.userId,
        agent: input.agent,
        trigger: input.trigger,
        goal: input.goal,
        status: "error",
        decision,
        steps,
        citations,
        model: deps.modelRouter.mode,
        latencyMs: Date.now() - started
      });
      return { decision, traceId: trace.id };
    }
  }

  return { runTask, todayKey };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
