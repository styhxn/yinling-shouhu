export type ScamRiskLevel = "high" | "medium" | "low" | "unknown";

export type ScamRedFlag = {
  quote: string;
  reason: string;
};

export type ScamResult = {
  riskLevel: ScamRiskLevel;
  scamType: string;
  confidence: number;
  redFlags: ScamRedFlag[];
  actions: string[];
  questionsToAsk: string[];
  sources: { title: string; url: string }[];
  disclaimer: string;
  extractedText?: string;
  explanation?: string;
  engine?: "rules" | "rules+llm" | "vision";
  model?: string;
};

type Rule = {
  pattern: RegExp;
  reason: string;
  type: string;
};

const HIGH_RULES: Rule[] = [
  { pattern: /安全账户|安全账号|资金审查/, reason: "公检法不会要求把钱转到所谓的安全账户", type: "impersonate_police" },
  { pattern: /通缉令|逮捕令|涉嫌洗钱|涉嫌犯罪/, reason: "用通缉令/犯罪名义施压是冒充公检法的常见话术", type: "impersonate_police" },
  { pattern: /共享屏幕|远程控制|远程协助/, reason: "要求共享屏幕/远程控制，可能直接操作你的手机或银行 App", type: "impersonate_police" },
  { pattern: /验证码|短信码|动态码/, reason: "任何要求提供验证码的行为都高度可疑", type: "other" },
  { pattern: /不要告诉(家人|子女|别人)|保密|别声张/, reason: "要求保密是为了切断你与家人的联系", type: "other" },
  { pattern: /稳赚不赔|内幕消息|保本高息|高额回报|跟着老师做/, reason: "承诺稳赚/内幕消息是投资理财诈骗的典型话术", type: "investment" },
  { pattern: /提现.{0,8}(充值|保证金|解冻)|先充.{0,8}(才能|方可)提现/, reason: "先充值/交保证金才能提现，是虚假投资平台的常见套路", type: "investment" },
  { pattern: /刷单|做任务返利|垫付|连单/, reason: "刷单返利本身就是违法且高发的诈骗类型", type: "part_time" },
  { pattern: /神药|特效药|包治|根治|抗癌|降三高/, reason: "保健品/药品夸大疗效，可能既骗钱又耽误治疗", type: "health_product" },
  { pattern: /中奖|补贴|退税|领取.{0,6}(奖金|补助)/, reason: "先交钱/填银行卡才能领奖/领补贴，通常是诈骗", type: "prize" }
];

const MEDIUM_RULES: Rule[] = [
  { pattern: /客服|退款|理赔|订单异常/, reason: "冒充客服退款是常见套路，应通过官方 App 核实", type: "customer_service" },
  { pattern: /贷款|额度|征信|无抵押/, reason: "贷款/征信类话术常要求先交手续费或保证金", type: "loan" },
  { pattern: /相亲|恋爱|对象|奔现/, reason: "网络交友涉及金钱时要特别警惕", type: "romance" },
  { pattern: /点击链接|扫二维码|下载.{0,6}App/, reason: "陌生链接/二维码/App 可能窃取信息或植入木马", type: "other" }
];

const SOURCES = [{ title: "国家反诈中心", url: "https://www.mps.gov.cn" }];

const DISCLAIMER = "以上为辅助判断，不构成权威结论。请通过官方渠道核实，必要时拨打 96110。";

function detectType(rules: Rule[], text: string): string | null {
  for (const rule of rules) {
    if (rule.pattern.test(text)) return rule.type;
  }
  return null;
}

function collectFlags(rules: Rule[], text: string): ScamRedFlag[] {
  const flags: ScamRedFlag[] = [];
  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    flags.push({
      quote: match[0].slice(0, 60),
      reason: rule.reason
    });
  }
  return flags;
}

function analyzeUrl(url: string): ScamRedFlag[] {
  const flags: ScamRedFlag[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [{ quote: url.slice(0, 60), reason: "链接格式不完整，无法确认来源" }];
  }

  const host = parsed.hostname;
  if (parsed.protocol === "http:") {
    flags.push({ quote: host, reason: "不是 HTTPS 加密链接，信息可能被窃取" });
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    flags.push({ quote: host, reason: "直接使用 IP 地址而不是域名，常见于临时诈骗站点" });
  }
  if (/(bit\.ly|t\.cn|url\.cn|tinyurl\.com|dwz\.cn|suo\.im)/i.test(host)) {
    flags.push({ quote: host, reason: "短链接隐藏了真实地址，无法直接判断" });
  }
  if (host.startsWith("xn--") || host.includes(".xn--")) {
    flags.push({ quote: host, reason: "包含 punycode 域名，可能伪装成正规网站" });
  }
  if (url.includes("@")) {
    flags.push({ quote: url.slice(0, 80), reason: "链接中包含 @，可能把真实域名藏在后面" });
  }
  return flags;
}

export function analyzeScam(input: {
  inputType: "text" | "url" | "image";
  text?: string | null;
  url?: string | null;
}): ScamResult {
  if (input.inputType === "image") {
    return {
      riskLevel: "unknown",
      scamType: "other",
      confidence: 0.3,
      redFlags: [],
      actions: ["先不要转账", "把截图发给家人一起看", "通过官方渠道核实"],
      questionsToAsk: ["对方是否要求你转账或提供验证码？", "对方是否让你不要告诉家人？"],
      sources: SOURCES,
      disclaimer: "图片识别将在后续版本接入。当前请先人工核实，不要转账。"
    };
  }

  const text = (input.text ?? "").trim();
  const url = (input.url ?? "").trim();

  if (input.inputType === "url") {
    const urlFlags = analyzeUrl(url);
    const riskLevel: ScamRiskLevel = urlFlags.length > 0 ? "medium" : "unknown";
    return {
      riskLevel,
      scamType: "other",
      confidence: urlFlags.length > 0 ? 0.7 : 0.3,
      redFlags: urlFlags,
      actions: ["不要点击链接", "通过官方 App 或电话核实", "联系家人", "必要时拨打 96110"],
      questionsToAsk: ["这个链接是谁发给你的？", "对方是否催你马上操作？"],
      sources: SOURCES,
      disclaimer: DISCLAIMER
    };
  }

  const highFlags = collectFlags(HIGH_RULES, text);
  const mediumFlags = collectFlags(MEDIUM_RULES, text);
  const riskLevel: ScamRiskLevel =
    highFlags.length > 0 ? "high" : mediumFlags.length > 0 ? "medium" : "unknown";
  const scamType =
    detectType(HIGH_RULES, text) ?? detectType(MEDIUM_RULES, text) ?? "other";
  const redFlags = [...highFlags, ...mediumFlags].slice(0, 6);

  const actions =
    riskLevel === "high"
      ? ["立即停止转账", "不要点链接/不要共享屏幕", "保留聊天记录", "联系家人", "拨打 96110"]
      : riskLevel === "medium"
        ? ["先不要转账", "通过官方渠道核实", "联系家人一起判断"]
        : ["暂时无法确定", "不要转账或提供验证码", "通过官方渠道核实"];

  return {
    riskLevel,
    scamType,
    confidence: riskLevel === "high" ? 0.9 : riskLevel === "medium" ? 0.7 : 0.3,
    redFlags,
    actions,
    questionsToAsk: [
      "对方是否要求你转账、提供验证码或共享屏幕？",
      "对方是否让你不要告诉家人？",
      "对方是否催你马上做决定？"
    ],
    sources: SOURCES,
    disclaimer: DISCLAIMER
  };
}
