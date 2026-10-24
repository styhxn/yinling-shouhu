import { z } from "zod";
import type { AppConfig } from "../../config.js";
import type { AppDb, Role } from "../../store/db.js";
import type { SessionUser } from "../auth/types.js";
import type { createEventBus } from "../eventBus.js";
import type { LocationService } from "../location/location.js";
import { analyzeScam } from "../safety/scam.js";
import type { createStore } from "../store.js";
import type { WeatherService } from "../weather.js";
import type { ToolSchema } from "../llm/types.js";

export type ToolRisk = "read" | "write" | "high";

export type ToolContext = {
  user: SessionUser;
  sessionId: string;
  requestId: string;
  elderId?: string;
  signal?: AbortSignal;
};

export type ToolResult = {
  summary: string;
  data?: unknown;
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  risk: ToolRisk;
  roles: Role[];
  requiresConfirmation: boolean;
  prepare?: (args: any, ctx: ToolContext) => Promise<{ args: unknown; summary: string; data?: unknown }>;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
};

export type ToolDeps = {
  db: AppDb;
  store: Awaited<ReturnType<typeof createStore>>;
  config: AppConfig;
  eventBus: ReturnType<typeof createEventBus>;
  weather: WeatherService;
  location: LocationService;
};

export type ToolRegistry = {
  list(role: Role): ToolDef[];
  get(name: string): ToolDef | null;
  schemas(role: Role): ToolSchema[];
  execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult>;
};

function requireElder(ctx: ToolContext): string {
  if (!ctx.elderId) throw new Error("no_elder_context");
  return ctx.elderId;
}

function formatMedications(items: ReturnType<AppDb["medications"]["listByElder"]>): string {
  if (!items.length) return "还没有添加用药计划。";
  return items
    .map(
      (med) =>
        `${med.name}${med.spec ? ` ${med.spec}` : ""}：${med.dosage ?? "按医嘱"}；` +
        `时间 ${med.schedule.map((s) => s.time).join("、") || "未设置"}`
    )
    .join("\n");
}

export function createToolRegistry(deps: ToolDeps): ToolRegistry {
  const tools: ToolDef[] = [
    {
      name: "get_weather",
      description: "查询指定城市/地址的天气，用于出行、穿衣、散步建议。",
      parameters: z.object({ location: z.string().min(1).max(64) }),
      jsonSchema: {
        type: "object",
        properties: {
          location: { type: "string", description: "城市或地址，例如 南京" }
        },
        required: ["location"]
      },
      risk: "read",
      roles: ["elder", "family", "institution", "admin"],
      requiresConfirmation: false,
      async handler(args) {
        const weather = await deps.weather.getToday(String(args.location));
        const temp = typeof weather.tempC === "number" ? `${weather.tempC}℃` : "温度未知";
        return {
          summary: `${weather.city}：${weather.summary}，${temp}（来源：${weather.source === "amap" ? "高德" : "演示数据"}）`,
          data: weather
        };
      }
    },
    {
      name: "get_health_records",
      description: "读取老人近期的步数、睡眠、活动、心情等记录，用于健康建议。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        requireElder(ctx);
        const metrics = await deps.store.getRecentMetrics();
        const latest: Record<string, number> = {};
        for (const metric of metrics) {
          if (!(metric.type in latest)) latest[metric.type] = metric.value;
        }
        const parts = Object.entries(latest)
          .slice(0, 5)
          .map(([key, value]) => `${key}=${value}`);
        return {
          summary: parts.length ? `最近记录：${parts.join("，")}` : "还没有健康记录。",
          data: latest
        };
      }
    },
    {
      name: "get_medications",
      description: "读取老人当前的用药计划和服药时间。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const items = deps.db.medications.listByElder(elderId);
        return {
          summary: formatMedications(items),
          data: items
        };
      }
    },
    {
      name: "check_scam",
      description:
        "分析一段文字、短信或链接是否存在诈骗风险。只做模式分析，不访问链接内容；不要用于替代警方判断。",
      parameters: z.object({
        inputType: z.enum(["text", "url", "image"]),
        text: z.string().max(4000).optional(),
        url: z.string().max(500).optional()
      }),
      jsonSchema: {
        type: "object",
        properties: {
          inputType: { type: "string", enum: ["text", "url", "image"] },
          text: { type: "string", description: "可疑文字/短信内容" },
          url: { type: "string", description: "可疑链接" }
        },
        required: ["inputType"]
      },
      risk: "read",
      roles: ["elder", "family", "institution", "admin"],
      requiresConfirmation: false,
      async handler(args, ctx) {
        const result = analyzeScam({
          inputType: args.inputType,
          ...(typeof args.text === "string" ? { text: args.text } : {}),
          ...(typeof args.url === "string" ? { url: args.url } : {})
        });
        deps.db.scamChecks.insert({
          elderId: ctx.elderId ?? ctx.user.userId,
          inputType: args.inputType,
          inputText: typeof args.text === "string" ? args.text : null,
          url: typeof args.url === "string" ? args.url : null,
          riskLevel: result.riskLevel,
          scamType: result.scamType,
          confidence: result.confidence,
          result
        });
        const flags = result.redFlags.map((flag) => `- ${flag.quote}：${flag.reason}`).join("\n");
        return {
          summary:
            `风险等级：${result.riskLevel}；类型：${result.scamType}；置信度：${result.confidence}\n` +
            (flags ? `可疑点：\n${flags}\n` : "") +
            `建议：${result.actions.join("；")}\n${result.disclaimer}`,
          data: result
        };
      }
    },
    {
      name: "start_cooling_off",
      description:
        "当老人准备转账且存在高风险时，启动 60 秒冷静期并请求家属确认。不会执行真实转账。",
      parameters: z.object({
        amount: z.number().positive().optional(),
        counterparty: z.string().max(100).optional(),
        reason: z.string().max(500).optional(),
        familyConfirmId: z.string().max(80).optional(),
        coolingOffId: z.string().max(80).optional(),
        expiresAt: z.number().optional()
      }),
      jsonSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "准备转账的金额" },
          counterparty: { type: "string", description: "转账对象" },
          reason: { type: "string", description: "转账理由/对方说法" }
        }
      },
      risk: "high",
      roles: ["elder"],
      requiresConfirmation: true,
      async prepare(args, ctx) {
        const elderId = requireElder(ctx);
        const confirm = deps.db.familyConfirms.create({
          elderId,
          type: "transfer",
          payload: {
            amount: args.amount ?? null,
            counterparty: args.counterparty ?? null,
            reason: args.reason ?? null,
            requestedBy: ctx.user.userId
          }
        });
        const cooling = deps.db.coolingOffs.create({
          elderId,
          riskLevel: "high",
          questions: [
            "对方是否要求你保密？",
            "你是否见过对方本人？",
            "对方是否让你共享屏幕或提供验证码？"
          ],
          ...(typeof args.reason === "string" ? { reason: args.reason } : {}),
          ...(typeof args.counterparty === "string" ? { counterparty: args.counterparty } : {}),
          ...(typeof args.amount === "number" ? { amount: args.amount } : {}),
          familyConfirmId: confirm.id
        });
        const alert = {
          id: `alert_${cooling.id}`,
          type: "cooling_off",
          level: "critical",
          elderId,
          createdAt: Date.now()
        };
        deps.eventBus.publish({ type: "safety.alert", ts: Date.now(), payload: { alert } });
        deps.eventBus.publish({
          type: "family.confirm.requested",
          ts: Date.now(),
          payload: { confirm }
        });
        return {
          args: {
            ...args,
            familyConfirmId: confirm.id,
            coolingOffId: cooling.id,
            expiresAt: cooling.expiresAt
          },
          summary:
            "检测到转账风险，已通知家属确认。请先不要转账；如对方催促、让你保密或共享屏幕，立即停止。",
          data: {
            coolingOffId: cooling.id,
            familyConfirmId: confirm.id,
            expiresAt: cooling.expiresAt
          }
        };
      },
      async handler(args) {
        return {
          summary:
            "已启动 60 秒冷静期，并通知家属确认。请先不要转账；如对方催促、让你保密或共享屏幕，立即停止。",
          data: {
            coolingOffId: typeof args.coolingOffId === "string" ? args.coolingOffId : null,
            familyConfirmId: typeof args.familyConfirmId === "string" ? args.familyConfirmId : null,
            expiresAt: typeof args.expiresAt === "number" ? args.expiresAt : null
          }
        };
      }
    },
    {
      name: "get_location",
      description: "读取老人最后上报的位置，用于回答“在哪/还没回来”等问题。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const latest = deps.location.latest(elderId);
        if (!latest) {
          return { summary: "还没有收到位置信息。可以先打电话确认，或让家属开启位置共享。" };
        }
        return {
          summary: `最后位置：${latest.text}（精度约 ${latest.point.accuracy ?? "未知"} 米）`,
          data: latest
        };
      }
    }
  ];

  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    list(role: Role) {
      return tools.filter((tool) => tool.roles.includes(role));
    },
    get(name: string) {
      return byName.get(name) ?? null;
    },
    schemas(role: Role) {
      return tools
        .filter((tool) => tool.roles.includes(role))
        .map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.jsonSchema
          }
        }));
    },
    async execute(name: string, input: unknown, ctx: ToolContext) {
      const tool = byName.get(name);
      if (!tool) throw new Error("unknown_tool");
      if (!tool.roles.includes(ctx.user.role)) throw new Error("forbidden_tool");
      const args = tool.parameters.parse(input);
      return await tool.handler(args, ctx);
    }
  };
}
