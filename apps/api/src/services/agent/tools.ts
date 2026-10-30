import { z } from "zod";
import type { AppConfig } from "../../config.js";
import type { AppDb, Role } from "../../store/db.js";
import type { SessionUser } from "../auth/types.js";
import type { createEventBus } from "../eventBus.js";
import type { LocationService } from "../location/location.js";
import type { AntiFraudService } from "../safety/antiFraud.js";
import type { CoolingOffService } from "../safety/coolingOff.js";
import { analyzeScamHybrid } from "../safety/scamAI.js";
import type { createStore } from "../store.js";
import type { WeatherService } from "../weather.js";
import type { ModelRouter, ToolSchema } from "../llm/types.js";
import type { DietService } from "../diet/diet.js";
import { dietPlanSummary, foodSafetySummary } from "../diet/rules.js";
import { buildMedicationSafety } from "../medication/interactions.js";
import type { HelpHomeService } from "../safety/helpHome.js";

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
  antiFraud: AntiFraudService;
  coolingOff: CoolingOffService;
  modelRouter: ModelRouter;
  diet: DietService;
  helpHome: HelpHomeService;
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

function formatMedications(items: Awaited<ReturnType<AppDb["medications"]["listByElder"]>>): string {
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
      description: "读取长辈近期的步数、睡眠、活动、心情等记录，用于健康建议。",
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
      description: "读取长辈当前的用药计划和服药时间。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const items = await deps.db.medications.listByElder(elderId);
        return {
          summary: formatMedications(items),
          data: items
        };
      }
    },
    {
      name: "get_medication_safety",
      description:
        "检查长辈当前用药与食物、其他药物之间的冲突，并给出漏服处理建议。回答吃药、忌口、漏服相关问题前先调用。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const items = await deps.db.medications.listByElder(elderId);
        const safety = buildMedicationSafety(
          items.map((med) => ({ name: med.name, genericName: med.genericName }))
        );
        const lines = safety.warnings.slice(0, 4).map((warning) => `${warning.title}：${warning.detail}`);
        return {
          summary: lines.length ? lines.join("\n") : "常用药之间暂未发现明确冲突，仍需按医嘱服用。",
          data: {
            ...safety,
            citations: safety.warnings.map((warning) => warning.source)
          }
        };
      }
    },
    {
      name: "get_diet_plan",
      description:
        "生成长辈今天的早、中、晚三餐建议，结合慢病、用药忌口和记忆偏好。回答今天吃什么、怎么吃时调用。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const plan = await deps.diet.dailyPlan(elderId);
        return {
          summary: dietPlanSummary(plan),
          data: { plan, citations: plan.sources }
        };
      }
    },
    {
      name: "check_food",
      description:
        "判断一种食物长辈能不能吃，结合高血压、糖尿病等慢病和正在服用的药物，给出少量/避免/替代做法。回答我能吃某样东西吗时调用。",
      parameters: z.object({ food: z.string().min(1).max(80) }),
      jsonSchema: {
        type: "object",
        properties: {
          food: { type: "string", description: "食物或菜名，例如 红烧肉、咸菜、葡萄柚" }
        },
        required: ["food"]
      },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(args, ctx) {
        const elderId = requireElder(ctx);
        const result = await deps.diet.checkFood(elderId, String(args.food));
        return {
          summary: foodSafetySummary(result),
          data: { result, citations: result.sources }
        };
      }
    },
    {
      name: "help_me_get_home",
      description:
        "长辈找不到家时使用：读取最后位置和家庭地址，估算方向和距离，立即通知家人并生成回家指引。",
      parameters: z.object({
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional()
      }),
      jsonSchema: {
        type: "object",
        properties: {
          lat: { type: "number", description: "当前位置纬度，可选" },
          lng: { type: "number", description: "当前位置经度，可选" }
        }
      },
      risk: "write",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(args, ctx) {
        const elderId = requireElder(ctx);
        const point =
          typeof args.lat === "number" && typeof args.lng === "number"
            ? { lat: args.lat, lng: args.lng }
            : undefined;
        const result = await deps.helpHome.requestHelp({
          elderId,
          userId: ctx.user.userId,
          ...(point ? { point } : {})
        });
        return {
          summary: `${result.card.spoken}\n${result.card.steps.join("\n")}`,
          data: { card: result.card, alertId: result.alertId, citations: [] }
        };
      }
    },
    {
      name: "search_memories",
      description:
        "检索长辈自己口述过的记忆（童年、家乡、工作、家人等）。回答过去经历相关问题前必须先检索，只引用检索结果，不要编造。",
      parameters: z.object({
        query: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(5).optional()
      }),
      jsonSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索关键词，例如 童年、苏州、工作、老伴" },
          limit: { type: "number", description: "返回条数，默认 3" }
        }
      },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(args, ctx) {
        const elderId = requireElder(ctx);
        const query: string = typeof args.query === "string" ? args.query.trim() : "";
        const limit: number = typeof args.limit === "number" ? args.limit : 3;
        const items = await deps.db.memories.listByElder(elderId);
        const compact = query.replace(/\s+/g, "").toLowerCase();
        const terms = new Set<string>();
        if (compact.length <= 8) terms.add(compact);
        for (let index = 0; index < compact.length - 1; index += 1) {
          terms.add(compact.slice(index, index + 2));
        }

        const scored = items.map((memory) => {
          const text = [
            memory.title,
            memory.summary ?? "",
            memory.place ?? "",
            memory.timeRange ?? "",
            memory.people.join(" "),
            memory.tags.join(" "),
            memory.transcript
          ]
            .join("\n")
            .toLowerCase();
          const termList = Array.from(terms);
          const score = termList.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
          return { memory, score };
        });

        const picked = (terms.size ? scored.filter((item) => item.score > 0) : scored)
          .sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt)
          .slice(0, limit);

        if (!picked.length) {
          return {
            summary: "没有检索到相关记忆。可以邀请长辈先讲一段，或换一个关键词。",
            data: { items: [], citations: [] }
          };
        }

        const lines = picked.map(({ memory }, index) => {
          const snippet = (memory.summary ?? memory.transcript).replace(/\s+/g, " ").slice(0, 80);
          return `${index + 1}. ${memory.title}：${snippet}`;
        });
        return {
          summary: `找到 ${picked.length} 段相关记忆：\n${lines.join("\n")}`,
          data: {
            items: picked.map(({ memory }) => ({
              id: memory.id,
              title: memory.title,
              summary: memory.summary,
              timeRange: memory.timeRange,
              place: memory.place,
              people: memory.people,
              tags: memory.tags
            })),
            citations: picked.map(({ memory }) => ({
              title: memory.title,
              type: "memory",
              id: memory.id
            }))
          }
        };
      }
    },
    {
      name: "get_memory_profile",
      description:
        "读取长辈的记忆画像（常提到的人、地点、习惯、偏好、沟通注意点），用于个性化陪伴和简报。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const record = await deps.db.memoryProfiles.getByElder(elderId);
        if (!record || !record.profile.summary || record.profile.summary.startsWith("还没有")) {
          return {
            summary: "还没有形成记忆画像。可以先完成一次记忆访谈。",
            data: { profile: null }
          };
        }
        const profile = record.profile;
        return {
          summary:
            `记忆画像：${profile.summary}` +
            (profile.sensitivities.length ? ` 沟通提醒：${profile.sensitivities.join("；")}` : ""),
          data: { profile }
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
        const query =
          args.inputType === "url"
            ? String(args.url ?? "")
            : String(args.text ?? "");
        const hits = query ? await deps.antiFraud.search(query, 2) : [];
        const result = await analyzeScamHybrid({
          inputType: args.inputType,
          ...(typeof args.text === "string" ? { text: args.text } : {}),
          ...(typeof args.url === "string" ? { url: args.url } : {}),
          modelRouter: deps.modelRouter,
          knowledge: hits
        });
        const enriched = { ...result };

        await deps.db.scamChecks.insert({
          elderId: ctx.elderId ?? ctx.user.userId,
          inputType: args.inputType,
          inputText: typeof args.text === "string" ? args.text : null,
          url: typeof args.url === "string" ? args.url : null,
          riskLevel: enriched.riskLevel,
          scamType: enriched.scamType,
          confidence: enriched.confidence,
          result: enriched,
          model: enriched.model
        });

        const flags = enriched.redFlags
          .map((flag) => `- ${flag.quote}：${flag.reason}`)
          .join("\n");
        const related = hits.length
          ? `\n相关案例：${hits.map((hit) => hit.title).join("、")}`
          : "";
        return {
          summary:
            `风险等级：${enriched.riskLevel}；类型：${enriched.scamType}；置信度：${enriched.confidence}\n` +
            (enriched.explanation ? `判断：${enriched.explanation}\n` : "") +
            (flags ? `可疑点：\n${flags}\n` : "") +
            `建议：${enriched.actions.join("；")}` +
            related +
            `\n${enriched.disclaimer}`,
          data: { ...enriched, related: hits }
        };
      }
    },
    {
      name: "start_cooling_off",
      description:
        "当长辈准备转账且存在高风险时，启动 60 秒冷静期并请求家人确认。不会执行真实转账。",
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
      async prepare(args) {
        // 冷静期与家人通知是真实副作用，必须等长辈在确认框点“确认”后再创建。
        return {
          args,
          summary:
            "检测到转账风险。确认后我会启动 60 秒冷静期并通知家人，不会执行真实转账；如对方催促、让你保密或共享屏幕，请立即停止。"
        };
      },
      async handler(args, ctx) {
        if (typeof args.coolingOffId === "string" && typeof args.familyConfirmId === "string") {
          return {
            summary:
              "冷静期已经启动，并已通知家人确认。请先不要转账；如对方催促、让你保密或共享屏幕，立即停止。",
            data: {
              coolingOffId: args.coolingOffId,
              familyConfirmId: args.familyConfirmId,
              expiresAt: typeof args.expiresAt === "number" ? args.expiresAt : null
            }
          };
        }
        const elderId = requireElder(ctx);
        const created = await deps.coolingOff.start({
          elderId,
          userId: ctx.user.userId,
          ...(typeof args.amount === "number" ? { amount: args.amount } : {}),
          ...(typeof args.counterparty === "string" ? { counterparty: args.counterparty } : {}),
          ...(typeof args.reason === "string" ? { reason: args.reason } : {})
        });
        return {
          summary:
            "已启动 60 秒冷静期，并通知家人确认。请先不要转账；如对方催促、让你保密或共享屏幕，立即停止。",
          data: {
            coolingOffId: created.coolingOff.id,
            familyConfirmId: created.familyConfirm.id,
            expiresAt: created.coolingOff.expiresAt
          }
        };
      }
    },
    {
      name: "get_location",
      description: "读取长辈最后上报的位置，用于回答“在哪/还没回来”等问题。",
      parameters: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      risk: "read",
      roles: ["elder", "family"],
      requiresConfirmation: false,
      async handler(_args, ctx) {
        const elderId = requireElder(ctx);
        const latest = await deps.location.latest(elderId);
        if (!latest) {
          return { summary: "还没有收到位置信息。可以先打电话确认，或让家人开启位置共享。" };
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
