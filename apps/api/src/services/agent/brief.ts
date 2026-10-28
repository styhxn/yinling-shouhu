import type { AgentBriefContent, AgentBriefItem, AppDb } from "../../store/db.js";
import type { MemoryProfileService } from "../memory/profile.js";
import type { AgentRuntime } from "./runtime.js";
import { todayKey } from "./runtime.js";

export type BriefView = {
  date: string;
  greeting: string;
  summary: string;
  items: AgentBriefItem[];
  encouragement: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  engine: "rules" | "rules+llm";
  model: string;
  traceId: string | null;
  generatedAt: number;
};

function sortBriefItems(items: AgentBriefItem[]) {
  const rank = { now: 0, today: 1, later: 2 };
  const seen = new Set<string>();
  return [...items]
    .filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    })
    .sort((a, b) => rank[a.priority] - rank[b.priority]);
}

function greetingFor(name: string, now = new Date()) {
  const hour = now.getHours();
  const prefix = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  return `${name}，${prefix}`;
}

function viewFromContent(
  date: string,
  content: AgentBriefContent,
  traceId: string | null,
  generatedAt: number
): BriefView {
  return {
    date,
    greeting: content.greeting,
    summary: content.summary,
    items: content.items,
    encouragement: content.encouragement,
    riskLevel: content.riskLevel,
    confidence: content.confidence,
    engine: content.engine,
    model: content.model,
    traceId,
    generatedAt
  };
}

export function createBriefService(deps: {
  db: AppDb;
  runtime: AgentRuntime;
  memoryProfile: MemoryProfileService;
}) {
  async function nameOf(elderId: string) {
    return (await deps.db.elders.getById(elderId))?.displayName ?? "您";
  }

  async function generate(input: {
    elderId: string;
    userId: string;
    requestId: string;
    refresh?: boolean;
  }): Promise<{ brief: BriefView; cached: boolean }> {
    const date = todayKey();
    if (!input.refresh) {
      const existing = await deps.db.agentBriefs.getByDate(input.elderId, date);
      if (existing) {
        return {
          brief: viewFromContent(
            date,
            existing.content,
            existing.content.traceId ?? null,
            existing.updatedAt
          ),
          cached: true
        };
      }
    }

    await deps.memoryProfile.get(input.elderId).catch(() => undefined);
    const result = await deps.runtime.runTask({
      kind: "brief",
      agent: "companion",
      trigger: "schedule",
      elderId: input.elderId,
      userId: input.userId,
      requestId: input.requestId,
      goal: "为长辈生成今天的贴心简报：先看用药，再看天气和位置安全，最后带一句与口述记忆有关的陪伴。",
      context: { briefDate: date },
      maxTools: 4
    });

    const content: AgentBriefContent = {
      greeting: greetingFor(await nameOf(input.elderId)),
      summary: result.decision.summary,
      items: sortBriefItems(result.decision.briefItems ?? []),
      encouragement: "慢慢来，今天也会是稳当的一天。",
      riskLevel: result.decision.riskLevel,
      confidence: result.decision.confidence,
      engine: result.decision.engine,
      model: result.decision.model,
      traceId: result.traceId
    };
    const saved = await deps.db.agentBriefs.upsert({
      elderId: input.elderId,
      briefDate: date,
      content
    });
    return {
      brief: viewFromContent(date, saved.content, result.traceId, saved.updatedAt),
      cached: false
    };
  }

  async function getCached(
    elderId: string
  ): Promise<{ brief: BriefView; cached: boolean } | null> {
    const date = todayKey();
    const existing = await deps.db.agentBriefs.getByDate(elderId, date);
    if (!existing) return null;
    return {
      brief: viewFromContent(
        date,
        existing.content,
        existing.content.traceId ?? null,
        existing.updatedAt
      ),
      cached: true
    };
  }

  return { generate, getCached };
}

export type BriefService = ReturnType<typeof createBriefService>;
