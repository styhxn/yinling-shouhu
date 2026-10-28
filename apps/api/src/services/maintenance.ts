import type { AppConfig } from "../config.js";
import type { AppDb } from "../store/db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MaintenanceResult = {
  locations: number;
  toolLogs: number;
  auditLogs: number;
  alerts: number;
  posters: number;
};

export function createMaintenance(db: AppDb, config: AppConfig) {
  function prune(now = Date.now()): MaintenanceResult {
    return {
      locations: db.locations.deleteBefore(now - config.retention.locationDays * DAY_MS),
      toolLogs: db.toolLogs.deleteBefore(now - config.retention.toolLogDays * DAY_MS),
      auditLogs: db.auditLogs.deleteBefore(now - config.retention.auditDays * DAY_MS),
      alerts: db.safetyAlerts.deleteHandledBefore(now - config.retention.alertDays * DAY_MS),
      posters: db.missingPosters.deleteExpiredBefore(now - config.retention.posterDays * DAY_MS)
    };
  }

  return { prune };
}

export type Maintenance = ReturnType<typeof createMaintenance>;
