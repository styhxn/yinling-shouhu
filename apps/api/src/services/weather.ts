import type { AppConfig } from "../config.js";

export type WeatherToday = {
  city: string;
  summary: string;
  tempC: number | null;
  hiC: number | null;
  loC: number | null;
  source: "amap" | "demo";
  updatedAt: number;
};

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string, timeoutMs = 5_000): Promise<any> {
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

function demoWeather(location: string): WeatherToday {
  return {
    city: location || "南京",
    summary: "多云",
    tempC: 18,
    hiC: 21,
    loC: 14,
    source: "demo",
    updatedAt: Date.now()
  };
}

export function createWeatherService(config: AppConfig) {
  const cache = new Map<string, { ts: number; value: WeatherToday }>();

  async function getToday(location: string): Promise<WeatherToday> {
    const key = config.amapWebKey;
    if (!key) return demoWeather(location);

    const cached = cache.get(location);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.value;

    const geo = await fetchJson(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(location)}&key=${encodeURIComponent(key)}`
    );
    const item = geo?.geocodes?.[0];
    const adcode = typeof item?.adcode === "string" ? item.adcode : "";
    if (!adcode) return demoWeather(location);

    const weather = await fetchJson(
      `https://restapi.amap.com/v3/weather/weatherInfo?city=${encodeURIComponent(adcode)}&key=${encodeURIComponent(key)}&extensions=base`
    );
    const live = weather?.lives?.[0];
    if (!live) return demoWeather(location);

    const value: WeatherToday = {
      city: typeof live.city === "string" && live.city ? live.city : location,
      summary:
        `${typeof live.weather === "string" ? live.weather : "天气未知"} ` +
        `${typeof live.winddirection === "string" ? live.winddirection : ""}风` +
        `${typeof live.windpower === "string" ? live.windpower : ""}级`.trim(),
      tempC: toNumber(live.temperature),
      hiC: null,
      loC: null,
      source: "amap",
      updatedAt: Date.now()
    };
    cache.set(location, { ts: Date.now(), value });
    return value;
  }

  return { getToday };
}

export type WeatherService = ReturnType<typeof createWeatherService>;
