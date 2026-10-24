import React from "react";
import type { PrivacySettings, Profile, TrendMetric, WeatherForecast24h, WeatherRealtime, WeatherToday } from "@eha/shared";

type Api = {
  baseUrl: string;
  getPrivacy(): Promise<PrivacySettings>;
  setPrivacy(input: PrivacySettings): Promise<PrivacySettings>;
  getProfile(): Promise<Profile | null>;
  getProfileMeta(): Promise<{ savedAt: number | null }>;
  setProfile(input: Profile): Promise<Profile>;
  deleteProfile(): Promise<{ ok: true }>;
  uploadAvatar(file: File): Promise<{ avatarUrl: string; thumbnails: Record<string, string> }>;
  getTrends(): Promise<{ metrics: TrendMetric[] }>;
  addManualRecord(input: {
    date?: string;
    steps?: number;
    sleepHours?: number;
    activeMinutes?: number;
    outdoorMinutes?: number;
    moodScore?: number;
  }): Promise<{ ok: boolean }>;
  ask(question: string, conversationId?: string): Promise<{
    answer: string;
    raw: string;
    provider: string;
    conversationId: string;
    intent?: string;
  }>;
  triggerEmergency(reason: string): Promise<{ ok: boolean; profilePresent: boolean }>;
  getWeatherToday(loc?: string): Promise<WeatherToday>;
  getWeatherRealtime(loc?: string): Promise<WeatherRealtime>;
  getWeatherForecast24h(loc?: string): Promise<WeatherForecast24h>;
  askWeather(question: string): Promise<{
    answer: string;
    raw: string;
    provider: string;
    location: WeatherRealtime["location"];
    realtime: WeatherRealtime;
    forecast24h: WeatherForecast24h;
  }>;
  getWeatherAdvice(question: string, loc?: string): Promise<{ ok: true; provider: string; raw: string }>;
  resolveWeatherAddress(address: string): Promise<{ ok: true; location: WeatherRealtime["location"]; fullText: string; adcode: string }>;
  logVitalityFromSpeech(text: string): Promise<{
    ok: boolean;
    provider: string;
    raw: string;
    parsed: {
      steps: number | null;
      sleepHours: number | null;
      activeMinutes: number | null;
      outdoorMinutes: number | null;
      moodScore: number | null;
      summary: string;
    };
  }>;
  getVitalityScore(): Promise<{
    ok: boolean;
    provider: string;
    raw: string;
    score: number;
    suggestions: string[];
    history: { ts: number; score: number; factors?: string[] }[];
  }>;
  getHealthAnalysis(): Promise<{
    ok: boolean;
    insights: string;
    raw: string;
    provider: string;
    latest: Record<string, number>;
    metrics: TrendMetric[];
  }>;
  generateAdvice(symptoms?: string): Promise<{
    ok: boolean;
    provider: string;
    raw: string;
    structured: Record<string, unknown>;
  }>;
  generateCheckupPlan(goal?: string): Promise<{ ok: boolean; provider: string; raw: string }>;
  evaluateDiet(meals: string): Promise<{ ok: boolean; provider: string; raw: string }>;
  recommendMeals(preferences?: string): Promise<{ ok: boolean; provider: string; raw: string }>;
  emitMock(type: string, payload: Record<string, unknown>): Promise<void>;
};

const Ctx = React.createContext<Api | null>(null);

async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = typeof init?.body !== "undefined";
  if (hasBody && typeof init?.body === "string" && init.body.trim() === "") {
    throw new Error("invalid_body:Body cannot be empty when Content-Type is set to 'application/json'");
  }
  const res = await fetch(url, {
    ...init,
    headers: hasBody ? { "content-type": "application/json", ...(init?.headers ?? {}) } : { ...(init?.headers ?? {}) }
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? (JSON.parse(text) as any) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
    const msg = typeof json?.message === "string" ? json.message : "";
    throw new Error(msg ? `${code}:${msg}` : code);
  }
  return json as T;
}

export function ApiProvider({
  baseUrl,
  children
}: {
  baseUrl: string;
  children: React.ReactNode;
}) {
  const api = React.useMemo<Api>(() => {
    return {
      baseUrl,
      getPrivacy: () => httpJson(`${baseUrl}/privacy`),
      setPrivacy: (input) =>
        httpJson(`${baseUrl}/privacy`, {
          method: "PUT",
          body: JSON.stringify(input)
        }),
      getProfile: () => httpJson(`${baseUrl}/profile`),
      getProfileMeta: () => httpJson(`${baseUrl}/profile/meta`),
      setProfile: (input) =>
        httpJson(`${baseUrl}/profile`, {
          method: "PUT",
          body: JSON.stringify(input)
        }),
      deleteProfile: () =>
        httpJson(`${baseUrl}/profile`, {
          method: "DELETE"
        }),
      uploadAvatar: (file) => {
        const fd = new FormData();
        fd.append("avatar", file);
        return fetch(`${baseUrl}/profile/avatar`, {
          method: "POST",
          body: fd
        }).then((res) => {
          if (!res.ok) throw new Error("上传失败");
          return res.json();
        });
      },
      getTrends: () => httpJson(`${baseUrl}/records/trends`),
      addManualRecord: (input) =>
        httpJson(`${baseUrl}/records/manual`, {
          method: "POST",
          body: JSON.stringify(input)
        }),
      ask: (question, conversationId) =>
        httpJson(`${baseUrl}/qa/ask`, {
          method: "POST",
          body: JSON.stringify({ question, conversationId })
        }),
      triggerEmergency: (reason) =>
        httpJson(`${baseUrl}/emergency/trigger`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),
      getWeatherToday: (loc) => httpJson(`${baseUrl}/weather/today${loc ? `?loc=${encodeURIComponent(loc)}` : ""}`),
      getWeatherRealtime: (loc) => httpJson(`${baseUrl}/weather/realtime${loc ? `?loc=${encodeURIComponent(loc)}` : ""}`),
      getWeatherForecast24h: (loc) => httpJson(`${baseUrl}/weather/forecast24h${loc ? `?loc=${encodeURIComponent(loc)}` : ""}`),
      askWeather: (question) =>
        httpJson(`${baseUrl}/weather/ask`, {
          method: "POST",
          body: JSON.stringify({ question })
        }),
      getWeatherAdvice: (question, loc) =>
        httpJson(`${baseUrl}/weather/advice${loc ? `?loc=${encodeURIComponent(loc)}` : ""}`, {
          method: "POST",
          body: JSON.stringify({ question })
        }),
      resolveWeatherAddress: (address) => httpJson(`${baseUrl}/weather/resolve?address=${encodeURIComponent(address)}`),
      getHealthAnalysis: () => httpJson(`${baseUrl}/analysis/health`),
      generateAdvice: (symptoms) =>
        httpJson(`${baseUrl}/advice/generate`, {
          method: "POST",
          body: JSON.stringify({ symptoms })
        }),
      generateCheckupPlan: (goal) =>
        httpJson(`${baseUrl}/advice/checkup-plan`, {
          method: "POST",
          body: JSON.stringify({ goal })
        }),
      evaluateDiet: (meals) =>
        httpJson(`${baseUrl}/advice/diet-evaluate`, {
          method: "POST",
          body: JSON.stringify({ meals })
        }),
      recommendMeals: (preferences) =>
        httpJson(`${baseUrl}/advice/meal-recommend`, {
          method: "POST",
          body: JSON.stringify({ preferences })
        }),
      logVitalityFromSpeech: (text) =>
        httpJson(`${baseUrl}/vitality/log-from-speech`, {
          method: "POST",
          body: JSON.stringify({ text })
        }),
      getVitalityScore: () =>
        httpJson(`${baseUrl}/vitality/score`, {
          method: "POST",
          body: JSON.stringify({})
        }),
      emitMock: async (type, payload) => {
        await httpJson(`${baseUrl}/mock/emit`, {
          method: "POST",
          body: JSON.stringify({ type, payload })
        });
      }
    };
  }, [baseUrl]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApi() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("ApiProvider missing");
  return ctx;
}
