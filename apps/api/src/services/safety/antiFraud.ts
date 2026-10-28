import type { ModelRouter } from "../llm/types.js";
import type { VectorStore } from "../search/vectorStore.js";

export type AntiFraudEntry = {
  id: string;
  title: string;
  summary: string;
  actions: string[];
  keywords: string[];
  source: { title: string; url: string };
};

export type AntiFraudHit = Omit<AntiFraudEntry, "keywords"> & { score: number };

const SOURCE = { title: "国家反诈中心", url: "https://www.mps.gov.cn" };

const KB: AntiFraudEntry[] = [
  {
    id: "af_police",
    title: "冒充公检法",
    summary: "对方自称警察、检察官或法院，说你涉嫌洗钱/犯罪，要求把钱转到“安全账户”接受审查，并让你保密。",
    actions: ["立即挂断", "不要转账到任何“安全账户”", "拨打 96110 或 110 核实", "联系家人"],
    keywords: ["公检法", "警察", "检察院", "法院", "安全账户", "通缉令", "逮捕令", "洗钱", "资金审查", "保密"],
    source: SOURCE
  },
  {
    id: "af_investment",
    title: "虚假投资理财 / 杀猪盘",
    summary: "通过社交软件认识后带你投资，App 里显示盈利，但提现前要求充值、交保证金或解冻费。",
    actions: ["停止转账", "不要继续充值", "保留聊天和转账记录", "联系家人", "拨打 96110"],
    keywords: ["投资", "稳赚不赔", "内幕消息", "导师", "提现", "充值", "保证金", "解冻", "高回报"],
    source: SOURCE
  },
  {
    id: "af_health",
    title: "保健品 / 虚假医疗产品",
    summary: "宣称“神药、特效药、包治百病”，通过免费体检、讲座、送礼品吸引老人高价购买。",
    actions: ["不要购买", "查看药品批准文号", "通过正规医院/药师核实", "告诉家人"],
    keywords: ["神药", "特效药", "包治", "根治", "抗癌", "降三高", "保健品", "免费体检", "讲座"],
    source: SOURCE
  },
  {
    id: "af_parttime",
    title: "刷单返利 / 兼职",
    summary: "先给小额返利建立信任，再让你垫付大额资金做“连单”，最后以任务失败为由不退款。",
    actions: ["停止垫付", "不要继续做任务", "保存证据", "报警"],
    keywords: ["刷单", "返利", "兼职", "垫付", "连单", "任务", "佣金"],
    source: SOURCE
  },
  {
    id: "af_service",
    title: "冒充客服退款",
    summary: "自称电商/快递客服，说订单异常、商品有问题要退款，引导你点链接、下载 App 或共享屏幕。",
    actions: ["通过官方 App 核实", "不要点陌生链接", "不要共享屏幕", "不要提供验证码"],
    keywords: ["客服", "退款", "理赔", "订单异常", "快递", "下载App", "共享屏幕"],
    source: SOURCE
  },
  {
    id: "af_loan",
    title: "虚假贷款 / 征信修复",
    summary: "声称无抵押、低利息、可修复征信，但放款前要求交手续费、保证金或验证还款能力。",
    actions: ["不要先交钱", "通过银行官方渠道办理", "不要提供银行卡密码"],
    keywords: ["贷款", "额度", "征信", "无抵押", "手续费", "保证金", "修复征信"],
    source: SOURCE
  },
  {
    id: "af_prize",
    title: "中奖 / 补贴 / 退税",
    summary: "通知你中奖、领补贴或退税，要求先交税、填银行卡或点链接领取。",
    actions: ["不要点链接", "不要填银行卡", "通过官方渠道核实", "联系家人"],
    keywords: ["中奖", "补贴", "退税", "领取", "奖金", "补助", "银行卡"],
    source: SOURCE
  },
  {
    id: "af_romance",
    title: "黄昏恋 / 网络交友诈骗",
    summary: "通过网络交友建立感情，随后以投资、治病、路费、家人出事等理由借钱。",
    actions: ["不要转账", "不要透露住址和存款", "让家人帮忙判断", "保留聊天记录"],
    keywords: ["相亲", "恋爱", "对象", "奔现", "借钱", "路费", "治病", "感情"],
    source: SOURCE
  },
  {
    id: "af_ai_face",
    title: "AI 换脸 / 拟声冒充亲友",
    summary: "用 AI 合成亲友的面孔或声音，视频/电话里说急事要钱，催促你马上转账。",
    actions: ["挂断后用自己保存的号码回拨", "问一个只有家人才知道的问题", "不要因视频/声音就转账"],
    keywords: ["换脸", "拟声", "AI", "视频", "孙子", "儿子", "女儿", "急事", "转账"],
    source: SOURCE
  },
  {
    id: "af_screen",
    title: "共享屏幕 / 远程控制",
    summary: "对方以“帮你操作”“核实信息”为由，让你共享屏幕或安装远程控制软件，趁机偷看验证码和银行信息。",
    actions: ["立即停止共享", "卸载远程软件", "修改银行密码", "报警"],
    keywords: ["共享屏幕", "远程控制", "远程协助", "投屏", "安装软件", "验证码"],
    source: SOURCE
  },
  {
    id: "af_code",
    title: "验证码 / 银行卡信息",
    summary: "任何人以任何理由索要短信验证码、银行卡密码、身份证照片，都可能是诈骗。",
    actions: ["绝不提供验证码", "不拍照发送身份证/银行卡", "联系银行官方客服"],
    keywords: ["验证码", "短信码", "动态码", "银行卡", "密码", "身份证", "人脸识别"],
    source: SOURCE
  },
  {
    id: "af_subsidy",
    title: "养老项目 / 以房养老",
    summary: "以“养老公寓、以房养老、高额返利”为名，让老人抵押房产或投入养老钱。",
    actions: ["不要签任何文件", "不要抵押房产", "让子女/律师一起看合同", "向民政/市场监管部门核实"],
    keywords: ["养老项目", "以房养老", "养老公寓", "返利", "抵押", "合同", "养老钱"],
    source: SOURCE
  }
];

function tokenize(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const out = new Set<string>();
  for (const part of normalized.split(/\s+/)) {
    if (!part) continue;
    if (/^[a-z0-9]+$/.test(part)) {
      out.add(part);
      continue;
    }
    if (part.length === 1) out.add(part);
    for (let i = 0; i < part.length - 1; i += 1) out.add(part.slice(i, i + 2));
  }
  return out;
}

function overlapScore(entryTokens: Set<string>, queryTokens: Set<string>): number {
  if (!entryTokens.size || !queryTokens.size) return 0;
  let hit = 0;
  for (const token of queryTokens) {
    if (entryTokens.has(token)) hit += 1;
  }
  return hit / Math.sqrt(entryTokens.size * queryTokens.size);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function createAntiFraudService(modelRouter: ModelRouter, vectorStore?: VectorStore) {
  let vectors: Map<string, number[]> | null = null;
  let vectorIndexing: Promise<boolean> | null = null;

  async function ensureVectors(): Promise<Map<string, number[]> | null> {
    if (vectors) return vectors;
    try {
      const embedded = await modelRouter.embed(
        KB.map((entry) => `${entry.title} ${entry.summary} ${entry.keywords.join(" ")}`)
      );
      vectors = new Map(KB.map((entry, index) => [entry.id, embedded[index] ?? []]));
      return vectors;
    } catch {
      return null;
    }
  }

  async function semanticScores(query: string): Promise<Map<string, number> | null> {
    if (!vectorStore?.enabled) return null;
    try {
      if (!vectorIndexing) {
        vectorIndexing = vectorStore.indexDocs(
          "anti_fraud_kb",
          KB.map((entry) => ({
            ownerId: entry.id,
            content: `${entry.title} ${entry.summary} ${entry.keywords.join(" ")}`,
            metadata: { title: entry.title, source: entry.source }
          }))
        );
      }
      const ready = await vectorIndexing;
      if (!ready) {
        vectorIndexing = null;
        return null;
      }
      const hits = await vectorStore.search("anti_fraud_kb", query, KB.length);
      if (!hits) return null;
      return new Map(hits.map((hit) => [hit.ownerId, hit.score]));
    } catch {
      vectorIndexing = null;
      return null;
    }
  }

  async function search(query: string, topK = 3): Promise<AntiFraudHit[]> {
    const queryTokens = tokenize(query);
    const entryTokens = new Map(KB.map((entry) => [entry.id, tokenize(`${entry.title} ${entry.summary} ${entry.keywords.join(" ")}`)]));
    const pgScores = await semanticScores(query);

    let queryVector: number[] | null = null;
    let entryVectors: Map<string, number[]> | null = null;
    if (!pgScores) {
      entryVectors = await ensureVectors();
      if (entryVectors) {
        try {
          const [vector] = await modelRouter.embed([query]);
          queryVector = vector ?? null;
        } catch {
          queryVector = null;
        }
      }
    }

    const scored = KB.map((entry) => {
      const keyword = overlapScore(entryTokens.get(entry.id) ?? new Set(), queryTokens);
      const semantic = pgScores
        ? pgScores.get(entry.id) ?? 0
        : queryVector && entryVectors
          ? cosine(queryVector, entryVectors.get(entry.id) ?? [])
          : 0;
      return {
        entry,
        score: keyword * 0.65 + Math.max(0, semantic) * 0.35
      };
    });

    return scored
      .filter((item) => item.score > 0.02)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ entry, score }) => ({
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        actions: entry.actions,
        source: entry.source,
        score: Number(score.toFixed(3))
      }));
  }

  return { search, entries: () => KB };
}

export type AntiFraudService = ReturnType<typeof createAntiFraudService>;
