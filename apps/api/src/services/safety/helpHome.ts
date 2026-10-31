import type { AppDb, DbLocation } from "../../store/db.js";
import type { AddressService } from "../location/address.js";
import type { createEventBus } from "../eventBus.js";
import { distanceMeters } from "./geofence.js";

export type GeoPoint = { lat: number; lng: number; accuracy?: number | null };

const LIVE_WINDOW_MS = 10 * 60 * 1000;

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
  homeAddress: string | null;
  currentAddress: string | null;
  distanceMeters: number | null;
  direction: string | null;
  walkMinutes: number | null;
  steps: string[];
  familyPhone: string | null;
  familyRelation: string | null;
  lastLocation: { lat: number; lng: number; accuracy: number | null; ts: number } | null;
  locationSource: string | null;
  locationLive: boolean;
  spoken: string;
  disclaimer: string;
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${meters} 米` : `${(meters / 1000).toFixed(1)} 公里`;
}

export function buildHelpMessage(input: {
  location: DbLocation | null;
  address: string | null;
  live: boolean;
}): string {
  if (!input.location) {
    return "我找不到家了，请帮我看看位置，先给我打个电话。";
  }
  const coords = `${input.location.lat.toFixed(5)}, ${input.location.lng.toFixed(5)}`;
  if (input.live && input.address) {
    return `我在${input.address}附近找不到家了，请帮我看看位置。`;
  }
  if (input.live) {
    return `我在外面找不到家了，最后定位：${coords}，请帮我看看位置。`;
  }
  if (input.address) {
    return `我找不到家了。最后一次位置在${input.address}附近（${formatTime(input.location.ts)}），请帮我看看。`;
  }
  return `我找不到家了。最后一次位置：${coords}（${formatTime(input.location.ts)}），请帮我看看。`;
}

function buildCard(input: {
  homeName: string;
  homeAddress: string | null;
  currentAddress: string | null;
  location: DbLocation | null;
  locationLive: boolean;
  home: GeoPoint | null;
  familyPhone: string | null;
  familyRelation: string | null;
}): HelpHomeCard {
  const relation = input.familyRelation ? `您的${input.familyRelation}` : "家人";
  if (!input.location) {
    return {
      homeName: input.homeName,
      homeAddress: input.homeAddress,
      currentAddress: null,
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
      locationSource: null,
      locationLive: false,
      spoken: `我现在还没有看到您的位置。您先别着急，站在安全的地方，给${relation}打个电话。`,
      disclaimer: "位置没有更新时，先以电话联系和身边人求助为主。"
    };
  }

  const distance = input.home
    ? Math.round(
        distanceMeters(
          input.location.lat,
          input.location.lng,
          input.home.lat,
          input.home.lng
        )
      )
    : null;
  const direction =
    input.home && distance !== null
      ? directionLabel(bearingDegrees(input.location, input.home))
      : null;
  const walkMinutes = distance === null ? null : Math.max(1, Math.round(distance / 70));
  const steps: string[] = [];
  const demo = input.location.source === "demo";
  if (!input.locationLive) {
    steps.push(
      demo
        ? "现在没有实时定位，下面是演示位置，不能当作您真正站的地方。"
        : "这是最后一次记录的位置，可能不是您现在站的地方。先看看身边的门牌或店铺，把您现在的位置告诉家人。"
    );
  }
  if (input.locationLive && input.currentAddress) {
    steps.push(`您现在在${input.currentAddress}附近，可以把这个地方告诉家人。`);
  }
  if (distance !== null && direction && distance <= 60) {
    steps.push("您已经在家附近了，慢慢看看门牌，不要着急。");
  } else if (distance !== null && direction && distance <= 800) {
    steps.push(`朝${direction}方向走大约 ${formatDistance(distance)}，约 ${walkMinutes} 分钟。`);
  } else if (distance !== null && direction) {
    steps.push(`家大概在${direction}方向，距离约 ${formatDistance(distance)}，比较远。`);
    steps.push("建议先停在人多、明亮的地方，给家人打电话，不要一个人走远。");
  } else {
    steps.push("先站在安全、明亮的地方，不要继续走远。");
  }
  steps.push("看看身边的店铺招牌、路牌或小区名字，告诉家人。");
  steps.push(`给${relation}打电话；如果打不通，请身边人帮忙拨打 110。`);
  steps.push("不要跟陌生人去偏僻的地方，也不要上陌生人的车。");

  const placeNote = input.locationLive
    ? input.currentAddress
      ? `您现在在${input.currentAddress}附近。`
      : ""
    : demo
      ? "现在没有实时位置，我只能看到演示位置。"
      : "这是最后一次记录的位置，可能不是您现在的位置。";
  const spoken =
    distance !== null && direction && distance > 800
      ? `${placeNote}您先别急，站在安全的地方别走动。我已经通知${relation}了。家大概在${direction}方向，距离约 ${formatDistance(distance)}，您把身边的店铺招牌告诉${relation}，等家人来接您。`
      : distance !== null && direction
        ? `${placeNote}您先别急。我已经通知${relation}了。家在${direction}方向大约 ${formatDistance(distance)}，您慢慢走，看看门牌，也可以先给${relation}打电话。`
        : `${placeNote}您先别急。我已经通知${relation}了。先站在安全的地方，给${relation}打个电话。`;

  return {
    homeName: input.homeName,
    homeAddress: input.homeAddress,
    currentAddress: input.currentAddress,
    distanceMeters: distance,
    direction,
    walkMinutes,
    steps,
    familyPhone: input.familyPhone,
    familyRelation: input.familyRelation,
    lastLocation: {
      lat: input.location.lat,
      lng: input.location.lng,
      accuracy: input.location.accuracy,
      ts: input.location.ts
    },
    locationSource: input.location.source,
    locationLive: input.locationLive,
    spoken,
    disclaimer: input.locationLive
      ? "方向和距离根据这次定位估算，仅供参考；找不到路时优先联系家人或 110。"
      : "位置不是实时定位，方向和距离仅供参考；请优先联系家人或 110。"
  };
}

export function createHelpHomeService(input: {
  db: AppDb;
  eventBus: ReturnType<typeof createEventBus>;
  address: AddressService;
}) {
  async function requestHelp(options: {
    elderId: string;
    userId: string;
    point?: GeoPoint;
  }): Promise<{ card: HelpHomeCard; alertId: string }> {
    const { elderId, userId } = options;
    const now = Date.now();
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
          accuracy: options.point.accuracy ?? null,
          source: "browser",
          ts: now
        }
      : latest;
    if (options.point) {
      await input.db.locations.insert({
        elderId,
        lat: options.point.lat,
        lng: options.point.lng,
        accuracy: options.point.accuracy ?? null,
        source: "browser",
        ts: now
      });
    }

    const locationLive = Boolean(
      location &&
        (options.point ||
          (location.source !== "demo" && now - location.ts <= LIVE_WINDOW_MS))
    );
    let currentAddress: string | null = null;
    if (location && location.source !== "demo") {
      try {
        currentAddress = (await input.address.reverse(location))?.address ?? null;
      } catch {
        currentAddress = null;
      }
    }

    const circle = geofences.find((geofence) => geofence.shape.type === "circle");
    const home = circle
      ? { lat: circle.shape.center[1], lng: circle.shape.center[0] }
      : null;
    const family = links[0] ?? null;
    const card = buildCard({
      homeName: circle?.name ?? "家附近",
      homeAddress: health?.homeAddress ?? null,
      currentAddress,
      location,
      locationLive,
      home,
      familyPhone: family?.phone ?? null,
      familyRelation:
        family?.relation === "daughter"
          ? "女儿"
          : family?.relation === "son"
            ? "儿子"
            : family?.relation ?? null
    });

    const alert = await input.db.safetyAlerts.create({
      elderId,
      type: "help_home",
      level: "critical",
      payload: {
        homeName: card.homeName,
        homeAddress: card.homeAddress,
        currentAddress: card.currentAddress,
        distanceMeters: card.distanceMeters,
        direction: card.direction,
        lastLocation: card.lastLocation,
        locationSource: card.locationSource,
        locationLive: card.locationLive,
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
        content: buildHelpMessage({ location, address: currentAddress, live: locationLive }),
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
        direction: card.direction,
        locationLive: card.locationLive,
        currentAddress: card.currentAddress
      },
      ip: ""
    });
    return { card, alertId: alert.id };
  }

  return { requestHelp };
}

export type HelpHomeService = ReturnType<typeof createHelpHomeService>;
