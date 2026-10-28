import type { AppEvent } from "@eha/shared";
import type { AgentDecision, AppDb, DbSafetyAlert } from "../../store/db.js";
import type { createEventBus } from "../eventBus.js";
import type { MemoryProfileService } from "../memory/profile.js";
import type { AgentRuntime } from "./runtime.js";

export type AlertAssessment = {
  summary: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  needsConfirmation: boolean;
  escalation: "none" | "family" | "emergency";
  likelyCause: string;
  actions: AgentDecision["actions"];
  traceId: string;
  engine: "rules" | "rules+llm";
  model: string;
  generatedAt: number;
};

const ALERT_LABELS: Record<string, string> = {
  "geofence.exit": "电子围栏越界",
  "geofence.enter": "回到电子围栏",
  cooling_off: "转账冷静期",
  "scam.high": "高风险诈骗提醒",
  "location.stale": "长时间没有位置更新"
};

function alertLabel(type: string) {
  return ALERT_LABELS[type] ?? "安全提醒";
}

function alertContext(alert: DbSafetyAlert) {
  const payload =
    alert.payload && typeof alert.payload === "object" && !Array.isArray(alert.payload)
      ? (alert.payload as Record<string, unknown>)
      : {};
  return {
    alertId: alert.id,
    alertType: alert.type,
    alertLevel: alert.level,
    occurredAt: alert.createdAt,
    geofenceName: typeof payload.geofenceName === "string" ? payload.geofenceName : undefined,
    distanceMeters:
      typeof payload.distanceMeters === "number" ? Math.round(payload.distanceMeters) : undefined,
    amount: typeof payload.amount === "number" ? payload.amount : undefined,
    hasLastPoint: Boolean(payload.lastPoint)
  };
}

function assessmentFromDecision(
  decision: AgentDecision,
  traceId: string
): AlertAssessment {
  return {
    summary: decision.summary,
    riskLevel: decision.riskLevel,
    confidence: decision.confidence,
    needsConfirmation: decision.needsConfirmation,
    escalation: decision.escalation,
    likelyCause: decision.explanation,
    actions: decision.actions,
    traceId,
    engine: decision.engine,
    model: decision.model,
    generatedAt: Date.now()
  };
}

export function createProactiveAgent(deps: {
  db: AppDb;
  eventBus: ReturnType<typeof createEventBus>;
  runtime: AgentRuntime;
  memoryProfile: MemoryProfileService;
}) {
  const inFlight = new Set<string>();
  const processed = new Set<string>();

  async function assess(alert: DbSafetyAlert): Promise<AlertAssessment | null> {
    if (processed.has(alert.id)) return null;
    const current = await deps.db.safetyAlerts.getById(alert.id);
    if (!current) return null;
    const payload =
      current.payload && typeof current.payload === "object" && !Array.isArray(current.payload)
        ? (current.payload as Record<string, unknown>)
        : {};
    if (payload.assessment) {
      processed.add(alert.id);
      return payload.assessment as AlertAssessment;
    }

    const label = alertLabel(current.type);
    await deps.memoryProfile.get(current.elderId).catch(() => undefined);
    const result = await deps.runtime.runTask({
      kind: "alert",
      agent: "guardian",
      trigger: "event",
      elderId: current.elderId,
      userId: "system_guardian",
      requestId: `alert_${current.id}`,
      goal: `研判一条${label}：结合最近位置、用药、天气和老人习惯，判断可能原因并给出下一步。`,
      context: alertContext(current),
      maxTools: 3
    });
    const assessment = assessmentFromDecision(result.decision, result.traceId);
    const updated = await deps.db.safetyAlerts.updatePayload(current.id, {
      ...payload,
      assessment
    });
    if (processed.size >= 500) processed.clear();
    processed.add(current.id);
    if (updated) {
      deps.eventBus.publish({
        type: "safety.alert.updated",
        ts: Date.now(),
        payload: { alert: updated }
      });
    }
    return assessment;
  }

  function assessInBackground(alert: DbSafetyAlert) {
    if (inFlight.has(alert.id) || processed.has(alert.id)) return;
    inFlight.add(alert.id);
    void assess(alert)
      .catch(() => undefined)
      .finally(() => inFlight.delete(alert.id));
  }

  function start() {
    let stopped = false;
    const unsubscribe = deps.eventBus.subscribe((event: AppEvent) => {
      if (stopped || event.type !== "safety.alert") return;
      const alert = (event.payload as { alert?: DbSafetyAlert }).alert;
      if (!alert?.id || !alert.elderId) return;
      assessInBackground(alert);
    });

    const backfill = setTimeout(async () => {
      if (stopped) return;
      try {
        for (const alert of await deps.db.safetyAlerts.listOpen(10)) {
          const payload =
            alert.payload && typeof alert.payload === "object" && !Array.isArray(alert.payload)
              ? (alert.payload as Record<string, unknown>)
              : {};
          if (payload.assessment) continue;
          assessInBackground(alert);
        }
      } catch {
        // Database may be closed during short-lived tests.
      }
    }, 0);
    backfill.unref?.();

    return () => {
      stopped = true;
      clearTimeout(backfill);
      unsubscribe();
    };
  }

  return { start, assess };
}

export type ProactiveAgent = ReturnType<typeof createProactiveAgent>;
