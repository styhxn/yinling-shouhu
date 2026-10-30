import { z } from "zod";
import type { AppDb, MemoryProfile } from "../../store/db.js";
import type { ModelRouter } from "../llm/types.js";
import type { MedicationLike } from "../medication/interactions.js";
import {
  buildRuleDietPlan,
  dietMedicationHits,
  evaluateFood,
  ruleHitsForPlan,
  type DietEvaluation,
  type DietHealth,
  type DietPlan
} from "./rules.js";

const PlanSchema = z.object({
  headline: z.string().min(2).max(60),
  encouragement: z.string().min(2).max(100),
  meals: z
    .array(
      z.object({
        meal: z.enum(["早餐", "午餐", "晚餐"]),
        dishes: z.array(z.string().min(1).max(30)).min(1).max(4),
        reason: z.string().min(2).max(120)
      })
    )
    .length(3),
  hydration: z.string().min(2).max(120),
  questions: z.array(z.string().min(1).max(80)).max(3)
});

const CheckSchema = z.object({
  headline: z.string().min(2).max(80),
  explanation: z.string().min(2).max(240),
  alternatives: z.array(z.string().min(1).max(40)).max(4),
  questions: z.array(z.string().min(1).max(80)).max(2)
});

const PLAN_PROMPT = `你是「银龄守护」的长辈餐桌助手，服务对象是江苏长辈。
只输出 JSON，不要 Markdown，不要解释。
你会收到长辈的慢病、用药、饮食备注和记忆偏好。规则：
1. 只给家常、容易买到、容易做的菜；口味偏江苏家常，但必须少盐、少油、少糖。
2. 高血压：不要腌制品、咸货、加工肉、浓汤；红烧肉、肥肉、油炸只能极少量。
3. 糖尿病：不喝甜饮料、不吃甜点；主食控制在小半碗，优先杂粮；粥要少。
4. 与药物冲突的食物必须避开（如葡萄柚、酒、甘草）。
5. 每餐要有蛋白质（鱼、蛋、豆腐、瘦肉）和蔬菜；晚餐七分饱。
6. 不承诺疗效，不说“治好、根治、降三高”。
7. 结合长辈偏好，但偏好不健康时只给改良做法，不直接照做。
输出结构：
{"headline":"一句今日饮食重点","encouragement":"一句鼓励","meals":[{"meal":"早餐","dishes":["菜1","菜2"],"reason":"为什么这样搭配"},{"meal":"午餐","dishes":["菜1","菜2","主食"],"reason":"..."},{"meal":"晚餐","dishes":["菜1","菜2"],"reason":"..."}],"hydration":"喝水建议","questions":["最多3个问题"]}`;

const CHECK_PROMPT = `你是「银龄守护」的长辈餐桌助手，语气温暖、简短、像家里人说话。
只输出 JSON，不要 Markdown。
你会收到一个食物问题、长辈的慢病、用药，以及规则引擎已经给出的判断。
规则：
1. 不能改变规则引擎的结论：结论是 avoid 就不能说“可以放心吃”；结论是 limit 就不能说“随便吃”。
2. 如果有药物与食物冲突，必须明确说出来。
3. 给 1–2 个可执行的替代做法，不要长篇大论。
4. 不诊断、不开方、不承诺疗效。
5. 语言口语化，一次只说一个重点。
输出结构：
{"headline":"一句结论","explanation":"2-3句解释，先说能不能吃，再说怎么做","alternatives":["替代做法"],"questions":["最多2个追问"]}`;

function localDateKey(ts = Date.now()) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mentionsUnsafeClaim(text: string, verdict: string): boolean {
  if (verdict === "avoid") return /放心吃|可以吃|没问题|没事|随便吃/.test(text);
  if (verdict === "limit") return /放心吃|随便吃|多吃点/.test(text);
  return false;
}

function dishIsSafe(dish: string, health: DietHealth, meds: MedicationLike[]): boolean {
  const hits = [...ruleHitsForPlan(dish, health), ...dietMedicationHits(dish, meds)];
  return hits.every((hit) => hit.verdict === "ok");
}

export function createDietService(input: { db: AppDb; modelRouter: ModelRouter }) {
  const cache = new Map<string, { plan: DietPlan; ts: number }>();

  async function loadContext(elderId: string): Promise<{
    health: DietHealth;
    meds: MedicationLike[];
    profile: MemoryProfile | null;
    name: string;
  }> {
    const [healthRecord, meds, profileRecord, elder] = await Promise.all([
      input.db.healthProfiles.getByElder(elderId),
      input.db.medications.listByElder(elderId),
      input.db.memoryProfiles.getByElder(elderId),
      input.db.elders.getById(elderId)
    ]);
    return {
      health: {
        conditions: healthRecord?.conditions ?? [],
        allergies: healthRecord?.allergies ?? [],
        dietNotes: healthRecord?.dietNotes ?? null
      },
      meds: meds.map((med) => ({ name: med.name, genericName: med.genericName })),
      profile: profileRecord?.profile ?? null,
      name: elder?.displayName ?? "长辈"
    };
  }

  function personalNote(profile: MemoryProfile | null): string | undefined {
    const preferences = profile?.preferences ?? [];
    if (!preferences.length) return undefined;
    const first = preferences[0]?.trim();
    if (!first) return undefined;
    if (/红烧肉|肥肉|甜|油炸/.test(first)) {
      return `记得您喜欢${first}：可以保留这个口味，但改成少油少盐、小份，别天天吃。`;
    }
    return `记得您喜欢${first}，可以把它安排进清淡的搭配里。`;
  }

  async function dailyPlan(elderId: string, options: { refresh?: boolean } = {}): Promise<DietPlan> {
    const key = `${elderId}:${localDateKey()}`;
    const cached = cache.get(key);
    if (!options.refresh && cached && Date.now() - cached.ts < 10 * 60_000) return cached.plan;

    const { health, meds, profile, name } = await loadContext(elderId);
    const rulePlan = buildRuleDietPlan({ health, meds });
    const note = personalNote(profile);

    let plan: DietPlan = {
      ...rulePlan,
      ...(note ? { personalNote: note } : {}),
      engine: "rules",
      model: input.modelRouter.mode
    };

    if (input.modelRouter.mode === "live") {
      try {
        const result = await input.modelRouter.chatJSON({
          task: "diet_plan",
          schema: PlanSchema,
          temperature: 0.35,
          maxTokens: 900,
          timeoutMs: 22_000,
          messages: [
            { role: "system", content: PLAN_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                elder: name,
                conditions: health.conditions,
                allergies: health.allergies,
                dietNotes: health.dietNotes,
                medications: meds,
                preferences: profile?.preferences ?? [],
                rulePlan: {
                  headline: rulePlan.headline,
                  meals: rulePlan.meals,
                  avoid: rulePlan.avoid,
                  medicationCautions: rulePlan.medicationCautions
                }
              })
            }
          ]
        });
        const meals = result.meals.map((meal) => {
          const safe = meal.dishes.every((dish) => dishIsSafe(dish, health, meds));
          if (safe) return meal;
          const fallback = rulePlan.meals.find((item) => item.meal === meal.meal);
          return fallback ?? meal;
        });
        plan = {
          ...rulePlan,
          headline: result.headline,
          encouragement: result.encouragement,
          meals,
          hydration: result.hydration,
          questions: result.questions,
          ...(note ? { personalNote: note } : {}),
          engine: "rules+llm",
          model: input.modelRouter.mode
        };
      } catch {
        // Keep the deterministic plan when the model is unavailable or returns invalid JSON.
      }
    }

    cache.set(key, { plan, ts: Date.now() });
    return plan;
  }

  async function checkFood(elderId: string, food: string): Promise<DietEvaluation & { engine: "rules" | "rules+llm"; model: string }> {
    const { health, meds, name } = await loadContext(elderId);
    const base = evaluateFood({ food, health, meds });
    if (input.modelRouter.mode !== "live") {
      return { ...base, engine: "rules", model: input.modelRouter.mode };
    }
    try {
      const result = await input.modelRouter.chatJSON({
        task: "diet_check",
        schema: CheckSchema,
        temperature: 0.3,
        maxTokens: 500,
        timeoutMs: 15_000,
        messages: [
          { role: "system", content: CHECK_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              elder: name,
              food,
              conditions: health.conditions,
              allergies: health.allergies,
              medications: meds,
              verdict: base.verdict,
              ruleAdvice: base.advice,
              ruleReasons: base.hits.map((hit) => ({ food: hit.food, reason: hit.reason }))
            })
          }
        ]
      });
      const text = `${result.headline}${result.explanation}`;
      if (mentionsUnsafeClaim(text, base.verdict)) {
        return { ...base, engine: "rules", model: input.modelRouter.mode };
      }
      return {
        ...base,
        headline: result.headline,
        advice: result.explanation,
        alternatives: result.alternatives.length ? result.alternatives : base.alternatives,
        questions: result.questions.length ? result.questions : base.questions,
        engine: "rules+llm",
        model: input.modelRouter.mode
      };
    } catch {
      return { ...base, engine: "rules", model: input.modelRouter.mode };
    }
  }

  return { dailyPlan, checkFood, loadContext };
}

export type DietService = ReturnType<typeof createDietService>;
