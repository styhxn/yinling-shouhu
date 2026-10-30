import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { createDietService } from "./services/diet/diet.js";
import { evaluateFood, buildRuleDietPlan } from "./services/diet/rules.js";
import type { ChatJSONRequest, ChatStreamEvent, ModelRouter, VisionJSONRequest } from "./services/llm/types.js";
import { buildMedicationSafety, findDrugDrugWarnings } from "./services/medication/interactions.js";
import { bearingDegrees, directionLabel } from "./services/safety/helpHome.js";
import { cookieFrom, testConfig } from "./testUtils.js";

const health = {
  conditions: ["高血压", "2型糖尿病"],
  allergies: [] as string[],
  dietNotes: "医生建议少盐少油"
};

const meds = [
  { name: "氨氯地平", genericName: "苯磺酸氨氯地平" },
  { name: "二甲双胍", genericName: "盐酸二甲双胍" }
];

describe("diet rules", () => {
  it("marks high-salt pickles as avoid for hypertension", () => {
    const result = evaluateFood({ food: "咸菜", health, meds: [] });
    expect(result.verdict).toBe("avoid");
    expect(result.headline).toContain("先别吃");
    expect(result.hits.some((hit) => hit.id === "htn_salt")).toBe(true);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it("marks braised pork as limit rather than forbidden", () => {
    const result = evaluateFood({ food: "红烧肉", health, meds: [] });
    expect(result.verdict).toBe("limit");
    expect(result.headline).toContain("少量");
    expect(result.hits.some((hit) => hit.id === "htn_fat")).toBe(true);
  });

  it("accepts plain vegetables", () => {
    const result = evaluateFood({ food: "清炒青菜", health, meds: [] });
    expect(result.verdict).toBe("ok");
    expect(result.hits.some((hit) => hit.id === "general_ok")).toBe(true);
  });

  it("treats grapefruit with amlodipine as a hard conflict", () => {
    const result = evaluateFood({ food: "葡萄柚", health, meds });
    expect(result.verdict).toBe("avoid");
    expect(result.hits.some((hit) => hit.id === "df_grapefruit_ccb")).toBe(true);
    expect(result.advice).toContain("葡萄柚");
  });

  it("honours recorded allergies", () => {
    const result = evaluateFood({
      food: "花生米拌菠菜",
      health: { ...health, allergies: ["花生"] },
      meds: []
    });
    expect(result.verdict).toBe("avoid");
    expect(result.hits.some((hit) => hit.id === "allergy")).toBe(true);
  });

  it("asks for clarification on empty input", () => {
    const result = evaluateFood({ food: "  ", health, meds: [] });
    expect(result.verdict).toBe("unknown");
    expect(result.questions.length).toBeGreaterThan(0);
  });

  it("builds a three-meal plan with medication cautions", () => {
    const plan = buildRuleDietPlan({ health, meds });
    expect(plan.meals).toHaveLength(3);
    expect(plan.meals.map((meal) => meal.meal)).toEqual(["早餐", "午餐", "晚餐"]);
    expect(plan.avoid.some((item) => item.food === "咸菜")).toBe(true);
    expect(plan.medicationCautions.some((item) => item.medication === "氨氯地平")).toBe(true);
    expect(plan.engine).toBe("rules");
  });
});

describe("medication interactions", () => {
  it("warns about grapefruit, alcohol and missed doses", () => {
    const safety = buildMedicationSafety(meds);
    const ids = safety.warnings.map((warning) => warning.id);
    expect(ids).toContain("df_grapefruit_ccb");
    expect(ids).toContain("df_metformin_alcohol");
    expect(safety.warnings[0]?.level).toBe("avoid");
    expect(safety.missedDose.some((item) => item.includes("二甲双胍"))).toBe(true);
    expect(safety.missedDose.every((item) => item.includes("不要"))).toBe(true);
    expect(safety.disclaimer).toContain("不能替代");
  });

  it("detects drug-drug risk between aspirin and warfarin", () => {
    const warnings = findDrugDrugWarnings([{ name: "阿司匹林" }, { name: "华法林" }]);
    expect(warnings.some((warning) => warning.id === "dd_anticoagulant")).toBe(true);
  });

  it("stays quiet for harmless combinations", () => {
    const safety = buildMedicationSafety([{ name: "维生素C" }]);
    expect(safety.warnings).toHaveLength(0);
    expect(safety.missedDose).toHaveLength(1);
  });
});

describe("help-home geometry", () => {
  it("computes cardinal bearings", () => {
    const from = { lat: 32.041, lng: 118.781 };
    expect(directionLabel(bearingDegrees(from, { lat: 32.051, lng: 118.781 }))).toBe("北");
    expect(directionLabel(bearingDegrees(from, { lat: 32.041, lng: 118.791 }))).toBe("东");
    expect(directionLabel(bearingDegrees(from, { lat: 32.031, lng: 118.781 }))).toBe("南");
    expect(directionLabel(bearingDegrees(from, { lat: 32.041, lng: 118.771 }))).toBe("西");
    expect(directionLabel(-10)).toBe("北");
    expect(directionLabel(350)).toBe("北");
  });
});

class LiveStubRouter implements ModelRouter {
  readonly mode = "live" as const;
  constructor(private readonly payloads: Record<string, Record<string, unknown> | Error>) {}

  async *chatStream(): AsyncIterable<ChatStreamEvent> {
    yield { type: "done" };
  }

  async chatJSON<T>(req: ChatJSONRequest<T>): Promise<T> {
    const payload = this.payloads[req.task ?? ""];
    if (payload instanceof Error) throw payload;
    if (!payload) throw new Error(`no_payload_for_${req.task}`);
    return req.schema.parse(payload);
  }

  async visionJSON<T>(req: VisionJSONRequest<T>): Promise<T> {
    return req.schema.parse({});
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

let server: Awaited<ReturnType<typeof createServer>>;
let familyCookie: string;
let elderCookie: string;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
  const family = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "family" }
  });
  familyCookie = cookieFrom(family.headers);
  const elder = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
  elderCookie = cookieFrom(elder.headers);
});

afterAll(async () => {
  await server.close();
});

describe("health profile api", () => {
  it("returns the seeded profile for the bound elder", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/health/profile?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.profile.conditions).toContain("高血压");
    expect(body.profile.conditions).toContain("2型糖尿病");
    expect(body.profile.homeAddress).toContain("南京");
  });

  it("lets the family update conditions and allergies", async () => {
    const res = await server.inject({
      method: "PUT",
      url: "/api/health/profile?elderId=e_li",
      headers: { cookie: familyCookie },
      payload: {
        conditions: ["高血压", "2型糖尿病"],
        allergies: ["花生"],
        dietNotes: "晚饭七分饱",
        homeAddress: "南京市鼓楼区湖南路街道 3 号院 2 栋"
      }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.profile.allergies).toEqual(["花生"]);
    expect(body.profile.dietNotes).toBe("晚饭七分饱");

    const read = await server.inject({
      method: "GET",
      url: "/api/health/profile?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect((read.json() as any).profile.allergies).toEqual(["花生"]);
  });

  it("rejects malformed payloads", async () => {
    const res = await server.inject({
      method: "PUT",
      url: "/api/health/profile?elderId=e_li",
      headers: { cookie: familyCookie },
      payload: { conditions: "高血压" }
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("diet api", () => {
  it("serves a rule-based plan with meals and cautions", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/diet/plan?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(res.statusCode).toBe(200);
    const plan = (res.json() as any).plan;
    expect(plan.engine).toBe("rules");
    expect(plan.meals).toHaveLength(3);
    expect(plan.meals[0].dishes.length).toBeGreaterThan(0);
    expect(plan.avoid.some((item: any) => item.food === "咸菜")).toBe(true);
    expect(plan.medicationCautions.length).toBeGreaterThan(0);
    expect(plan.sources.length).toBeGreaterThan(0);
  });

  it("checks a risky food and a safe food", async () => {
    const risky = await server.inject({
      method: "POST",
      url: "/api/diet/check",
      headers: { cookie: elderCookie },
      payload: { food: "咸菜" }
    });
    expect(risky.statusCode).toBe(200);
    expect((risky.json() as any).result.verdict).toBe("avoid");

    const safe = await server.inject({
      method: "POST",
      url: "/api/diet/check",
      headers: { cookie: elderCookie },
      payload: { food: "清蒸鱼" }
    });
    expect(safe.statusCode).toBe(200);
    expect((safe.json() as any).result.verdict).toBe("ok");
  });

  it("rejects an empty food name", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/diet/check",
      headers: { cookie: elderCookie },
      payload: { food: "" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("lets the live model improve a plan but keeps unsafe dishes out", async () => {
    const router = new LiveStubRouter({
      diet_plan: {
        headline: "今天清淡一点，血压更稳",
        encouragement: "慢慢来，今天先少放一勺盐。",
        meals: [
          { meal: "早餐", dishes: ["咸菜", "白粥"], reason: "开胃" },
          { meal: "午餐", dishes: ["清蒸鲈鱼", "蒜蓉青菜", "杂粮饭"], reason: "有鱼有菜" },
          { meal: "晚餐", dishes: ["豆腐菌菇汤", "清炒时蔬"], reason: "七分饱" }
        ],
        hydration: "分几次喝温水，共 6 小杯。",
        questions: ["胃口怎么样？"]
      }
    });
    const service = createDietService({ db: server.db, modelRouter: router });
    const plan = await service.dailyPlan("e_li", { refresh: true });
    expect(plan.engine).toBe("rules+llm");
    expect(plan.headline).toContain("清淡");
    const breakfast = plan.meals.find((meal) => meal.meal === "早餐")!;
    expect(breakfast.dishes.some((dish) => dish.includes("咸菜"))).toBe(false);
    const lunch = plan.meals.find((meal) => meal.meal === "午餐")!;
    expect(lunch.dishes).toContain("清蒸鲈鱼");
  });

  it("rejects model text that contradicts an avoid verdict", async () => {
    const router = new LiveStubRouter({
      diet_check: {
        headline: "咸菜可以放心吃",
        explanation: "少吃一点没关系，配粥很好。",
        alternatives: [],
        questions: []
      }
    });
    const service = createDietService({ db: server.db, modelRouter: router });
    const result = await service.checkFood("e_li", "咸菜");
    expect(result.verdict).toBe("avoid");
    expect(result.engine).toBe("rules");
    expect(result.headline).not.toContain("放心吃");
  });

  it("keeps the rule plan when the model fails", async () => {
    const router = new LiveStubRouter({ diet_plan: new Error("timeout") });
    const service = createDietService({ db: server.db, modelRouter: router });
    const plan = await service.dailyPlan("e_li", { refresh: true });
    expect(plan.engine).toBe("rules");
    expect(plan.meals).toHaveLength(3);
  });

  it("surfaces remembered preferences as a gentle note", async () => {
    await server.db.memoryProfiles.upsert({
      elderId: "e_li",
      profile: {
        summary: "李奶奶爱吃红烧肉。",
        people: [],
        places: [],
        routines: [],
        preferences: ["红烧肉"],
        sensitivities: [],
        engine: "rules",
        model: "rules",
        updatedAt: Date.now()
      },
      sourceCount: 1
    });
    const service = createDietService({
      db: server.db,
      modelRouter: new LiveStubRouter({ diet_plan: new Error("timeout") })
    });
    const plan = await service.dailyPlan("e_li", { refresh: true });
    expect(plan.personalNote).toContain("红烧肉");
    expect(plan.personalNote).toContain("小份");
  });
});

describe("help-home api", () => {
  it("creates a critical alert, notifies family and gives a safe route hint", async () => {
    const events: Array<{ type: string; payload: any }> = [];
    const unsubscribe = server.eventBus.subscribe((event) => {
      events.push(event as { type: string; payload: any });
    });
    try {
      const res = await server.inject({
        method: "POST",
        url: "/api/safety/help-home?elderId=e_li",
        headers: { cookie: elderCookie },
        payload: { lat: 32.051, lng: 118.781 }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.alertId).toBeTruthy();
      expect(body.card.distanceMeters).toBeGreaterThan(800);
      // 老人在家的北边，所以“家”在老人的南边。
      expect(body.card.direction).toBe("南");
      expect(body.card.steps.join(" ")).toContain("比较远");
      expect(body.card.spoken).toContain("等家人来接");
      expect(events.some((event) => event.type === "safety.alert")).toBe(true);

      const alerts = await server.db.safetyAlerts.listByElder("e_li");
      const alert = alerts.find((item) => item.id === body.alertId);
      expect(alert?.type).toBe("help_home");
      expect(alert?.level).toBe("critical");

      const messages = await server.inject({
        method: "GET",
        url: "/api/family/messages",
        headers: { cookie: familyCookie }
      });
      expect(messages.statusCode).toBe(200);
      const sos = (messages.json() as any).items.find((item: any) => item.kind === "sos");
      expect(sos?.content).toContain("找不到家");
      expect(sos?.fromRole).toBe("elder");
    } finally {
      unsubscribe();
    }
  });

  it("uses the latest stored location and family contact", async () => {
    await server.db.locations.insert({
      elderId: "e_li",
      lat: 32.041,
      lng: 118.781,
      accuracy: null,
      source: "browser",
      ts: Date.now()
    });
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/help-home?elderId=e_li",
      headers: { cookie: elderCookie },
      payload: {}
    });
    expect(res.statusCode).toBe(200);
    const card = (res.json() as any).card;
    expect(card.distanceMeters).not.toBeNull();
    expect(card.familyPhone).toBe("13800001234");
    expect(card.steps.length).toBeGreaterThan(0);
  });
});

describe("family message voice payload", () => {
  it("includes message content in the elder.message event", async () => {
    const events: Array<{ type: string; payload: any }> = [];
    const unsubscribe = server.eventBus.subscribe((event) => {
      events.push(event as { type: string; payload: any });
    });
    try {
      const res = await server.inject({
        method: "POST",
        url: "/api/family/elder/message",
        headers: { cookie: familyCookie },
        payload: { elderId: "e_li", content: "记得吃晚饭，早点休息。", kind: "general" }
      });
      expect(res.statusCode).toBe(200);
      const event = events.find((item) => item.type === "elder.message");
      expect(event?.payload.content).toBe("记得吃晚饭，早点休息。");
      expect(event?.payload.elderId).toBe("e_li");
    } finally {
      unsubscribe();
    }
  });
});
