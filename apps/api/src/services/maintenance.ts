import type { AppConfig } from "../config.js";
import type { AppDb } from "../store/db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MaintenanceResult = {
  locations: number;
  toolLogs: number;
  auditLogs: number;
  alerts: number;
  posters: number;
  agentTraces: number;
  agentBriefs: number;
};

export function createMaintenance(db: AppDb, config: AppConfig) {
  function dateKey(ts: number) {
    const d = new Date(ts);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  async function prune(now = Date.now()): Promise<MaintenanceResult> {
    const [locations, toolLogs, auditLogs, alerts, posters, agentTraces, agentBriefs] =
      await Promise.all([
        db.locations.deleteBefore(now - config.retention.locationDays * DAY_MS),
        db.toolLogs.deleteBefore(now - config.retention.toolLogDays * DAY_MS),
        db.auditLogs.deleteBefore(now - config.retention.auditDays * DAY_MS),
        db.safetyAlerts.deleteHandledBefore(now - config.retention.alertDays * DAY_MS),
        db.missingPosters.deleteExpiredBefore(now - config.retention.posterDays * DAY_MS),
        db.agentTraces.deleteBefore(now - config.retention.toolLogDays * DAY_MS),
        db.agentBriefs.deleteBefore(dateKey(now - 90 * DAY_MS))
      ]);
    return { locations, toolLogs, auditLogs, alerts, posters, agentTraces, agentBriefs };
  }

  return { prune };
}

export type Maintenance = ReturnType<typeof createMaintenance>;
