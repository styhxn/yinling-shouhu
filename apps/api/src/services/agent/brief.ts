import type { AgentBriefContent, AgentBriefItem, AppDb } from "../../store/db.js";
import type { MemoryProfileService } from "../memory/profile.js";
import { distanceMeters, distanceToGeofence, isInsideGeofence } from "../safety/geofence.js";
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

const BRIEF_ROUTES = new Set([
  "/elder/meds",
  "/elder/diet",
  "/elder/safety",
  "/elder/safety/help",
  "/elder/story",
  "/elder/today",
  "/elder/chat"
]);

function safeBriefHref(item: AgentBriefItem): AgentBriefItem {
  const text = `${item.title}${item.detail}`;
  const derived = /药|服用|mg|片|打卡/.test(text)
    ? "/elder/meds"
    : /天气|℃|雨|风|穿衣/.test(text)
      ? "/elder/today"
      : /记忆|故事|回忆/.test(text)
        ? "/elder/story"
        : /位置|围栏|找不到家/.test(text)
          ? "/elder/safety"
          : undefined;
  if (derived) return { ...item, href: derived };
  if (item.href && BRIEF_ROUTES.has(item.href)) return item;
  const { href: _drop, ...rest } = item;
  return rest;
}

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

function locationOutdatesBrief(
  content: AgentBriefContent,
  latest: { lat: number; lng: number; source: string } | null,
  outside: boolean
) {
  if (!latest || latest.source === "demo") return false;
  const saved = content.location;
  if (!saved) return true;
  if (distanceMeters(saved.lat, saved.lng, latest.lat, latest.lng) > 1500) return true;
  return outside && content.riskLevel === "low";
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
    const [latest, fences, health] = await Promise.all([
      deps.db.locations.latest(input.elderId),
      deps.db.geofences.listByElder(input.elderId),
      deps.db.healthProfiles.getByElder(input.elderId)
    ]);
    const activeFences = fences.filter((fence) => fence.active);
    const circle = activeFences.find((fence) => fence.shape.type === "circle");
    const outside = Boolean(
      latest &&
        latest.source !== "demo" &&
        activeFences.length > 0 &&
        activeFences.every((fence) => !isInsideGeofence(latest, fence.shape))
    );
    const distanceFromHome =
      latest && circle ? Math.round(distanceToGeofence(latest, circle.shape)) : null;
    if (!input.refresh) {
      const existing = await deps.db.agentBriefs.getByDate(input.elderId, date);
      if (existing && !locationOutdatesBrief(existing.content, latest, outside)) {
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
    const now = new Date();
    const localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const context: Record<string, unknown> = { briefDate: date, localTime };
    if (latest) {
      context.lastLocation = {
        lat: Number(latest.lat.toFixed(5)),
        lng: Number(latest.lng.toFixed(5)),
        ts: latest.ts,
        source: latest.source,
        live: latest.source !== "demo"
      };
    }
    if (health?.homeAddress) context.homeAddress = health.homeAddress;
    if (circle && distanceFromHome !== null) {
      context.geofenceName = circle.name;
      context.geofenceStatus = outside ? "outside" : "inside";
      context.distanceMeters = distanceFromHome;
    }
    const result = await deps.runtime.runTask({
      kind: "brief",
      agent: "companion",
      trigger: "schedule",
      elderId: input.elderId,
      userId: input.userId,
      requestId: input.requestId,
      goal:
        "为长辈生成今天的贴心简报：先看用药，再看天气和位置安全" +
        "（context.geofenceStatus 为 outside 时必须先说明已离开安全区域；lastLocation.live=false 时不得描述为实时位置或实时安全），" +
        "最后带一句与口述记忆有关的陪伴。",
      context,
      maxTools: 4
    });

    const distanceLabel =
      distanceFromHome === null
        ? ""
        : distanceFromHome >= 1000
          ? `${(distanceFromHome / 1000).toFixed(1)} 公里`
          : `${distanceFromHome} 米`;
    const outsideSummary =
      outside &&
      circle &&
      distanceFromHome !== null &&
      !/离开|越界|安全区域|距离|公里|米/.test(result.decision.summary)
        ? `长辈已离开${circle.name}，距离约 ${distanceLabel}，请先电话确认。`
        : result.decision.summary;

    const content: AgentBriefContent = {
      greeting: greetingFor(await nameOf(input.elderId)),
      summary: outsideSummary,
      items: sortBriefItems((result.decision.briefItems ?? []).map(safeBriefHref)),
      encouragement: "慢慢来，今天也会是稳当的一天。",
      riskLevel: outside
        ? result.decision.riskLevel === "low"
          ? "medium"
          : result.decision.riskLevel
        : result.decision.riskLevel,
      confidence: result.decision.confidence,
      engine: result.decision.engine,
      model: result.decision.model,
      traceId: result.traceId,
      location: latest
        ? { lat: latest.lat, lng: latest.lng, ts: latest.ts, source: latest.source }
        : null
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
