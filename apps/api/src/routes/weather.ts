import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { callOpenAICompatibleChatWithFallback, ExternalServiceError, type ChatMessage, type OpenAICompatCandidate } from "../services/llm.js";

export const weatherRoutes: FastifyPluginAsync = async (server) => {
  type Location = { province: string; city: string; district: string; detail?: string | undefined };
  type Realtime = { location: Location; summary: string; tempC: number | null; humidityPct: number | null; windKph: number | null; observedAt: number };
  type Forecast24h = { location: Location; hours: Array<{ ts: number; tempC: number | null; precipPct: number | null; summary: string }>; updatedAt: number };
  type TodaySummary = { hiC: number | null; loC: number | null; uvIndex: number | null };
  type WeatherPayload = { realtime: Realtime; today: TodaySummary; nextHours: Forecast24h["hours"]; source: { provider: "amap"; fetchedAt: number; localtime: string | null; reportTimeMs: number; cityAdcode: string } };

  const AMAP_API_KEY = process.env.AMAP_WEB_KEY ?? process.env.AMAP_API_KEY ?? "";

  const AskWeatherSchema = z.object({
    question: z.string().min(1).max(200)
  });

  const cache = new Map<string, { ts: number; value: unknown }>();

  function cacheGet<T>(key: string, ttlMs: number): T | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > ttlMs) return null;
    return hit.value as T;
  }

  function cacheSet(key: string, value: unknown) {
    cache.set(key, { ts: Date.now(), value });
    if (cache.size > 200) {
      const first = cache.keys().next().value as string | undefined;
      if (first) cache.delete(first);
    }
  }

  function normalizeLocation(loc: Location) {
    return `${loc.province}/${loc.city}/${loc.district}/${loc.detail ?? ""}`;
  }

  function locationToQuery(loc: Location) {
    const parts = [loc.province, loc.city, loc.district].filter((x) => typeof x === "string" && x.trim() && x !== "本地");
    const q = parts.join("");
    const city = loc.city === "本地" ? "" : loc.city;
    const province = loc.province === "本地" ? "" : loc.province;
    const out = q || city || province;
    if (!out) throw new Error("missing_location");
    return out;
  }

  function parseLocationFromQuestion(question: string): Location | null {
    const q = question.replace(/\s+/g, "").trim();
    const idx = q.indexOf("天气");
    if (idx <= 0) {
        // Try to match just city name at start if "天气" is not present
        const m0 = q.match(/^([\u4e00-\u9fa5]{2,10})(省|市|区|县)?$/);
        if (!m0) return null;
        const name = (m0[1] ?? "").replace(/(省|市|自治区|特别行政区)$/g, "");
        if (!name) return null;
        const municipalities = ["北京", "上海", "天津", "重庆"];
        const isMunicipality = municipalities.some((m) => name.startsWith(m));
        if (isMunicipality) return { province: name.slice(0, 2), city: name.slice(0, 2), district: "本地" };
        return { province: name, city: name, district: "本地" };
    }
    let head = q.slice(0, idx);
    head = head.replace(/(怎么样|如何|怎样|咋样|好吗|呢|呀|？|\?)+$/g, "");
    head = head.replace(/^(今天|明天|后天|今晚|早上|中午|下午|晚上)/g, "");
    if (!head) return null;

    const municipalities = ["北京", "上海", "天津", "重庆"];
    const isMunicipality = municipalities.some((m) => head.startsWith(m));
    if (isMunicipality) {
      const city = head.slice(0, 2);
      const rest = head.slice(2);
      const district = rest || "本地";
      return { province: city, city, district };
    }

    const m = head.match(/^([\u4e00-\u9fa5]{2,8})([\u4e00-\u9fa5]{2,10})?$/);
    if (!m) return null;
    const province = (m[1] ?? "").replace(/(省|市|自治区|特别行政区)$/g, "");
    const city = (m[2] ?? m[1] ?? "").replace(/(市|地区|盟)$/g, "");
    if (!province || !city) return null;
    return { province, city, district: "本地" };
  }

  function safeNum(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  function parseAmapTime(text: string): number {
    const t = Date.parse(text.replace(/-/g, "/"));
    return Number.isFinite(t) ? t : Date.now();
  }

  async function fetchJson(url: string) {
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    if (!res.ok) throw new ExternalServiceError("upstream_error", `amap_${res.status}`, res.status >= 500);
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new ExternalServiceError("bad_response", "amap_bad_response", false);
    }
  }

  async function resolveAmapGeo(address: string) {
    const key = AMAP_API_KEY;
    if (!key) throw new ExternalServiceError("missing_config", "amap_missing_config", false);
    const u = new URL("https://restapi.amap.com/v3/geocode/geo");
    u.searchParams.set("address", address);
    u.searchParams.set("key", key);
    const json = await fetchJson(u.toString());
    const geo = json?.geocodes?.[0] ?? null;
    const code = typeof geo?.adcode === "string" ? geo.adcode : "";
    if (!code) throw new ExternalServiceError("bad_response", "amap_no_adcode", false);
    const province = typeof geo?.province === "string" ? geo.province : "";
    const cityRaw = geo?.city;
    const city =
      typeof cityRaw === "string"
        ? cityRaw
        : Array.isArray(cityRaw) && typeof cityRaw[0] === "string"
          ? cityRaw[0]
          : "";
    const district = typeof geo?.district === "string" ? geo.district : "";
    const formattedAddress = typeof geo?.formatted_address === "string" ? geo.formatted_address : "";
    return { adcode: code, province, city, district, formattedAddress };
  }

  async function fetchAmapLive(adcode: string) {
    const key = AMAP_API_KEY;
    if (!key) throw new ExternalServiceError("missing_config", "amap_missing_config", false);
    const u = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
    u.searchParams.set("city", adcode);
    u.searchParams.set("key", key);
    u.searchParams.set("extensions", "base");
    return await fetchJson(u.toString());
  }

  async function fetchAmapForecast(adcode: string) {
    const key = AMAP_API_KEY;
    if (!key) throw new ExternalServiceError("missing_config", "amap_missing_config", false);
    const u = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
    u.searchParams.set("city", adcode);
    u.searchParams.set("key", key);
    u.searchParams.set("extensions", "all");
    return await fetchJson(u.toString());
  }

  function buildWeatherPayload(loc: Location, adcode: string, liveJson: any, forecastJson: any): WeatherPayload {
    const live = liveJson?.lives?.[0] ?? null;
    const weather = typeof live?.weather === "string" ? live.weather : "—";
    const temperature = safeNum(live?.temperature);
    const humidity = safeNum(live?.humidity);
    const winddirection = typeof live?.winddirection === "string" ? live.winddirection : "";
    const windpower = typeof live?.windpower === "string" ? live.windpower : "";
    const reporttimeText = typeof live?.reporttime === "string" ? live.reporttime : "";
    const reportTimeMs = reporttimeText ? parseAmapTime(reporttimeText) : Date.now();
    
    const forecast0 = forecastJson?.forecasts?.[0] ?? null;
    const cast0 = forecast0?.casts?.[0] ?? null;
    const hiC = safeNum(cast0?.daytemp);
    const loC = safeNum(cast0?.nighttemp);
    
    const windText = winddirection && windpower ? ` ${winddirection}${windpower}级` : "";
    const summary = `${weather}${windText}`.trim();

    return {
      realtime: {
        location: loc,
        summary,
        tempC: temperature,
        humidityPct: humidity,
        windKph: null, // Amap base info doesn't give km/h easily, mostly power level
        observedAt: reportTimeMs
      },
      today: { hiC, loC, uvIndex: null },
      nextHours: [], // Amap basic forecast is daily, not hourly, unless we have premium? Leaving empty for now.
      source: { provider: "amap", fetchedAt: Date.now(), localtime: null, reportTimeMs, cityAdcode: adcode }
    };
  }

  async function resolveDefaultLocation(): Promise<Location | null> {
    const profile = await server.store.getProfile();
    const addresses = profile?.addresses ?? [];
    const id = profile?.defaultAddressId;
    const found = id ? addresses.find((a) => a.id === id) : null;
    const pick = found ?? addresses[0] ?? null;
    if (!pick) return null;
    return {
      province: pick.province,
      city: pick.city,
      district: pick.district,
      detail: pick.detail
    };
  }

  function locationFromQuery(query: Record<string, unknown>): Location | null {
    const province = typeof query.province === "string" ? query.province.trim() : "";
    const city = typeof query.city === "string" ? query.city.trim() : "";
    const district = typeof query.district === "string" ? query.district.trim() : "";
    const detail = typeof query.detail === "string" ? query.detail.trim() : undefined;
    if (!province || !city || !district) return null;
    return { province, city, district, detail: detail || undefined };
  }

  async function resolveLocation(query: Record<string, unknown>): Promise<Location | null> {
    const fromQuery = locationFromQuery(query);
    if (fromQuery) return fromQuery;
    const loc = typeof query.loc === "string" ? query.loc.trim() : "";
    if (loc) {
      return { province: loc, city: loc, district: "本地" };
    }
    const def = await resolveDefaultLocation();
    if (def) return def;
    return null;
  }

  async function getRealtime(loc: Location) {
    const key = `realtime:${normalizeLocation(loc)}`;
    const cached = cacheGet<Realtime>(key, 2 * 60_000);
    if (cached) return cached;
    const payload = await getWeatherPayload(loc);
    cacheSet(key, payload.realtime);
    return payload.realtime;
  }

  async function getForecast24h(loc: Location) {
    const key = `forecast24h:${normalizeLocation(loc)}`;
    const cached = cacheGet<Forecast24h>(key, 15 * 60_000);
    if (cached) return cached;
    const payload = await getWeatherPayload(loc);
    const data: Forecast24h = { location: loc, hours: [], updatedAt: payload.source.reportTimeMs };
    cacheSet(key, data);
    return data;
  }

  async function getWeatherPayload(loc: Location): Promise<WeatherPayload> {
    const key = `amap:${normalizeLocation(loc)}`;
    const cached = cacheGet<WeatherPayload>(key, 2 * 60_000);
    if (cached) return cached;
    const query = locationToQuery(loc);
    const geo = await resolveAmapGeo(query);
    const isFreeText = loc.province === loc.city && loc.district === "本地" && !loc.detail;
    const resolvedLoc: Location = isFreeText
      ? {
          province: geo.province || loc.province,
          city: geo.city || geo.province || loc.city,
          district: geo.district || "本地",
          detail: geo.formattedAddress || loc.detail
        }
      : loc;
    const [liveJson, forecastJson] = await Promise.all([fetchAmapLive(geo.adcode), fetchAmapForecast(geo.adcode)]);
    const payload = buildWeatherPayload(resolvedLoc, geo.adcode, liveJson, forecastJson);
    cacheSet(key, payload);
    return payload;
  }

  function buildCandidatesForWeather(): OpenAICompatCandidate[] {
    const qwenKey = process.env.QWEN_API_KEY ?? "";
    const qwenRawBaseUrl = process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    const qwenBaseUrl = qwenRawBaseUrl.endsWith("/v1") ? `${qwenRawBaseUrl}/` : qwenRawBaseUrl;
    const qwenModel = process.env.QWEN_MODEL ?? "qwen-plus";

    const doubaoKey = process.env.ARK_API_KEY ?? process.env.DOUBAO_API_KEY ?? "";
    const doubaoBaseUrl = process.env.ARK_BASE_URL ?? process.env.DOUBAO_BASE_URL ?? "";
    const doubaoModel = process.env.ARK_MODEL ?? process.env.DOUBAO_MODEL ?? "";

    const candidates: OpenAICompatCandidate[] = [];
    if (qwenKey) candidates.push({ provider: "qwen", baseUrl: qwenBaseUrl, apiKey: qwenKey, model: qwenModel });
    if (doubaoKey && doubaoBaseUrl && doubaoModel) candidates.push({ provider: "doubao", baseUrl: doubaoBaseUrl, apiKey: doubaoKey, model: doubaoModel });
    return candidates;
  }

  function formatWeatherText(input: { question: string; location: Location; weather: WeatherPayload }) {
    const w = input.weather;
    const r = w.realtime;
    const city = `${input.location.province}${input.location.city}${input.location.district}`.replace(/本地/g, "");
    const t = r.tempC != null ? `${r.tempC}°C` : "—";
    const hum = r.humidityPct != null ? `${r.humidityPct}%` : "—";
    const hi = w.today.hiC != null ? `${w.today.hiC}°C` : "—";
    const lo = w.today.loC != null ? `${w.today.loC}°C` : "—";
    const time = new Date(w.source.reportTimeMs).toLocaleString("zh-CN");
    
    const hasRain = /雨|雷阵雨|阵雨/.test(r.summary);
    const hasSnow = /雪/.test(r.summary);
    const needUmbrella = /带伞|雨伞|下雨|降雨/.test(input.question) ? hasRain : hasRain;
    const hint = needUmbrella ? "建议携带雨具" : "可不带雨具";
    const cold = typeof r.tempC === "number" && r.tempC <= 8 ? "注意保暖" : "注意防晒与补水";
    const wx = hasSnow ? "注意路面湿滑，尽量穿防滑鞋" : "";

    return `【今日实况】${city || "该地区"}（数据时间：${time}）\n- 天气：${r.summary}\n- 当前温度：${t}（今日${lo}~${hi}）\n- 湿度：${hum}\n\n【出行建议】\n- ${hint}；${cold}${wx ? `；${wx}` : ""}`;
  }

  function formatAdviceText(input: { location: Location; weather: WeatherPayload }) {
    const w = input.weather;
    const r = w.realtime;
    const city = `${input.location.province}${input.location.city}${input.location.district}`.replace(/本地/g, "") || "该地区";
    const now = typeof r.tempC === "number" ? r.tempC : null;
    const hi = w.today.hiC;
    const lo = w.today.loC;
    const time = new Date(w.source.reportTimeMs).toLocaleString("zh-CN");

    const hasRain = /雨|雷阵雨|阵雨/.test(r.summary);
    const hasSnow = /雪/.test(r.summary);
    const windy = /风/.test(r.summary);

    const clothing =
      now != null && now <= 8
        ? "建议穿羽绒服/棉服，注意保暖"
        : now != null && now <= 16
          ? "建议穿外套或针织衫，早晚注意添衣"
          : now != null && now >= 28
            ? "建议穿轻薄透气衣物，注意防晒与补水"
            : "建议穿长袖/薄外套，体感舒适为主";

    const travel = hasRain
      ? "出门带伞，注意路面湿滑"
      : hasSnow
        ? "注意路面结冰与湿滑，尽量穿防滑鞋"
        : windy
          ? "注意防风，外出尽量避开高空坠物风险区域"
          : "出行正常即可";

    const health =
      now != null && now >= 28
        ? "避免午后暴晒，运动选择清晨/傍晚"
        : now != null && now <= 8
          ? "户外运动注意热身，尽量缩短在寒冷环境停留"
          : "适量运动，注意补水";

    const range =
      typeof lo === "number" && typeof hi === "number"
        ? `（今日 ${lo}~${hi}°C）`
        : typeof lo === "number"
          ? `（今日最低 ${lo}°C）`
          : typeof hi === "number"
            ? `（今日最高 ${hi}°C）`
            : "";

    return `【AI建议（基于天气数据）】${city}\n数据时间：${time}${range ? `\n${range}` : ""}\n\n1) 穿衣建议：${clothing}\n2) 出行建议：${travel}\n3) 运动/健康提醒：${health}`;
  }

  server.get("/resolve", async (req, reply) => {
    const address = typeof (req.query as any)?.address === "string" ? String((req.query as any).address).trim() : "";
    if (!address) return reply.status(400).send({ error: "missing_address" });
    const geo = await resolveAmapGeo(address);
    const location: Location = {
      province: geo.province || address,
      city: geo.city || geo.province || address,
      district: geo.district || "本地",
      detail: geo.formattedAddress || undefined
    };
    const fullText =
      geo.formattedAddress ||
      [location.province, location.city, location.district, location.detail ?? ""].filter((x) => x && x !== "本地").join("");
    return reply.status(200).send({ ok: true, location, fullText, adcode: geo.adcode });
  });

  async function generateAiAdvice(input: { question: string; location: Location; weather: WeatherPayload }) {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是健康与出行建议助手。只能基于我提供的天气数据给建议，不得编造天气。输出：1) 穿衣建议 2) 出行建议 3) 运动/健康提醒（如防晒、保暖、补水）。中文，简洁可执行。"
      },
      {
        role: "user",
        content: JSON.stringify({ question: input.question, location: input.location, weather: input.weather })
      }
    ];

    const candidates = buildCandidatesForWeather();
    if (candidates.length === 0) throw new ExternalServiceError("missing_config", "ark_missing_config", false);
    return await callOpenAICompatibleChatWithFallback({
      candidates,
      timeoutMs: 60000,
      temperature: 0.35,
      maxTokens: 700,
      messages
    });
  }

  async function generateAiWeatherAnswer(input: {
    question: string;
    location: Location;
    weather: WeatherPayload;
  }) {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是天气播报助手。你只能基于我提供的高德天气数据作答，禁止编造。必须包含：城市、数据时间(reporttime)、天气现象、当前温度、湿度、风向风力、今日最高/最低温。回答要像真人播报，简洁清晰。"
      },
      {
        role: "user",
        content: JSON.stringify({ question: input.question, location: input.location, weather: input.weather })
      }
    ];

    const candidates = buildCandidatesForWeather();
    if (candidates.length === 0) throw new ExternalServiceError("missing_config", "ark_missing_config", false);
    
    return await callOpenAICompatibleChatWithFallback({
      candidates,
      timeoutMs: 60000,
      temperature: 0.2,
      maxTokens: 700,
      messages
    });
  }

  server.get("/today", async (req, reply) => {
    const loc = await resolveLocation(req.query as any);
    if (!loc) return reply.status(400).send({ error: "missing_location" });
    const payload = await getWeatherPayload(loc);
    const realtime = payload.realtime;
    return {
      city: realtime.location.city,
      summary: realtime.summary,
      tempC: realtime.tempC,
      hiC: payload.today.hiC,
      loC: payload.today.loC,
      updatedAt: payload.source.reportTimeMs
    };
  });

  server.get("/realtime", async (req, reply) => {
    const loc = await resolveLocation(req.query as any);
    if (!loc) return reply.status(400).send({ error: "missing_location" });
    return await getRealtime(loc);
  });

  server.get("/forecast24h", async (req, reply) => {
    const loc = await resolveLocation(req.query as any);
    if (!loc) return reply.status(400).send({ error: "missing_location" });
    return await getForecast24h(loc);
  });

  server.post("/ask", async (req, reply) => {
    const parsed = AskWeatherSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const parsedLoc = parseLocationFromQuestion(parsed.data.question);
    const loc = parsedLoc ?? (await resolveLocation(req.query as any));
    if (!loc) return reply.status(400).send({ error: "missing_location" });
    const weather = await getWeatherPayload(loc);

    const started = Date.now();
    try {
      const { provider, content } = await generateAiWeatherAnswer({
        question: parsed.data.question,
        location: loc,
        weather
      });
      const latencyMs = Date.now() - started;
      server.log.info({ module: "weather", provider, latencyMs }, "ai ok");
      return { answer: content, raw: content, provider, location: loc, realtime: weather.realtime, forecast24h: { location: loc, hours: [], updatedAt: weather.source.reportTimeMs } };
    } catch (err) {
      const code = err instanceof ExternalServiceError ? err.code : "unknown_error";
      const message = err instanceof ExternalServiceError 
        ? (err.code === "missing_config" ? "请在后端配置 ARK_API_KEY / ARK_BASE_URL / ARK_MODEL" : err.message)
        : "weather_ask_failed";
      
      const latencyMs = Date.now() - started;
      server.log.warn({ module: "weather", provider: "doubao", latencyMs, code, message }, "ai failed");
      
      if (code === "missing_config") {
          const fallback = formatWeatherText({ question: parsed.data.question, location: loc, weather });
          return reply.status(200).send({ 
              answer: fallback, 
              raw: fallback, 
              provider: "amap", 
              location: loc, 
              realtime: weather.realtime, 
              forecast24h: { location: loc, hours: [], updatedAt: weather.source.reportTimeMs } 
          });
      }

      return reply.status(503).send({ error: code, message });
    }
  });

  server.post("/advice", async (req, reply) => {
    const parsed = AskWeatherSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    const parsedLoc = parseLocationFromQuestion(parsed.data.question);
    const loc = parsedLoc ?? (await resolveLocation(req.query as any));
    if (!loc) return reply.status(400).send({ error: "missing_location" });
    const weather = await getWeatherPayload(loc);
    
    const started = Date.now();
    try {
        const { provider, content } = await generateAiAdvice({ question: parsed.data.question, location: loc, weather });
        const latencyMs = Date.now() - started;
        server.log.info({ module: "weather", provider, latencyMs }, "ai ok");
        return reply.status(200).send({ ok: true, provider, raw: content });
    } catch (err) {
        const code = err instanceof ExternalServiceError ? err.code : "unknown_error";
        const message = err instanceof ExternalServiceError 
          ? (err.code === "missing_config" ? "请在后端配置 QWEN_API_KEY / QWEN_MODEL（或 ARK_API_KEY / ARK_BASE_URL / ARK_MODEL）" : err.message)
          : "weather_advice_failed";
        const latencyMs = Date.now() - started;
        server.log.warn({ module: "weather", provider: "doubao", latencyMs, code, message }, "ai failed");
        const fallback = formatAdviceText({ location: loc, weather });
        return reply.status(200).send({ ok: true, provider: "amap", raw: fallback });
    }
  });
};
