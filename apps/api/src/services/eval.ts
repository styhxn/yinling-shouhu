import crypto from "node:crypto";
import { z } from "zod";
import type { AppDb } from "../store/db.js";
import { createDb } from "../store/db.js";
import { createSqliteClient } from "../store/sql.js";
import { createAgentRuntime } from "./agent/runtime.js";
import type { ToolDef, ToolRegistry } from "./agent/tools.js";
import type { ModelRouter } from "./llm/types.js";
import { createStoryService } from "./memory/story.js";
import { analyzeScamHybrid } from "./safety/scamAI.js";

export type EvalModule = "scam" | "story" | "agent";

type ScamExpected = {
  riskLevel: "high" | "medium" | "low" | "unknown";
  /** 语义上有多个可接受答案时使用，例如正常闲聊既可以是 low 也可以是 unknown。 */
  riskLevels?: Array<"high" | "medium" | "low" | "unknown">;
  scamType?: string;
  requireAny?: string[];
};

type StoryExpected = {
  minGroundingPct: number;
  minVerifiedQuotes: number;
};

type StoryCase = {
  title: string;
  summary: string;
  transcript: string;
};

type AgentExpected = {
  kind: "brief" | "alert";
  expectTools: string[];
  expectedRisk?: "low" | "medium" | "high";
  expectedEscalation?: "none" | "family" | "emergency";
  expectBriefItems?: boolean;
};

type AgentCase = {
  id: string;
  goal: string;
  context: Record<string, unknown>;
  expected: AgentExpected;
};

export type EvalFailure = {
  id: string;
  reasons: string[];
  actual?: unknown;
};

export type EvalModuleReport = {
  module: EvalModule;
  total: number;
  passed: number;
  passRate: number;
  metrics: Record<string, number | string>;
  failures: EvalFailure[];
  durationMs: number;
};

export type EvalReport = {
  runId: string;
  mode: string;
  startedAt: number;
  finishedAt: number;
  overall: { total: number; passed: number; passRate: number };
  modules: EvalModuleReport[];
};

const SCAM_CASES: Array<{ id: string; text: string; expected: ScamExpected }> = [
  {
    id: "scam_police",
    text: "我是警察，你涉嫌洗钱，把钱转到安全账户，不要告诉家里人。",
    expected: { riskLevel: "high", scamType: "impersonate_police", requireAny: ["安全账户", "转账"] }
  },
  {
    id: "scam_investment",
    text: "内部导师带你投资，稳赚不赔，提现前先充值 5 万保证金。",
    expected: { riskLevel: "high", scamType: "investment", requireAny: ["稳赚不赔", "保证金"] }
  },
  {
    id: "scam_health",
    text: "这个药能根治高血压，今天买二送一，别告诉医生。",
    expected: { riskLevel: "high", scamType: "health_product", requireAny: ["根治", "药"] }
  },
  {
    id: "scam_prize",
    text: "恭喜中奖，先交 800 元税费才能领取奖金。",
    expected: { riskLevel: "high", scamType: "prize", requireAny: ["中奖", "税费"] }
  },
  {
    id: "scam_part_time",
    text: "刷单做任务返利，先垫付，连单越多返得越多。",
    expected: { riskLevel: "high", scamType: "part_time", requireAny: ["刷单", "垫付"] }
  },
  {
    id: "scam_customer_service",
    text: "我是客服，你的订单异常需要退款，点这个链接处理。",
    expected: { riskLevel: "medium", scamType: "customer_service", requireAny: ["链接", "客服"] }
  },
  {
    id: "scam_loan",
    text: "无抵押贷款，额度高，先交手续费。",
    expected: { riskLevel: "medium", scamType: "loan", requireAny: ["贷款", "手续费"] }
  },
  {
    id: "scam_normal",
    text: "明天上午去菜市场买菜，顺便看看老邻居。",
    expected: { riskLevel: "unknown", riskLevels: ["low", "unknown"], scamType: "other" }
  }
];

const STORY_CASES: Array<{ id: string; input: StoryCase; expected: StoryExpected }> = [
  {
    id: "story_river",
    input: {
      title: "苏州河边的夏天",
      summary: "小时候住在苏州河边，夏天常和邻居下河捉鱼。",
      transcript:
        "问：小时候住在哪里？\n答：我小时候住在苏州河边，夏天常和邻居下河捉鱼。\n\n问：最难忘的是什么？\n答：母亲总在岸上喊我回家吃饭，我假装没听见。"
    },
    expected: { minGroundingPct: 40, minVerifiedQuotes: 1 }
  },
  {
    id: "story_workshop",
    input: {
      title: "纺织厂的第一天",
      summary: "十八岁进纺织厂，师傅教我看纱线。",
      transcript:
        "问：第一份工作是什么？\n答：我十八岁进纺织厂当挡车工，第一天师傅教我看纱线。\n\n问：最自豪的事？\n答：后来我带的徒弟比我还多。"
    },
    expected: { minGroundingPct: 40, minVerifiedQuotes: 1 }
  },
  {
    id: "story_family",
    input: {
      title: "一家人的年夜饭",
      summary: "每年除夕，老伴负责烧菜，孩子们贴春联。",
      transcript:
        "问：家里最热闹的一次聚会？\n答：每年除夕最热闹，老伴负责烧菜，孩子们贴春联。\n\n问：最想对孙辈说什么？\n答：一家人平平安安，比什么都好。"
    },
    expected: { minGroundingPct: 40, minVerifiedQuotes: 1 }
  }
];

const AGENT_CASES: AgentCase[] = [
  {
    id: "agent_brief",
    goal: "为长辈生成今天的贴心简报：先看用药，再看天气和位置安全，最后带一句与口述记忆有关的陪伴。",
    context: { briefDate: "2026-10-28" },
    expected: {
      kind: "brief",
      expectTools: ["get_medications", "get_weather", "get_memory_profile"],
      expectBriefItems: true
    }
  },
  {
    id: "agent_alert_geofence",
    goal: "研判一条电子围栏越界：结合最近位置、用药、天气和长辈习惯，判断可能原因并给出下一步。",
    context: {
      alertType: "geofence.exit",
      alertLevel: "critical",
      geofenceName: "家附近",
      distanceMeters: 1200
    },
    expected: {
      kind: "alert",
      expectTools: ["get_location", "get_medications"],
      expectedRisk: "high",
      expectedEscalation: "family"
    }
  },
  {
    id: "agent_alert_cooling_off",
    goal: "研判一条转账冷静期：结合最近位置、用药、天气和长辈习惯，判断可能原因并给出下一步。",
    context: { alertType: "cooling_off", alertLevel: "critical", amount: 50000 },
    expected: {
      kind: "alert",
      expectTools: ["get_location", "get_weather"],
      expectedRisk: "high",
      expectedEscalation: "family"
    }
  },
  {
    id: "agent_alert_stale",
    goal: "研判一条长时间没有位置更新：结合最近位置、用药、天气和长辈习惯，判断可能原因并给出下一步。",
    context: { alertType: "location.stale", alertLevel: "info" },
    expected: {
      kind: "alert",
      expectTools: ["get_location"],
      expectedRisk: "low",
      expectedEscalation: "none"
    }
  }
];

const AGENT_EVAL_TOOLS: ToolDef[] = [
  {
    name: "get_memory_profile",
    description: "读取记忆画像",
    parameters: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    risk: "read",
    roles: ["elder", "family"],
    requiresConfirmation: false,
    async handler() {
      return {
        summary: "记忆画像：常提到母亲、邻居；对苏州河边有清晰记忆。",
        data: { profile: { summary: "常提到母亲、邻居" } }
      };
    }
  },
  {
    name: "get_medications",
    description: "读取用药计划",
    parameters: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    risk: "read",
    roles: ["elder", "family"],
    requiresConfirmation: false,
    async handler() {
      return {
        summary: "氨氯地平 5mg：每日一次，每次 1 片；时间 08:00",
        data: { items: [{ name: "氨氯地平" }] }
      };
    }
  },
  {
    name: "get_weather",
    description: "查询天气",
    parameters: z.object({ location: z.string().min(1).max(64) }),
    jsonSchema: { type: "object", properties: { location: { type: "string" } } },
    risk: "read",
    roles: ["elder", "family"],
    requiresConfirmation: false,
    async handler() {
      return { summary: "南京：多云，18℃（来源：演示数据）", data: { city: "南京", tempC: 18 } };
    }
  },
  {
    name: "get_location",
    description: "读取最后位置",
    parameters: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    risk: "read",
    roles: ["elder", "family"],
    requiresConfirmation: false,
    async handler() {
      return {
        summary: "最后位置：南京市鼓楼区附近，5 分钟前（精度约 20 米）",
        data: { text: "南京市鼓楼区附近" }
      };
    }
  },
  {
    name: "search_memories",
    description: "检索记忆",
    parameters: z.object({
      query: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(5).optional()
    }),
    jsonSchema: { type: "object", properties: {} },
    risk: "read",
    roles: ["elder", "family"],
    requiresConfirmation: false,
    async handler() {
      return {
        summary: "找到 1 段相关记忆：河边捉鱼的夏天",
        data: {
          items: [{ title: "河边捉鱼的夏天" }],
          citations: [{ title: "河边捉鱼的夏天", type: "memory", id: "m_eval" }]
        }
      };
    }
  }
];

const AGENT_EVAL_REGISTRY: ToolRegistry = {
  list(role) {
    return AGENT_EVAL_TOOLS.filter((tool) => tool.roles.includes(role));
  },
  get(name) {
    return AGENT_EVAL_TOOLS.find((tool) => tool.name === name) ?? null;
  },
  schemas(role) {
    return AGENT_EVAL_TOOLS.filter((tool) => tool.roles.includes(role)).map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.jsonSchema
      }
    }));
  },
  async execute(name, input, ctx) {
    const tool = AGENT_EVAL_TOOLS.find((item) => item.name === name);
    if (!tool) throw new Error("unknown_tool");
    if (!tool.roles.includes(ctx.user.role)) throw new Error("forbidden_tool");
    return tool.handler(tool.parameters.parse(input), ctx);
  }
};

function normalize(value: string) {
  return value.replace(/\s+/g, "");
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export async function seedEvalCases(db: AppDb) {
  for (const item of SCAM_CASES) {
    await db.evalCases.upsert({
      id: item.id,
      module: "scam",
      question: item.text,
      expected: item.expected
    });
  }
  for (const item of STORY_CASES) {
    await db.evalCases.upsert({
      id: item.id,
      module: "story",
      question: JSON.stringify(item.input),
      expected: item.expected
    });
  }
  for (const item of AGENT_CASES) {
    await db.evalCases.upsert({
      id: item.id,
      module: "agent",
      question: JSON.stringify({ goal: item.goal, context: item.context }),
      expected: item.expected
    });
  }
}

async function runScamCases(db: AppDb, modelRouter: ModelRouter): Promise<EvalModuleReport> {
  const startedAt = Date.now();
  const cases = await db.evalCases.list("scam");
  const failures: EvalFailure[] = [];
  let passed = 0;
  let riskMatched = 0;
  let typeChecked = 0;
  let typeMatched = 0;
  let flagsTotal = 0;
  let flagsFaithful = 0;
  let llmUsed = 0;
  let confidenceSum = 0;

  for (const item of cases) {
    const expected = (item.expected ?? {}) as ScamExpected;
    const started = Date.now();
    try {
      const result = await analyzeScamHybrid({
        inputType: "text",
        text: item.question,
        modelRouter
      });
      const reasons: string[] = [];
      const acceptableRisk = expected.riskLevels?.length
        ? expected.riskLevels
        : [expected.riskLevel];
      if (acceptableRisk.includes(result.riskLevel)) riskMatched += 1;
      else reasons.push(`风险等级 ${result.riskLevel} ∉ ${acceptableRisk.join("/")}`);
      if (expected.scamType) {
        typeChecked += 1;
        if (result.scamType === expected.scamType) typeMatched += 1;
        else reasons.push(`类型 ${result.scamType} ≠ ${expected.scamType}`);
      }

      const haystack = [
        ...result.redFlags.map((flag) => `${flag.quote} ${flag.reason}`),
        ...result.actions,
        result.explanation ?? ""
      ].join(" ");
      if (
        expected.requireAny?.length &&
        !expected.requireAny.some((keyword) => haystack.includes(keyword))
      ) {
        reasons.push(`未命中任一关键词：${expected.requireAny.join(" / ")}`);
      }

      // 忠实度按模型原始引文统计（含被安全过滤掉的引文），避免过滤后恒为 100%。
      if (result.faithfulness) {
        flagsTotal += result.faithfulness.checked;
        flagsFaithful += result.faithfulness.checked - result.faithfulness.dropped;
        if (result.faithfulness.dropped > 0) {
          reasons.push(`有 ${result.faithfulness.dropped} 条引文不在原文中`);
        }
      } else {
        for (const flag of result.redFlags) {
          flagsTotal += 1;
          if (normalize(item.question).includes(normalize(flag.quote))) flagsFaithful += 1;
        }
        const unfaithful = result.redFlags.filter(
          (flag) => !normalize(item.question).includes(normalize(flag.quote))
        );
        if (unfaithful.length > 0) {
          reasons.push(`有 ${unfaithful.length} 条引文不在原文中`);
        }
      }

      if (result.engine === "rules+llm") llmUsed += 1;
      confidenceSum += result.confidence;

      if (reasons.length === 0) passed += 1;
      else {
        failures.push({
          id: item.id,
          reasons,
          actual: {
            riskLevel: result.riskLevel,
            scamType: result.scamType,
            redFlags: result.redFlags.map((flag) => flag.quote),
            latencyMs: Date.now() - started
          }
        });
      }
    } catch (err) {
      failures.push({
        id: item.id,
        reasons: [err instanceof Error ? err.message : "failed"],
        actual: { latencyMs: Date.now() - started }
      });
    }
  }

  return {
    module: "scam",
    total: cases.length,
    passed,
    passRate: percent(passed, cases.length),
    metrics: {
      riskAccuracyPct: percent(riskMatched, cases.length),
      typeAccuracyPct: percent(typeMatched, typeChecked),
      quoteFaithfulnessPct: flagsTotal > 0 ? percent(flagsFaithful, flagsTotal) : 100,
      quoteChecked: flagsTotal,
      avgConfidence: cases.length
        ? Number((confidenceSum / cases.length).toFixed(2))
        : 0,
      llmUsedPct: percent(llmUsed, cases.length),
      mode: modelRouter.mode
    },
    failures,
    durationMs: Date.now() - startedAt
  };
}

async function runStoryCases(db: AppDb, modelRouter: ModelRouter): Promise<EvalModuleReport> {
  const startedAt = Date.now();
  const cases = await db.evalCases.list("story");
  const failures: EvalFailure[] = [];
  let passed = 0;
  let groundingSum = 0;
  let verifiedTotal = 0;
  let fabricatedTotal = 0;
  let safeQuoteCases = 0;
  let aiUsed = 0;

  for (const item of cases) {
    const expected = (item.expected ?? {}) as StoryExpected;
    let input: StoryCase | null = null;
    try {
      input = JSON.parse(item.question) as StoryCase;
    } catch {
      failures.push({ id: item.id, reasons: ["用例 JSON 无法解析"] });
      continue;
    }

    const temp = await createDb(createSqliteClient(":memory:"), {
      masterKey: crypto.randomBytes(32),
      seed: false
    });
    try {
      const memory = await temp.memories.create({
        elderId: "eval_elder",
        title: input.title,
        summary: input.summary,
        transcript: input.transcript,
        tags: ["评测"],
        consent: true
      });
      const { chapter } = await createStoryService(temp, modelRouter).generate({
        elderId: "eval_elder",
        memoryIds: [memory.id]
      });
      const fidelity = chapter.fidelity;
      const reasons: string[] = [];
      if (!fidelity) {
        reasons.push("缺少口述依据元数据");
      } else {
        groundingSum += fidelity.groundingPct;
        verifiedTotal += fidelity.verifiedQuotes.length;
        fabricatedTotal += fidelity.removedQuotes.length;
        if (fidelity.removedQuotes.length === 0) safeQuoteCases += 1;
        if (fidelity.engine === "rules+llm") aiUsed += 1;
        if (fidelity.groundingPct < expected.minGroundingPct) {
          reasons.push(
            `口述要点保留 ${fidelity.groundingPct}% < ${expected.minGroundingPct}%`
          );
        }
        if (fidelity.verifiedQuotes.length < expected.minVerifiedQuotes) {
          reasons.push(
            `原文引语 ${fidelity.verifiedQuotes.length} < ${expected.minVerifiedQuotes}`
          );
        }
        if (
          fidelity.removedQuotes.some((quote) =>
            normalize(chapter.content).includes(normalize(`“${quote}”`))
          )
        ) {
          reasons.push("未去除模型编造的引号内容");
        }
      }

      if (reasons.length === 0) passed += 1;
      else {
        failures.push({
          id: item.id,
          reasons,
          actual: fidelity
            ? {
                groundingPct: fidelity.groundingPct,
                verifiedQuotes: fidelity.verifiedQuotes.length,
                removedQuotes: fidelity.removedQuotes.length,
                engine: fidelity.engine
              }
            : null
        });
      }
    } catch (err) {
      failures.push({
        id: item.id,
        reasons: [err instanceof Error ? err.message : "failed"]
      });
    } finally {
      await temp.close();
    }
  }

  return {
    module: "story",
    total: cases.length,
    passed,
    passRate: percent(passed, cases.length),
    metrics: {
      avgGroundingPct: cases.length
        ? Math.round(groundingSum / cases.length)
        : 0,
      verifiedQuotes: verifiedTotal,
      fabricatedQuotes: fabricatedTotal,
      safeQuoteRatePct: percent(safeQuoteCases, cases.length),
      aiUsedPct: percent(aiUsed, cases.length),
      mode: modelRouter.mode
    },
    failures,
    durationMs: Date.now() - startedAt
  };
}

async function runAgentCases(db: AppDb, modelRouter: ModelRouter): Promise<EvalModuleReport> {
  const startedAt = Date.now();
  const cases = await db.evalCases.list("agent");
  const failures: EvalFailure[] = [];
  const temp = await createDb(createSqliteClient(":memory:"), { masterKey: crypto.randomBytes(32), seed: false });
  const runtime = createAgentRuntime({
    db: temp,
    modelRouter,
    toolRegistry: AGENT_EVAL_REGISTRY
  });
  let passed = 0;
  let expectedToolTotal = 0;
  let expectedToolHit = 0;
  let riskChecked = 0;
  let riskMatched = 0;
  let escalationChecked = 0;
  let escalationMatched = 0;
  let toolCalls = 0;
  let stepTotal = 0;
  let completeTraces = 0;

  try {
    for (const item of cases) {
      const expected = (item.expected ?? {}) as AgentExpected;
      let input: { goal: string; context: Record<string, unknown> };
      try {
        input = JSON.parse(item.question) as { goal: string; context: Record<string, unknown> };
      } catch {
        failures.push({ id: item.id, reasons: ["用例 JSON 无法解析"] });
        continue;
      }

      try {
        const result = await runtime.runTask({
          kind: expected.kind,
          agent: expected.kind === "alert" ? "guardian" : "companion",
          trigger: expected.kind === "alert" ? "event" : "schedule",
          elderId: "eval_elder",
          userId: "eval_agent",
          requestId: `eval_${item.id}`,
          goal: input.goal,
          context: input.context,
          maxTools: 4
        });
        const trace = await temp.agentTraces.getById(result.traceId);
        const calledTools =
          trace?.steps.filter((step) => step.type === "tool_call").map((step) => step.tool ?? "") ?? [];
        toolCalls += calledTools.length;
        stepTotal += trace?.steps.length ?? 0;

        const calledSet = new Set(calledTools);
        const hit = expected.expectTools.filter((tool) => calledSet.has(tool));
        expectedToolTotal += expected.expectTools.length;
        expectedToolHit += hit.length;

        const hasPlan = Boolean(trace?.steps.some((step) => step.type === "plan"));
        const hasToolResult = Boolean(trace?.steps.some((step) => step.type === "tool_result"));
        const hasDecision = Boolean(trace?.steps.some((step) => step.type === "decision"));
        if (hasPlan && hasToolResult && hasDecision) completeTraces += 1;

        const reasons: string[] = [];
        if (!result.decision.summary.trim()) reasons.push("缺少决策摘要");
        if (hit.length < expected.expectTools.length) {
          reasons.push(
            `缺少工具：${expected.expectTools.filter((tool) => !calledSet.has(tool)).join("、")}`
          );
        }
        if (expected.expectBriefItems && !(result.decision.briefItems?.length ?? 0)) {
          reasons.push("简报没有生成 briefItems");
        }
        if (expected.kind === "alert" && result.decision.actions.length === 0) {
          reasons.push("告警没有给出建议动作");
        }
        if (expected.expectedRisk) {
          riskChecked += 1;
          if (result.decision.riskLevel === expected.expectedRisk) riskMatched += 1;
          else reasons.push(`风险 ${result.decision.riskLevel} ≠ ${expected.expectedRisk}`);
        }
        if (expected.expectedEscalation) {
          escalationChecked += 1;
          if (result.decision.escalation === expected.expectedEscalation) escalationMatched += 1;
          else reasons.push(`升级 ${result.decision.escalation} ≠ ${expected.expectedEscalation}`);
        }
        if (!hasPlan || !hasToolResult || !hasDecision) {
          reasons.push("轨迹不完整（缺少计划/工具结果/决策）");
        }

        if (reasons.length === 0) passed += 1;
        else {
          failures.push({
            id: item.id,
            reasons,
            actual: {
              riskLevel: result.decision.riskLevel,
              escalation: result.decision.escalation,
              tools: calledTools,
              steps: trace?.steps.length ?? 0
            }
          });
        }
      } catch (err) {
        failures.push({
          id: item.id,
          reasons: [err instanceof Error ? err.message : "failed"]
        });
      }
    }
  } finally {
    await temp.close();
  }

  return {
    module: "agent",
    total: cases.length,
    passed,
    passRate: percent(passed, cases.length),
    metrics: {
      taskSuccessPct: percent(passed, cases.length),
      toolCoveragePct: percent(expectedToolHit, expectedToolTotal),
      riskAccuracyPct: percent(riskMatched, riskChecked),
      escalationAccuracyPct: percent(escalationMatched, escalationChecked),
      traceCompletenessPct: percent(completeTraces, cases.length),
      avgToolCalls: cases.length ? Number((toolCalls / cases.length).toFixed(1)) : 0,
      avgSteps: cases.length ? Number((stepTotal / cases.length).toFixed(1)) : 0,
      mode: modelRouter.mode
    },
    failures,
    durationMs: Date.now() - startedAt
  };
}

export async function runEvaluation(input: {
  db: AppDb;
  modelRouter: ModelRouter;
  modules?: EvalModule[];
}): Promise<EvalReport> {
  await seedEvalCases(input.db);
  const modules =
    input.modules && input.modules.length > 0
      ? input.modules
      : (["scam", "story", "agent"] as const);
  const runId = await input.db.evalRuns.start();
  const startedAt = Date.now();

  try {
    const reports: EvalModuleReport[] = [];
    for (const module of modules) {
      if (module === "scam") reports.push(await runScamCases(input.db, input.modelRouter));
      if (module === "story") reports.push(await runStoryCases(input.db, input.modelRouter));
      if (module === "agent") reports.push(await runAgentCases(input.db, input.modelRouter));
    }
    const total = reports.reduce((sum, report) => sum + report.total, 0);
    const passed = reports.reduce((sum, report) => sum + report.passed, 0);
    const report: EvalReport = {
      runId,
      mode: input.modelRouter.mode,
      startedAt,
      finishedAt: Date.now(),
      overall: { total, passed, passRate: percent(passed, total) },
      modules: reports
    };
    await input.db.evalRuns.finish(runId, report);
    return report;
  } catch (err) {
    await input.db.evalRuns.finish(runId, {
      error: err instanceof Error ? err.message : "eval_failed"
    });
    throw err;
  }
}
