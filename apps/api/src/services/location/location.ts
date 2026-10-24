import type { AppDb, DbLocation } from "../../store/db.js";

export type LocationSummary = {
  point: DbLocation;
  text: string;
};

function formatTime(ts: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  return `${hours} 小时前`;
}

export function createLocationService(db: AppDb) {
  function latest(elderId: string): LocationSummary | null {
    const point = db.locations.latest(elderId);
    if (!point) return null;
    return {
      point,
      text: `南京市鼓楼区附近（${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}），${formatTime(point.ts)}`
    };
  }

  return { latest };
}

export type LocationService = ReturnType<typeof createLocationService>;
