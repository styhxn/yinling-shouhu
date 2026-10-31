import type { AppConfig } from "../../config.js";

const PI = Math.PI;
const AXIS = 6378245.0;
const ECC = 0.00669342162296594323;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

export type GeoPoint = { lat: number; lng: number };

export type ResolvedAddress = {
  address: string;
  province: string | null;
  city: string | null;
  district: string | null;
  township: string | null;
  source: "amap" | "cache";
};

export type AddressService = {
  reverse(point: GeoPoint): Promise<ResolvedAddress | null>;
};

type Fetcher = (url: string, timeoutMs?: number) => Promise<unknown>;

function outOfChina(lat: number, lng: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number) {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number) {
  let ret =
    300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** 浏览器返回 WGS84，高德逆地理编码要求 GCJ-02；不转换会有数百米偏差。 */
export function wgs84ToGcj02(lat: number, lng: number): GeoPoint {
  if (outOfChina(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECC * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((AXIS * (1 - ECC)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function pickAddress(regeo: any): ResolvedAddress | null {
  const component = regeo?.addressComponent ?? {};
  const province = asText(component.province);
  const city = asText(component.city);
  const district = asText(component.district);
  const township = asText(component.township);
  const street = asText(component.streetNumber?.street);
  const formatted = asText(regeo?.formatted_address);
  const parts = [province, city, district, township, street].filter(
    (part, index, list): part is string => Boolean(part) && list.indexOf(part) === index
  );
  const address = formatted ?? (parts.length > 0 ? parts.join("") : null);
  if (!address) return null;
  return {
    address,
    province,
    city,
    district,
    township,
    source: "amap"
  };
}

async function fetchJson(url: string, timeoutMs = 3_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createAddressService(input: {
  config: AppConfig;
  fetcher?: Fetcher;
}): AddressService {
  const key = input.config.amapWebKey.trim();
  const fetcher = input.fetcher ?? fetchJson;
  const cache = new Map<string, { at: number; value: ResolvedAddress | null }>();
  const pending = new Map<string, Promise<ResolvedAddress | null>>();

  function prune() {
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (typeof oldest !== "string") break;
      cache.delete(oldest);
    }
  }

  function cachedValue(key: string): ResolvedAddress | null | undefined {
    const hit = cache.get(key);
    if (!hit) return undefined;
    const ttl = hit.value ? CACHE_TTL_MS : FAILURE_TTL_MS;
    if (Date.now() - hit.at >= ttl) return undefined;
    return hit.value ? { ...hit.value, source: "cache" } : null;
  }

  async function load(point: GeoPoint): Promise<ResolvedAddress | null> {
    // 约 100 米取整，既避免频繁请求高德配额，又保留街道级精度。
    const cacheKey = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    const cached = cachedValue(cacheKey);
    if (typeof cached !== "undefined") return cached;
    const inflight = pending.get(cacheKey);
    if (inflight) return inflight;

    const task = (async () => {
      const gcj = wgs84ToGcj02(point.lat, point.lng);
      const location = `${gcj.lng.toFixed(6)},${gcj.lat.toFixed(6)}`;
      const url =
        "https://restapi.amap.com/v3/geocode/regeo" +
        `?location=${encodeURIComponent(location)}` +
        `&key=${encodeURIComponent(key)}&extensions=base&radius=200`;
      const json = (await fetcher(url, 3_000)) as any;
      const value = json && String(json.status) === "1" ? pickAddress(json.regeocode) : null;
      cache.set(cacheKey, { at: Date.now(), value });
      prune();
      return value;
    })();

    pending.set(cacheKey, task);
    try {
      return await task;
    } finally {
      pending.delete(cacheKey);
    }
  }

  async function reverse(point: GeoPoint): Promise<ResolvedAddress | null> {
    if (!key) return null;
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
    return load(point);
  }

  return { reverse };
}
