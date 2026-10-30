import type { AppDb, DbLocation } from "../../store/db.js";
import type { createEventBus } from "../eventBus.js";
import { distanceMeters } from "./geofence.js";

export type GeoPoint = { lat: number; lng: number };

export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function directionLabel(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const labels = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return labels[Math.round(normalized / 45) % 8] ?? "北";
}

export type HelpHomeCard = {
  homeName: string;
  address: string;
  distanceMeters: number | null;
  direction: string | null;
  walkMinutes: number | null;
  steps: string[];
  familyPhone: string | null;
  familyRelation: string | null;
  lastLocation: { lat: number; lng: number; ts: number } | null;
  spoken: string;
  disclaimer: string;
};

function buildCard(input: {
  homeName: string;
  address: string;
  location: DbLocation | null;
  home: GeoPoint | null;
  familyPhone: string | null;
  familyRelation: string | null;
}): HelpHomeCard {
  const relation = input.familyRelation ? `您的${input.familyRelation}` : "家人";
  if (!input.location) {
    return {
      homeName: input.homeName,
      address: input.address,
      distanceMeters: null,
      direction: null,
      walkMinutes: null,
      steps: [
        "先站在安全、明亮的地方，不要继续走远。",
        `给${relation}打电话，把身边的店铺招牌或门牌告诉家人。`,
        "如果身边有人，可以请对方帮忙拨打家人电话或 110。"
      ],
      familyPhone: input.familyPhone,
      familyRelation: input.familyRelation,
      lastLocation: null,
      spoken: `我现在还没有看到您的位置。您先别着急，站在安全的地方，给${relation}打个电话。`,
      disclaimer: "位置没有更新时，先以电话联系和身边人求助为主。"
    };
  }

  const distance = input.home
    ? Math.round(distanceMeters(input.location.lat, input.location.lng, input.home.lat, input.home.lng))
    : null;
  const direction =
    input.home && distance !== null
      ? directionLabel(bearingDegrees(input.location, input.home))
      : null;
  const walkMinutes = distance === null ? null : Math.max(1, Math.round(distance / 70));
  const steps: string[] = [];
  if (distance !== null && direction && distance <= 60) {
    steps.push("您已经在家附近了，慢慢看看门牌，不要着急。");
  } else if (distance !== null && direction && distance <= 800) {
    steps.push(`朝${direction}方向走大约 ${distance} 米，约 ${walkMinutes} 分钟。`);
  } else if (distance !== null && direction) {
    steps.push(`家大概在${direction}方向，距离约 ${distance} 米，比较远。`);
    steps.push("建议先停在人多、明亮的地方，给家人打电话，不要一个人走远。");
  } else {
    steps.push("先站在安全、明亮的地方，不要继续走远。");
  }
  steps.push("看看身边的店铺招牌、路牌或小区名字，告诉家人。");
  steps.push(`给${relation}打电话；如果打不通，请身边人帮忙拨打 110。`);
  steps.push("不要跟陌生人去偏僻的地方，也不要上陌生人的车。");
  const spoken =
    distance !== null && direction && distance > 800
      ? `您先别急，站在安全的地方别走动。我已经通知${relation}了。家大概在${direction}方向，距离有点远，您把身边的店铺招牌告诉${relation}，等家人来接您。`
      : distance !== null && direction
        ? `您先别急。我已经通知${relation}了。家在${direction}方向大约 ${distance} 米，您慢慢走，看看门牌，也可以先给${relation}打电话。`
        : `您先别急。我已经通知${relation}了。先站在安全的地方，给${relation}打个电话。`;

  return {
    homeName: input.homeName,
    address: input.address,
    distanceMeters: distance,
    direction,
    walkMinutes,
    steps,
    familyPhone: input.familyPhone,
    familyRelation: input.familyRelation,
    lastLocation: { lat: input.location.lat, lng: input.location.lng, ts: input.location.ts },
    spoken,
    disclaimer: "这是根据最后一次定位估算的方向，仅供参考；找不到路时优先联系家人或 110。"
  };
}

export function createHelpHomeService(input: {
  db: AppDb;
  eventBus: ReturnType<typeof createEventBus>;
}) {
  async function requestHelp(options: {
    elderId: string;
    userId: string;
    point?: GeoPoint;
  }): Promise<{ card: HelpHomeCard; alertId: string }> {
    const { elderId, userId } = options;
    const [latest, health, geofences, links] = await Promise.all([
      input.db.locations.latest(elderId),
      input.db.healthProfiles.getByElder(elderId),
      input.db.geofences.listByElder(elderId),
      input.db.familyLinks.listByElder(elderId)
    ]);
    const location: DbLocation | null = options.point
      ? {
          elderId,
          lat: options.point.lat,
          lng: options.point.lng,
          accuracy: null,
          source: "browser",
          ts: Date.now()
        }
      : latest;
    if (options.point) {
      await input.db.locations.insert({
        elderId,
        lat: options.point.lat,
        lng: options.point.lng,
        accuracy: null,
        source: "browser",
        ts: Date.now()
      });
    }

    const circle = geofences.find((geofence) => geofence.shape.type === "circle");
    const home = circle
      ? { lat: circle.shape.center[1], lng: circle.shape.center[0] }
      : null;
    const family = links[0] ?? null;
    const card = buildCard({
      homeName: circle?.name ?? "家附近",
      address: health?.homeAddress ?? "家里（地址还没登记）",
      location,
      home,
      familyPhone: family?.phone ?? null,
      familyRelation: family?.relation === "daughter" ? "女儿" : family?.relation === "son" ? "儿子" : family?.relation ?? null
    });

    const alert = await input.db.safetyAlerts.create({
      elderId,
      type: "help_home",
      level: "critical",
      payload: {
        homeName: card.homeName,
        address: card.address,
        distanceMeters: card.distanceMeters,
        direction: card.direction,
        lastLocation: card.lastLocation,
        familyPhone: card.familyPhone
      }
    });
    input.eventBus.publish({
      type: "safety.alert",
      ts: Date.now(),
      payload: { alert }
    });
    if (family) {
      await input.db.familyMessages.insert({
        elderId,
        familyUserId: family.familyUserId,
        fromRole: "elder",
        content: `我在${card.address}附近找不到家了，请帮我看看位置。`,
        kind: "sos"
      });
    }
    await input.db.auditLogs.insert({
      userId,
      action: "safety.help_home",
      targetType: "elder",
      targetId: elderId,
      meta: {
        alertId: alert.id,
        distanceMeters: card.distanceMeters,
        direction: card.direction
      },
      ip: ""
    });
    return { card, alertId: alert.id };
  }

  return { requestHelp };
}

export type HelpHomeService = ReturnType<typeof createHelpHomeService>;
