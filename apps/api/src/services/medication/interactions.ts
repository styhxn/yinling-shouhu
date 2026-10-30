export type MedicationLike = {
  name: string;
  genericName?: string | null;
};

export type InteractionLevel = "avoid" | "caution" | "info";

export type InteractionSource = {
  title: string;
  url?: string;
};

export type DrugFoodRule = {
  id: string;
  drugs: string[];
  foods: string[];
  level: InteractionLevel;
  title: string;
  advice: string;
  reason: string;
  source: InteractionSource;
};

export type DrugDrugRule = {
  id: string;
  a: string[];
  b: string[];
  level: InteractionLevel;
  title: string;
  advice: string;
  reason: string;
  source: InteractionSource;
};

export type MedicationWarning = {
  id: string;
  level: InteractionLevel;
  title: string;
  detail: string;
  drugs: string[];
  foods?: string[];
  source: InteractionSource;
};

export type MedicationSafety = {
  warnings: MedicationWarning[];
  foodCautions: Array<{
    medication: string;
    food: string;
    level: InteractionLevel;
    advice: string;
    source: InteractionSource;
  }>;
  missedDose: string[];
  disclaimer: string;
};

const SOURCE_LABEL = {
  title: "国家药监局药品说明书 / 国家卫健委膳食指南",
  url: "https://www.nmpa.gov.cn"
};

export const DRUG_FOOD_RULES: DrugFoodRule[] = [
  {
    id: "df_grapefruit_ccb",
    drugs: ["氨氯地平", "硝苯地平", "非洛地平", "左旋氨氯地平", "尼群地平"],
    foods: ["葡萄柚", "西柚", "柚子茶", "西柚汁", "葡萄柚汁"],
    level: "avoid",
    title: "降压药与葡萄柚",
    advice: "服用这类降压药期间，不要吃葡萄柚、西柚或喝西柚汁。",
    reason: "葡萄柚会影响部分降压药的代谢，可能让血压降得过低，出现头晕、乏力。",
    source: SOURCE_LABEL
  },
  {
    id: "df_grapefruit_statin",
    drugs: ["阿托伐他汀", "辛伐他汀", "洛伐他汀"],
    foods: ["葡萄柚", "西柚", "西柚汁", "葡萄柚汁"],
    level: "avoid",
    title: "降脂药与葡萄柚",
    advice: "吃这类降脂药时，避免葡萄柚和西柚汁。",
    reason: "葡萄柚可能升高药物在体内的浓度，增加肌肉酸痛、肝损伤的风险。",
    source: SOURCE_LABEL
  },
  {
    id: "df_metformin_alcohol",
    drugs: ["二甲双胍"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒", "料酒"],
    level: "avoid",
    title: "二甲双胍与饮酒",
    advice: "服药期间不要饮酒，做菜也尽量少放料酒。",
    reason: "饮酒会增加二甲双胍相关乳酸酸中毒的风险，也可能让血糖波动。",
    source: SOURCE_LABEL
  },
  {
    id: "df_sulfonylurea_alcohol",
    drugs: ["格列美脲", "格列本脲", "格列齐特", "格列吡嗪"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒"],
    level: "avoid",
    title: "降糖药与饮酒",
    advice: "服药期间不要空腹饮酒，避免低血糖。",
    reason: "酒精会增强降糖作用，空腹饮酒容易发生心慌、出汗、手抖等低血糖表现。",
    source: SOURCE_LABEL
  },
  {
    id: "df_warfarin_greens",
    drugs: ["华法林"],
    foods: ["菠菜", "西兰花", "卷心菜", "生菜", "青菜", "油菜", "芥蓝"],
    level: "caution",
    title: "华法林与绿叶菜",
    advice: "绿叶菜可以吃，但要保持每天差不多的量，不要突然大幅增减。",
    reason: "绿叶菜含维生素 K，会影响华法林的抗凝效果；保持稳定比完全不吃更重要。",
    source: SOURCE_LABEL
  },
  {
    id: "df_warfarin_alcohol",
    drugs: ["华法林"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒"],
    level: "avoid",
    title: "华法林与饮酒",
    advice: "服用华法林期间不要饮酒。",
    reason: "酒精会影响凝血功能，增加出血风险。",
    source: SOURCE_LABEL
  },
  {
    id: "df_aspirin_alcohol",
    drugs: ["阿司匹林", "氯吡格雷"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒"],
    level: "avoid",
    title: "抗血小板药与饮酒",
    advice: "服药期间不要饮酒，注意有没有牙龈出血、黑便。",
    reason: "酒精会增加胃出血和脑出血的风险。",
    source: SOURCE_LABEL
  },
  {
    id: "df_levothyroxine",
    drugs: ["左甲状腺素", "优甲乐"],
    foods: ["豆浆", "豆腐", "牛奶", "钙片", "铁剂", "咖啡"],
    level: "caution",
    title: "左甲状腺素与早餐",
    advice: "早上空腹服药，至少间隔 30–60 分钟再吃早餐；豆制品、牛奶、钙片、铁剂最好间隔 4 小时。",
    reason: "这些食物会影响左甲状腺素的吸收，让药效不稳定。",
    source: SOURCE_LABEL
  },
  {
    id: "df_cephalosporin_alcohol",
    drugs: ["头孢", "甲硝唑", "替硝唑"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒", "料酒"],
    level: "avoid",
    title: "抗菌药与饮酒",
    advice: "用药期间和停药后 7 天内都不要饮酒。",
    reason: "部分抗菌药与酒精会发生双硫仑样反应，出现脸红、心慌、呼吸困难。",
    source: SOURCE_LABEL
  },
  {
    id: "df_licorice_bp",
    drugs: ["氨氯地平", "硝苯地平", "缬沙坦", "氯沙坦", "依那普利", "贝那普利", "氢氯噻嗪"],
    foods: ["甘草", "甘草片", "甘草杏", "话梅"],
    level: "caution",
    title: "降压药与甘草",
    advice: "不要长期含服甘草片或大量吃甘草制品。",
    reason: "甘草可能让身体潴留水分和钠，抵消降压药效果，还可能引起低钾。",
    source: SOURCE_LABEL
  },
  {
    id: "df_acei_potassium",
    drugs: ["依那普利", "贝那普利", "缬沙坦", "氯沙坦", "厄贝沙坦", "螺内酯"],
    foods: ["钾盐", "低钠盐", "香蕉", "橙子", "土豆"],
    level: "caution",
    title: "降压药与高钾食物",
    advice: "不要自行使用低钠盐或钾补充剂；香蕉、橙子正常吃可以，但不要一次吃太多。",
    reason: "这类药物可能升高血钾，肾功能不好时尤其要当心。",
    source: SOURCE_LABEL
  },
  {
    id: "df_iron_tea",
    drugs: ["铁剂", "硫酸亚铁", "琥珀酸亚铁"],
    foods: ["浓茶", "咖啡", "牛奶"],
    level: "caution",
    title: "补铁与茶、咖啡",
    advice: "补铁药和浓茶、咖啡、牛奶间隔 1–2 小时。",
    reason: "茶多酚、钙会影响铁的吸收。",
    source: SOURCE_LABEL
  },
  {
    id: "df_sedative_alcohol",
    drugs: ["安定", "地西泮", "艾司唑仑", "阿普唑仑", "佐匹克隆", "氯苯那敏", "苯海拉明"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒"],
    level: "avoid",
    title: "镇静助眠药与饮酒",
    advice: "服药期间不要饮酒，起夜时先坐一会儿再下床。",
    reason: "酒精会加重嗜睡和头晕，增加跌倒风险。",
    source: SOURCE_LABEL
  },
  {
    id: "df_nsaid_alcohol",
    drugs: ["布洛芬", "双氯芬酸", "塞来昔布", "洛索洛芬"],
    foods: ["白酒", "黄酒", "啤酒", "红酒", "酒"],
    level: "avoid",
    title: "止痛药与饮酒",
    advice: "服药期间不要饮酒，饭后服用，注意胃痛和黑便。",
    reason: "酒精会增加止痛药对胃黏膜的刺激和出血风险。",
    source: SOURCE_LABEL
  }
];

export const DRUG_DRUG_RULES: DrugDrugRule[] = [
  {
    id: "dd_anticoagulant",
    a: ["阿司匹林", "氯吡格雷"],
    b: ["华法林", "利伐沙班", "达比加群"],
    level: "caution",
    title: "抗血小板药与抗凝药同服",
    advice: "按医生要求服用，留意牙龈出血、鼻出血、黑便；不要自行加量或停药。",
    reason: "两类药都会影响凝血，同服时出血风险增加。",
    source: SOURCE_LABEL
  },
  {
    id: "dd_ibuprofen_aspirin",
    a: ["布洛芬", "双氯芬酸", "洛索洛芬"],
    b: ["阿司匹林"],
    level: "caution",
    title: "止痛药与阿司匹林同服",
    advice: "不要自行同服；需要止痛时先问医生或药师。",
    reason: "可能增加胃出血风险，也可能影响阿司匹林的心血管保护作用。",
    source: SOURCE_LABEL
  },
  {
    id: "dd_acei_potassium",
    a: ["依那普利", "贝那普利", "缬沙坦", "氯沙坦", "厄贝沙坦"],
    b: ["螺内酯", "氯化钾", "枸橼酸钾"],
    level: "caution",
    title: "降压药与保钾药同服",
    advice: "按医嘱复查血钾和肾功能，不要自行补钾。",
    reason: "同服可能引起高钾血症，严重时影响心律。",
    source: SOURCE_LABEL
  },
  {
    id: "dd_hypoglycemia_mask",
    a: ["格列美脲", "格列本脲", "胰岛素"],
    b: ["美托洛尔", "比索洛尔", "普萘洛尔"],
    level: "caution",
    title: "降糖药与 β 受体阻滞剂",
    advice: "注意监测血糖；这类药可能掩盖心慌、手抖等低血糖信号。",
    reason: "β 受体阻滞剂可能减轻低血糖的心慌、手抖表现，让人不容易察觉低血糖。",
    source: SOURCE_LABEL
  }
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function medText(med: MedicationLike): string {
  return normalize(`${med.name}${med.genericName ? ` ${med.genericName}` : ""}`);
}

export function medicationMatches(med: MedicationLike, patterns: string[]): boolean {
  const text = medText(med);
  return patterns.some((pattern) => text.includes(normalize(pattern)));
}

export function findDrugFoodWarnings(meds: MedicationLike[]): MedicationWarning[] {
  const out: MedicationWarning[] = [];
  const seen = new Set<string>();
  for (const med of meds) {
    for (const rule of DRUG_FOOD_RULES) {
      if (!medicationMatches(med, rule.drugs)) continue;
      const key = `${rule.id}|${med.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: rule.id,
        level: rule.level,
        title: `${rule.title}：${med.name}`,
        detail: `${rule.advice}${rule.reason}`,
        drugs: [med.name],
        foods: rule.foods,
        source: rule.source
      });
    }
  }
  return out;
}

export function findDrugDrugWarnings(meds: MedicationLike[]): MedicationWarning[] {
  const out: MedicationWarning[] = [];
  const seen = new Set<string>();
  for (const rule of DRUG_DRUG_RULES) {
    const a = meds.find((med) => medicationMatches(med, rule.a));
    const b = meds.find((med) => medicationMatches(med, rule.b));
    if (!a || !b || a.name === b.name) continue;
    const key = `${rule.id}|${a.name}|${b.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: rule.id,
      level: rule.level,
      title: rule.title,
      detail: `${rule.advice}${rule.reason}`,
      drugs: [a.name, b.name],
      source: rule.source
    });
  }
  return out;
}

function missedDoseFor(med: MedicationLike): string {
  if (medicationMatches(med, ["二甲双胍"])) {
    return `${med.name}：漏服一次不要补双倍；如果接近下一次服药时间，就按原计划吃下一次。出现心慌、出汗、手抖时先吃点糖并联系家人。`;
  }
  if (medicationMatches(med, ["格列美脲", "格列本脲", "格列齐特", "格列吡嗪", "胰岛素"])) {
    return `${med.name}：漏服或漏打后不要自行补双倍；先测血糖，出现低血糖症状先吃糖，并联系家人或医生。`;
  }
  if (medicationMatches(med, ["氨氯地平", "硝苯地平", "非洛地平", "缬沙坦", "氯沙坦", "依那普利", "贝那普利"])) {
    return `${med.name}：想起时如果离下一次服药还早，可以补服；如果快到下一次，就跳过，千万不要吃双倍。头晕明显时先坐下休息并测血压。`;
  }
  if (medicationMatches(med, ["华法林", "阿司匹林", "氯吡格雷", "利伐沙班", "达比加群"])) {
    return `${med.name}：漏服不要补双倍；注意牙龈出血、鼻出血和黑便，必要时联系医生。`;
  }
  return `${med.name}：漏服一次不要补双倍；不确定时看说明书或问医生、药师。`;
}

export function buildMedicationSafety(meds: MedicationLike[]): MedicationSafety {
  const warnings = [...findDrugFoodWarnings(meds), ...findDrugDrugWarnings(meds)].sort((a, b) => {
    const rank = { avoid: 0, caution: 1, info: 2 } as const;
    return rank[a.level] - rank[b.level];
  });
  const foodCautions = warnings
    .filter((warning) => warning.foods?.length)
    .map((warning) => ({
      medication: warning.drugs[0] ?? "",
      food: warning.foods?.[0] ?? "",
      level: warning.level,
      advice: warning.detail,
      source: warning.source
    }));
  const missedDose = Array.from(new Set(meds.map((med) => missedDoseFor(med))));
  return {
    warnings,
    foodCautions,
    missedDose,
    disclaimer:
      "以上为常见用药注意事项，不能替代医生和药师的判断；调整药物、停药或补服前请先咨询医生。"
  };
}

export function medicationSafetySummary(meds: MedicationLike[]): string {
  const safety = buildMedicationSafety(meds);
  if (!safety.warnings.length) {
    return "常用药之间暂未发现明确的冲突，但仍要按医嘱服用。";
  }
  const items = safety.warnings
    .slice(0, 3)
    .map((warning) => `${warning.title}：${warning.detail}`);
  return `${items.join("\n")}\n漏服时不要自行补双倍，先看说明书或问医生。`;
}
