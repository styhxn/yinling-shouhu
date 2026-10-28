import crypto from "node:crypto";
import type { AppDb } from "../store/db.js";
import { createDb } from "../store/db.js";
import type { ModelRouter } from "./llm/types.js";
import { createStoryService } from "./memory/story.js";
import { analyzeScamHybrid } from "./safety/scamAI.js";

export type EvalModule = "scam" | "story";

type ScamExpected = {
  riskLevel: "high" | "medium" | "low" | "unknown";
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
    expected: { riskLevel: "unknown", scamType: "other" }
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

function normalize(value: string) {
  return value.replace(/\s+/g, "");
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function seedEvalCases(db: AppDb) {
  for (const item of SCAM_CASES) {
    db.evalCases.upsert({
      id: item.id,
      module: "scam",
      question: item.text,
      expected: item.expected
    });
  }
  for (const item of STORY_CASES) {
    db.evalCases.upsert({
      id: item.id,
      module: "story",
      question: JSON.stringify(item.input),
      expected: item.expected
    });
  }
}

async function runScamCases(db: AppDb, modelRouter: ModelRouter): Promise<EvalModuleReport> {
  const startedAt = Date.now();
  const cases = db.evalCases.list("scam");
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
      if (result.riskLevel === expected.riskLevel) riskMatched += 1;
      else reasons.push(`风险等级 ${result.riskLevel} ≠ ${expected.riskLevel}`);
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
      quoteFaithfulnessPct: percent(flagsFaithful, flagsTotal),
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
  const cases = db.evalCases.list("story");
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

    const temp = createDb(":memory:", {
      masterKey: crypto.randomBytes(32),
      seed: false
    });
    try {
      const memory = temp.memories.create({
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
            `用词重合度 ${fidelity.groundingPct}% < ${expected.minGroundingPct}%`
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
      temp.close();
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

export async function runEvaluation(input: {
  db: AppDb;
  modelRouter: ModelRouter;
  modules?: EvalModule[];
}): Promise<EvalReport> {
  seedEvalCases(input.db);
  const modules =
    input.modules && input.modules.length > 0 ? input.modules : (["scam", "story"] as const);
  const runId = input.db.evalRuns.start();
  const startedAt = Date.now();

  try {
    const reports: EvalModuleReport[] = [];
    for (const module of modules) {
      if (module === "scam") reports.push(await runScamCases(input.db, input.modelRouter));
      if (module === "story") reports.push(await runStoryCases(input.db, input.modelRouter));
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
    input.db.evalRuns.finish(runId, report);
    return report;
  } catch (err) {
    input.db.evalRuns.finish(runId, {
      error: err instanceof Error ? err.message : "eval_failed"
    });
    throw err;
  }
}
