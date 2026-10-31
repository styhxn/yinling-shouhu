import type { AppDb, DbLocation } from "../../store/db.js";
import type { AddressService } from "./address.js";

export type LocationSummary = {
  point: DbLocation;
  address: string | null;
  text: string;
};

function formatTime(ts: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function sourceLabel(source: string) {
  if (source === "browser") return "手机定位";
  if (source === "wearable") return "手环定位";
  return "演示位置，非实时";
}

export function createLocationService(db: AppDb, address: AddressService) {
  async function latest(elderId: string): Promise<LocationSummary | null> {
    const point = await db.locations.latest(elderId);
    if (!point) return null;
    let resolved: Awaited<ReturnType<AddressService["reverse"]>> = null;
    if (point.source !== "demo") {
      try {
        resolved = await address.reverse(point);
      } catch {
        resolved = null;
      }
    }
    const place = resolved?.address
      ? `${resolved.address}附近`
      : `坐标 ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    return {
      point,
      address: resolved?.address ?? null,
      text: `${place}（${sourceLabel(point.source)}，${formatTime(point.ts)}）`
    };
  }

  return { latest };
}

export type LocationService = ReturnType<typeof createLocationService>;
