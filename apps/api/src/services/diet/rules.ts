import type { MedicationLike } from "../medication/interactions.js";
import { buildMedicationSafety } from "../medication/interactions.js";

export type DietHealth = {
  conditions: string[];
  allergies: string[];
  dietNotes?: string | null;
};

export type DietVerdict = "avoid" | "limit" | "ok" | "unknown";

export type DietSource = {
  title: string;
  url?: string;
};

export type DietHit = {
  id: string;
  verdict: Exclude<DietVerdict, "unknown">;
  food: string;
  title: string;
  reason: string;
  advice: string;
  source: DietSource;
};

export type DietEvaluation = {
  verdict: DietVerdict;
  hits: DietHit[];
  headline: string;
  advice: string;
  alternatives: string[];
  questions: string[];
  sources: DietSource[];
};

export type DietMeal = {
  meal: "早餐" | "午餐" | "晚餐";
  dishes: string[];
  reason: string;
};

export type DietPlan = {
  headline: string;
  encouragement: string;
  meals: DietMeal[];
  avoid: Array<{ food: string; reason: string }>;
  medicationCautions: Array<{ medication: string; food: string; advice: string }>;
  hydration: string;
  questions: string[];
  sources: DietSource[];
  personalNote?: string;
  engine: "rules" | "rules+llm";
  model: string;
};

const SOURCE = {
  title: "中国居民膳食指南（2022）/ 国家卫健委",
  url: "http://www.nhc.gov.cn"
};

const MED_SOURCE = {
  title: "国家药监局药品说明书",
  url: "https://www.nmpa.gov.cn"
};

type ConditionRule = {
  id: string;
  condition: RegExp;
  foods: string[];
  verdict: "avoid" | "limit" | "ok";
  title: string;
  reason: string;
  advice: string;
  source: DietSource;
};

const CONDITION_RULES: ConditionRule[] = [
  {
    id: "htn_salt",
    condition: /高血压|血压/,
    foods: ["咸菜", "榨菜", "咸鱼", "腊肉", "香肠", "火腿", "酱鸭", "咸鸭蛋", "方便面", "薯片", "腌菜", "酱菜", "腐乳"],
    verdict: "avoid",
    title: "高血压要少盐",
    reason: "这些食物含盐量高，容易让血压升高。",
    advice: "尽量不吃；做菜用限盐勺，少放酱油、味精和豆瓣酱。",
    source: SOURCE
  },
  {
    id: "htn_fat",
    condition: /高血压|血压|高血脂|血脂|胆固醇/,
    foods: ["红烧肉", "扣肉", "肥肉", "五花肉", "油炸", "炸鸡", "油条", "动物油", "猪油", "奶油"],
    verdict: "limit",
    title: "少油少肥肉",
    reason: "高油高脂会增加血管负担，也容易让体重和血脂升高。",
    advice: "想吃可以少量，选瘦肉，用蒸、煮、炖代替油炸。",
    source: SOURCE
  },
  {
    id: "dm_sugar",
    condition: /糖尿病|血糖/,
    foods: ["甜饮料", "可乐", "果汁", "蛋糕", "糖果", "蜂蜜", "甜点", "冰淇淋", "奶茶", "白砂糖", "红糖"],
    verdict: "avoid",
    title: "糖尿病要避开含糖食物",
    reason: "这些食物升糖快，容易让血糖波动。",
    advice: "不喝甜饮料；口渴喝白水或无糖茶。想吃甜味可以用少量新鲜水果代替。",
    source: SOURCE
  },
  {
    id: "dm_porridge",
    condition: /糖尿病|血糖/,
    foods: ["白粥", "稀饭", "烂面条", "米糊"],
    verdict: "limit",
    title: "粥类要少喝",
    reason: "煮得很烂的粥升糖较快，单喝粥容易饿、血糖也不稳。",
    advice: "少量喝，搭配鸡蛋、豆腐或青菜，不要只喝一大碗粥。",
    source: SOURCE
  },
  {
    id: "dm_staple",
    condition: /糖尿病|血糖/,
    foods: ["糯米饭", "年糕", "汤圆", "粽子", "糖藕"],
    verdict: "limit",
    title: "黏性主食要控制",
    reason: "糯米类食物升糖快，也不太好消化。",
    advice: "一次吃一小份，细嚼慢咽；晚上尽量不吃。",
    source: SOURCE
  },
  {
    id: "gout_purine",
    condition: /痛风|尿酸/,
    foods: ["海鲜", "虾", "蟹", "动物内脏", "猪肝", "浓汤", "火锅汤", "啤酒"],
    verdict: "avoid",
    title: "痛风要避开高嘌呤食物",
    reason: "高嘌呤食物可能诱发痛风发作。",
    advice: "少喝浓汤，不饮酒，多喝水；具体忌口听医生的。",
    source: SOURCE
  },
  {
    id: "kidney_potassium",
    condition: /肾病|肾功能|慢性肾/,
    foods: ["香蕉", "橙子", "土豆", "菠菜", "低钠盐", "钾盐"],
    verdict: "limit",
    title: "肾功能不好要留意高钾食物",
    reason: "肾功能下降时，钾排不出去，可能影响心律。",
    advice: "这些食物不是完全不能吃，但要按医生给的量，不要自行用低钠盐。",
    source: SOURCE
  }
];

const GENERAL_RULES: ConditionRule[] = [
  {
    id: "general_ok",
    condition: /.*/,
    foods: ["青菜", "西兰花", "黄瓜", "番茄", "鱼", "豆腐", "鸡蛋", "牛奶", "燕麦", "杂粮", "苹果", "梨"],
    verdict: "ok",
    title: "适合日常吃",
    reason: "这类食物比较清淡，能补充蛋白质、膳食纤维和维生素。",
    advice: "可以吃，注意少盐少油、控制总量，搭配着吃更好。",
    source: SOURCE
  },
  {
    id: "general_food_safety",
    condition: /.*/,
    foods: ["隔夜菜", "生鱼片", "生鸡蛋", "凉拌菜放很久", "过期"],
    verdict: "avoid",
    title: "注意食品安全",
    reason: "长辈胃肠抵抗力弱，吃变质或不熟的食物容易腹泻。",
    advice: "饭菜现做现吃，剩菜彻底加热；不认识的野菜、药酒不要吃。",
    source: SOURCE
  },
  {
    id: "general_choking",
    condition: /.*/,
    foods: ["汤圆", "年糕", "果冻", "大块肉", "花生米"],
    verdict: "limit",
    title: "防呛咳",
    reason: "黏性、圆滑或大块食物容易噎住。",
    advice: "切小块、细嚼慢咽，吃饭时不要说笑；戴假牙的长辈尤其注意。",
    source: SOURCE
  },
  {
    id: "general_alcohol",
    condition: /.*/,
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒"],
    verdict: "limit",
    title: "尽量不饮酒",
    reason: "酒精会影响血压、血糖和睡眠，还容易和药物相互作用。",
    advice: "服药期间尤其不要饮酒；以茶代酒，少量也不行。",
    source: SOURCE
  }
];

const ALLERGY_RULE = {
  id: "allergy",
  title: "食物过敏",
  reason: "您记录了对这种食物过敏，吃了可能出现皮疹、瘙痒、呼吸困难。",
  advice: "不要吃，也要留意配料表里有没有隐藏的同类成分。",
  source: { title: "个人健康档案", url: "" }
};

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function dedupeHits(hits: DietHit[]): DietHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.id}|${hit.food}|${hit.verdict}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verdictRank(verdict: DietVerdict): number {
  if (verdict === "avoid") return 3;
  if (verdict === "limit") return 2;
  if (verdict === "ok") return 1;
  return 0;
}

function maxVerdict(hits: DietHit[]): DietVerdict {
  if (!hits.length) return "unknown";
  return hits.reduce<DietVerdict>(
    (current, hit) => (verdictRank(hit.verdict) > verdictRank(current) ? hit.verdict : current),
    "unknown"
  );
}

function matchKeyword(text: string, keywords: string[]): string | null {
  const normalized = normalize(text);
  return keywords.find((keyword) => normalized.includes(normalize(keyword))) ?? null;
}

function ruleHits(food: string, health: DietHealth): DietHit[] {
  const conditions = health.conditions.join(" ");
  const hits: DietHit[] = [];

  for (const allergy of health.allergies) {
    if (!allergy.trim()) continue;
    if (normalize(food).includes(normalize(allergy))) {
      hits.push({
        id: ALLERGY_RULE.id,
        verdict: "avoid",
        food: allergy,
        title: ALLERGY_RULE.title,
        reason: ALLERGY_RULE.reason,
        advice: ALLERGY_RULE.advice,
        source: ALLERGY_RULE.source
      });
    }
  }

  for (const rule of [...CONDITION_RULES, ...GENERAL_RULES]) {
    if (!GENERAL_RULES.includes(rule) && !rule.condition.test(conditions)) continue;
    const matched = matchKeyword(food, rule.foods);
    if (!matched) continue;
    hits.push({
      id: rule.id,
      verdict: rule.verdict,
      food: matched,
      title: rule.title,
      reason: rule.reason,
      advice: rule.advice,
      source: rule.source
    });
  }
  return dedupeHits(hits);
}

export function ruleHitsForPlan(food: string, health: DietHealth): DietHit[] {
  return ruleHits(food, health);
}

export function dietMedicationHits(food: string, meds: MedicationLike[]): DietHit[] {
  const safety = buildMedicationSafety(meds);
  const hits: DietHit[] = [];
  for (const warning of safety.warnings) {
    const matched = matchKeyword(food, warning.foods ?? []);
    if (!matched) continue;
    hits.push({
      id: warning.id,
      verdict: warning.level === "avoid" ? "avoid" : "limit",
      food: matched,
      title: warning.title,
      reason: warning.detail,
      advice: warning.detail,
      source: warning.source
    });
  }
  return dedupeHits(hits);
}

export function evaluateFood(input: {
  food: string;
  health: DietHealth;
  meds: MedicationLike[];
}): DietEvaluation {
  const food = input.food.trim();
  if (!food) {
    return {
      verdict: "unknown",
      hits: [],
      headline: "我没听清是什么食物",
      advice: "您再说一遍菜名，我帮您看看。",
      alternatives: [],
      questions: ["是家里的饭菜，还是外面买的？"],
      sources: [SOURCE]
    };
  }
  const hits = dedupeHits([
    ...ruleHits(food, input.health),
    ...dietMedicationHits(food, input.meds)
  ]);
  const verdict = maxVerdict(hits);
  const avoidOrLimit = hits.filter((hit) => hit.verdict !== "ok");
  const first = avoidOrLimit[0];
  const conditionText = input.health.conditions.length
    ? input.health.conditions.join("、")
    : "目前没有记录慢病";
  const headline =
    verdict === "avoid"
      ? `建议先别吃${first?.food ? `「${first.food}」` : "这个"}`
      : verdict === "limit"
        ? `可以少量吃${first?.food ? `「${first.food}」` : "这个"}，别多吃`
        : verdict === "ok"
          ? "这个可以吃，注意少盐少油"
          : "没有查到明确禁忌，但要少量、清淡";
  const advice =
    avoidOrLimit.length > 0
      ? avoidOrLimit.map((hit) => hit.advice).join(" ")
      : `您的健康档案是${conditionText}。这道菜没有查到明确冲突，建议少盐少油、控制份量；吃完留意身体反应。`;
  return {
    verdict,
    hits,
    headline,
    advice,
    alternatives:
      verdict === "avoid"
        ? ["清蒸鱼", "豆腐炖菌菇", "清炒时蔬", "杂粮饭（小半碗）"]
        : verdict === "limit"
          ? ["把份量减半", "搭配一盘青菜", "用蒸煮代替油炸", "饭后走一走"]
          : ["搭配一份青菜", "主食一小碗", "饭后喝点温水"],
    questions:
      verdict === "unknown"
        ? ["这道菜是家里做的还是外面买的？", "有没有放很多盐、酱油或糖？"]
        : ["最近有没有头晕、心慌、水肿？", "这道菜是您自己做的吗？咸淡怎么样？"],
    sources: Array.from(
      new Map(
        [...hits.map((hit) => hit.source), SOURCE].map((source) => [source.title, source])
      ).values()
    )
  };
}

export function buildRuleDietPlan(input: {
  health: DietHealth;
  meds: MedicationLike[];
}): DietPlan {
  const conditions = input.health.conditions.join(" ");
  const diabetic = /糖尿病|血糖/.test(conditions);
  const hypertensive = /高血压|血压/.test(conditions);
  const meals: DietMeal[] = [
    {
      meal: "早餐",
      dishes: diabetic
        ? ["燕麦粥（小碗）", "水煮蛋 1 个", "凉拌黄瓜"]
        : ["小米粥（小碗）", "水煮蛋 1 个", "清炒青菜"],
      reason: diabetic
        ? "燕麦比白粥升糖慢，配鸡蛋更顶饱。"
        : "清淡好消化，上午有精神。"
    },
    {
      meal: "午餐",
      dishes: ["清蒸鲈鱼", "蒜蓉青菜", "杂粮饭（小半碗）"],
      reason: "鱼肉好消化，蒸菜少油；杂粮饭比白米饭更稳。"
    },
    {
      meal: "晚餐",
      dishes: ["豆腐菌菇汤", "清炒时蔬", "红薯或杂粮饭（小份）"],
      reason: "晚饭七分饱，少油少盐，睡前更舒服。"
    }
  ];
  const safety = buildMedicationSafety(input.meds);
  const avoidMap = new Map<string, string>();
  for (const rule of [...CONDITION_RULES, ...GENERAL_RULES]) {
    if (!rule.condition.test(conditions) && !GENERAL_RULES.includes(rule)) continue;
    if (rule.verdict !== "avoid") continue;
    for (const food of rule.foods.slice(0, 4)) {
      if (!avoidMap.has(food)) avoidMap.set(food, rule.reason);
    }
  }
  for (const warning of safety.warnings) {
    if (warning.level !== "avoid") continue;
    for (const food of (warning.foods ?? []).slice(0, 2)) {
      if (!avoidMap.has(food)) avoidMap.set(food, warning.detail);
    }
  }
  const medicationCautions = safety.foodCautions.slice(0, 4).map((item) => ({
    medication: item.medication,
    food: item.food,
    advice: item.advice
  }));
  return {
    headline: hypertensive
      ? "今天吃得清淡一点，血压更稳"
      : diabetic
        ? "主食少一点，蔬菜和蛋白质多一点"
        : "今天也好好吃饭，清淡、热乎、慢慢嚼",
    encouragement: "不用一下子全改，今天先做到少盐、少油、七分饱。",
    meals,
    avoid: Array.from(avoidMap.entries())
      .slice(0, 6)
      .map(([food, reason]) => ({ food, reason })),
    medicationCautions,
    hydration: "白天分几次喝温水，共 6–8 小杯；晚上睡前少喝，免得起夜。",
    questions: [
      "最近胃口怎么样？有没有不想吃的时候？",
      "有没有头晕、心慌、脚踝水肿？",
      "这周想吃点什么，我帮您换成更合适的做法。"
    ],
    sources: [SOURCE, ...(safety.warnings.length ? [MED_SOURCE] : [])],
    engine: "rules",
    model: "rules"
  };
}

export function dietPlanSummary(plan: DietPlan): string {
  const meals = plan.meals
    .map((meal) => `${meal.meal}：${meal.dishes.join("、")}`)
    .join("；");
  const avoid = plan.avoid.length
    ? `少吃或不吃：${plan.avoid.map((item) => item.food).slice(0, 4).join("、")}。`
    : "";
  return `${plan.headline}。${meals}。${avoid}${plan.encouragement}`;
}

export function foodSafetySummary(evaluation: DietEvaluation): string {
  const reasons = evaluation.hits
    .slice(0, 2)
    .map((hit) => `${hit.food}：${hit.reason}`)
    .join("；");
  return `${evaluation.headline}。${evaluation.advice}${reasons ? `（依据：${reasons}）` : ""}`;
}
