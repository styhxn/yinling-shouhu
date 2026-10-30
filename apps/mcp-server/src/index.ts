#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const API_BASE_URL = (process.env.API_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const DEMO_ROLE = (process.env.MCP_DEMO_ROLE ?? "elder").trim() || "elder";
const TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS ?? 15_000) || 15_000;

let sessionCookie: string | null = process.env.MCP_SESSION_COOKIE?.trim() || null;

function log(message: string) {
  process.stderr.write(`[mcp] ${message}\n`);
}

async function loginDemo(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/auth/demo-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: DEMO_ROLE }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new Error(`演示登录失败（${res.status}）：请确认后端已启动且 DEMO_MODE=1`);
  }
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = headers.getSetCookie?.()[0] ?? res.headers.get("set-cookie") ?? "";
  const pair = raw.split(";")[0]?.trim();
  if (!pair) throw new Error("演示登录未返回会话 Cookie");
  log(`已以 ${DEMO_ROLE} 演示账号登录 ${API_BASE_URL}`);
  return pair;
}

async function callApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!sessionCookie) sessionCookie = await loginDemo();

  const send = async () => {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (sessionCookie) headers.cookie = sessionCookie;
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  };

  let res = await send();
  if (res.status === 401 && !process.env.MCP_SESSION_COOKIE?.trim()) {
    sessionCookie = await loginDemo();
    res = await send();
  }

  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`接口 ${path} 返回 ${res.status}：${detail}`);
  }
  return data as T;
}

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: `调用失败：${message}` }] };
}

async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

function numberOr(value: unknown, fallback: string): string {
  return typeof value === "number" ? String(value) : fallback;
}

const RISK_LABEL: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
  unknown: "暂未识别"
};

const server = new McpServer(
  { name: "yinling-shouhu", version: "0.1.0" },
  {
    instructions:
      "银龄守护 MCP 服务：面向长辈陪伴与安全守护。只读工具可直接调用；写入工具（set_geofence）执行前请先向用户确认。所有结果仅供参考，不替代医生诊断或警方判断。"
  }
);

server.registerTool(
  "get_weather",
  {
    title: "查询天气",
    description: "查询城市/地区今日天气与温度范围，用于出行、穿衣和散步建议。",
    inputSchema: {
      location: z.string().min(1).max(64).describe("城市或地区，例如 南京、苏州")
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  async ({ location }) =>
    guard(async () => {
      const data = await callApi("/api/weather/today?location=" + encodeURIComponent(location));
      const w = data.weather ?? {};
      const range =
        typeof w.loC === "number" && typeof w.hiC === "number"
          ? `（${w.loC}~${w.hiC}℃）`
          : "";
      const temp = numberOr(w.tempC, "温度未知");
      return ok(
        `${w.city ?? location}：${w.summary ?? "天气未知"}，${temp === "温度未知" ? temp : `${temp}℃`}${range}\n` +
          `数据来源：${w.source === "amap" ? "高德天气" : "演示数据"}`
      );
    })
);

server.registerTool(
  "get_medications",
  {
    title: "查询用药计划",
    description: "读取老人当前的用药计划、服药时间和今日完成情况。",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  async () =>
    guard(async () => {
      const data = await callApi("/api/medications");
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      const lines = items.map((med) => {
        const schedule = Array.isArray(med.schedule) ? med.schedule.map((s: any) => s.time).join("、") : "";
        return `- ${med.name}${med.spec ? ` ${med.spec}` : ""}：${med.dosage ?? "按医嘱"}；${schedule || "未设置时间"}`;
      });
      const adherence =
        typeof data.adherencePct === "number" ? `今日按时服药率 ${data.adherencePct}%` : "今日尚未记录服药";
      return ok(
        `今日用药（已记录 ${data.takenToday ?? 0} / 应服 ${data.dueToday ?? 0} 次）：\n` +
          `${lines.join("\n") || "暂无用药计划"}\n${adherence}`
      );
    })
);

server.registerTool(
  "search_anti_fraud_kb",
  {
    title: "检索反诈知识库",
    description: "在国家反诈中心知识库中检索与一段话最相关的骗局类型、典型话术和应对建议。",
    inputSchema: {
      query: z.string().min(1).max(500).describe("要检索的短信、聊天内容或关键词")
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  async ({ query }) =>
    guard(async () => {
      const data = await callApi("/api/safety/anti-fraud/search", {
        method: "POST",
        body: { query }
      });
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return ok("知识库中没有找到高度相关的内容。");
      const lines = items.map((item, index) => {
        const score = typeof item.score === "number" ? `（相关度 ${Math.round(item.score * 100)}%）` : "";
        const actions = Array.isArray(item.actions) ? item.actions.join("、") : "";
        return `${index + 1}. ${item.title}${score}\n   ${item.summary}\n   建议：${actions}`;
      });
      return ok(lines.join("\n\n"));
    })
);

server.registerTool(
  "check_scam",
  {
    title: "反诈风险鉴定",
    description: "对一段文字或链接做风险鉴定，返回风险等级、可疑点、建议动作和咨询问题。不会自动转账或联系他人。",
    inputSchema: {
      text: z.string().max(4000).optional().describe("可疑短信或聊天内容"),
      url: z.string().max(500).optional().describe("可疑链接（与 text 二选一）")
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  async ({ text, url }) =>
    guard(async () => {
      const trimmedText = text?.trim();
      const trimmedUrl = url?.trim();
      if (!trimmedText && !trimmedUrl) return fail("请提供 text 或 url。");
      const body = trimmedUrl
        ? { inputType: "url", url: trimmedUrl, ...(trimmedText ? { text: trimmedText } : {}) }
        : { inputType: "text", text: trimmedText };
      const data = await callApi("/api/safety/scam/check", { method: "POST", body });
      const result = data.result ?? {};
      const risk = RISK_LABEL[String(result.riskLevel)] ?? "暂未识别";
      const flags: any[] = Array.isArray(result.redFlags) ? result.redFlags : [];
      const actions: string[] = Array.isArray(result.actions) ? result.actions : [];
      const questions: string[] = Array.isArray(result.questionsToAsk) ? result.questionsToAsk : [];
      return ok(
        `风险等级：${risk}（类型：${result.scamType ?? "other"}）\n` +
          `${flags.length ? `可疑点：\n${flags.map((flag) => `- “${flag.quote}”：${flag.reason}`).join("\n")}\n` : ""}` +
          `${actions.length ? `建议：\n${actions.map((action) => `- ${action}`).join("\n")}\n` : ""}` +
          `${questions.length ? `可以反问：\n${questions.map((question) => `- ${question}`).join("\n")}\n` : ""}` +
          `${result.disclaimer ?? "结果仅供参考，紧急情况请拨打 110 或 96110。"}`
      );
    })
);

server.registerTool(
  "get_location",
  {
    title: "查询最新位置",
    description: "读取老人最近一次上报的位置与定位精度（用于防走失）。",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  async () =>
    guard(async () => {
      const data = await callApi("/api/safety/location/latest");
      const point = data.point;
      if (!point) return ok("暂无定位记录。");
      const accuracy = typeof point.accuracy === "number" ? `，精度 ±${Math.round(point.accuracy)} 米` : "";
      return ok(
        `最新位置：${point.lat}, ${point.lng}${accuracy}\n` +
          `来源：${point.source ?? "未知"}；时间：${new Date(point.ts).toLocaleString("zh-CN")}`
      );
    })
);

server.registerTool(
  "set_geofence",
  {
    title: "设置电子围栏",
    description: "为长辈创建一个圆形安全区域，长辈离开该区域时会通知家人。写入操作，调用前请先向用户确认。",
    inputSchema: {
      name: z.string().min(1).max(40).describe("围栏名称，例如 家附近"),
      lat: z.number().min(-90).max(90).describe("中心点纬度"),
      lng: z.number().min(-180).max(180).describe("中心点经度"),
      radius: z.number().min(50).max(10_000).default(800).describe("半径（米）")
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async ({ name, lat, lng, radius }) =>
    guard(async () => {
      const data = await callApi("/api/safety/geofence", {
        method: "POST",
        body: {
          name,
          shape: { type: "circle", center: [lng, lat], radius },
          notifyOn: ["exit"]
        }
      });
      const fence = data.geofence ?? {};
      const center = Array.isArray(fence.shape?.center) ? fence.shape.center.join(", ") : `${lng}, ${lat}`;
      return ok(
        `已创建电子围栏「${fence.name ?? name}」：中心 ${center}，半径 ${fence.shape?.radius ?? radius} 米；` +
          `长辈离开后会通知家人。`
      );
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
log(`MCP 服务已启动（API: ${API_BASE_URL}）`);
