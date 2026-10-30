import { z } from "zod";
import type { AppDb, DbRoleplaySession, RoleplayMessage } from "../../store/db.js";
import type { ModelRouter } from "../llm/types.js";

export type RoleplayScenario = {
  id: string;
  title: string;
  subtitle: string;
  opener: string;
  turns: string[];
  tactics: string[];
  redFlags: string[];
  tips: string[];
};

export const ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    id: "fake_police",
    title: "冒充公检法",
    subtitle: "对方说你涉嫌洗钱，要求转账到安全账户",
    opener:
      "我是市局刑侦队的王警官。你的身份证被人拿去开了洗钱账户，现在需要你配合调查。先不要告诉家里人，避免走漏消息。",
    turns: [
      "现在给你一个安全账户，你把卡里的钱转过去做资金审查，审查完会退给你。",
      "你如果不配合，我们下午就上门带走你。",
      "加我微信，把收到的验证码发给我，我帮你处理。",
      "记住，这件事不能告诉任何人，包括子女。"
    ],
    tactics: ["身份施压", "威胁恐吓", "索要验证码", "信息隔离"],
    redFlags: ["自称公检法要求转账", "安全账户", "要求保密", "索要验证码"],
    tips: ["直接挂断", "拨打 110 或 96110 核实", "告诉家人", "不要提供验证码或共享屏幕"]
  },
  {
    id: "fake_investment",
    title: "虚假投资",
    subtitle: "内部导师带你投资，提现前要先充值",
    opener:
      "我是内部投资导师，最近有一个稳赚不赔的项目，只带少数人。你跟着操作，收益会很快到账。",
    turns: [
      "先投 5000 试试，App 里会显示收益。",
      "提现前要充值 5 万保证金，这是平台规定。",
      "今晚是最后名额，错过就没了。",
      "不要告诉家人，他们不懂，还会拦着你赚钱。"
    ],
    tactics: ["收益诱导", "沉没成本", "限时催促", "信息隔离"],
    redFlags: ["稳赚不赔", "内幕消息", "提现前充值", "限时催促", "要求保密"],
    tips: ["停止转账", "不要继续充值", "保留聊天和转账记录", "联系家人并拨打 96110"]
  },
  {
    id: "fake_health",
    title: "保健品推销",
    subtitle: "免费义诊，号称能根治高血压",
    opener:
      "我们是社区义诊专家，这款药能根治高血压，今天免费体验。很多长辈用了都停掉了医院的药。",
    turns: [
      "先买三个疗程，效果不好可以再来找我。",
      "今天买二送一，明天就恢复原价。",
      "不用告诉医生，这是秘方，医生不懂。",
      "你子女要是拦着，就是不孝顺、不关心你。"
    ],
    tactics: ["夸大疗效", "限时促销", "信息隔离", "道德绑架"],
    redFlags: ["包治/根治", "让停正规药", "限时促销", "要求保密", "道德绑架"],
    tips: ["不要购买", "不要停医生开的药", "查看药品批准文号", "让家人或药师一起核实"]
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const RoleplayTurnSchema = z.object({
  reply: z.string().min(1).max(240),
  tactic: z.string().min(1).max(20),
  intensity: z.number().min(1).max(3)
});

const ROLEPLAY_SYSTEM_PROMPT = `你在「银龄守护」的反诈演练中扮演诈骗分子，目的是让长辈练习识别、拒绝和求助。
规则：
1. 只输出 JSON：{"reply":"1-2 句口语化话术","tactic":"本轮手法，4-8 个中文字","intensity":1到3}。
2. 这是虚构演练。不得出现真实网站、真实电话、真实账号、真实收款方式，不得给出可执行的转账步骤。
3. 不得威胁现实人身安全、辱骂、歧视，不得诱导具体停药或提供具体药名。
4. 根据长辈的回应调整话术：对方警惕就换身份/换理由，对方犹豫就催促，对方求助就尝试隔离信息，但最多施压一次。
5. 不要跳出角色，不要解释这是演练，不要输出任何 JSON 以外的内容。`;

function excerpt(messages: RoleplayMessage[], pattern: RegExp, fallback: string): string {
  const found = messages
    .filter((message) => message.role === "elder" && pattern.test(message.text))
    .at(-1);
  return found ? found.text.slice(0, 100) : fallback;
}

function sanitizeReply(reply: string): string | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;
  if (/https?:\/\//i.test(trimmed) || /www\./i.test(trimmed) || /\b1[3-9]\d{9}\b/.test(trimmed)) {
    return null;
  }
  return trimmed.slice(0, 240);
}

function buildReport(session: DbRoleplaySession, scenario: RoleplayScenario) {
  const elderText = session.messages
    .filter((message) => message.role === "elder")
    .map((message) => message.text)
    .join(" ");
  const resist = /不转|不汇|挂断|报警|110|96110|告诉家人|联系家人|核实|不点|不买|不吃|不去|骗子|不信/.test(
    elderText
  );
  const ask = /你是谁|为什么|凭什么|核实|真的吗|家人|警察|银行|社区/.test(elderText);
  const help = /家人|110|96110|报警|社区|民警/.test(elderText);
  const risk = /转账|汇款|安全账户|验证码|点链接|保密|充值|保证金|马上|停掉.*药/.test(
    elderText
  );
  const explicitScam = /骗子|诈骗|假的/.test(elderText);
  const elderTurns = session.messages.filter((message) => message.role === "elder").length;

  const dimensions = [
    {
      name: "识别",
      score: explicitScam ? 92 : resist ? 82 : risk ? 45 : 60,
      comment: explicitScam ? "明确说出了“骗子/诈骗”" : resist ? "有警惕，但可以更具体" : "还需要多留意红旗话术",
      evidence: excerpt(
        session.messages,
        /骗子|诈骗|假的|不对劲|可疑/,
        resist ? "有拒绝动作，但没有直接点破" : "本轮没有留下明确判断"
      )
    },
    {
      name: "拒绝",
      score: resist ? 88 : 50,
      comment: resist ? "没有顺着对方的要求做" : "容易在压力下松口",
      evidence: excerpt(session.messages, /不转|不汇|挂断|不点|不买|不吃|不去|不给/, "本轮没有明确拒绝")
    },
    {
      name: "求证",
      score: ask ? 82 : 55,
      comment: ask ? "会追问对方身份和理由" : "可以先问“你是谁、为什么”",
      evidence: excerpt(
        session.messages,
        /你是谁|为什么|凭什么|核实|真的吗|银行|警察|社区/,
        "本轮没有追问对方身份"
      )
    },
    {
      name: "求助",
      score: help ? 90 : 50,
      comment: help ? "知道找家人或 110/96110" : "记住：拿不准就找家人或 96110",
      evidence: excerpt(
        session.messages,
        /家人|女儿|儿子|110|96110|报警|社区|民警/,
        "本轮没有提到家人或报警"
      )
    },
    {
      name: "情绪",
      score: risk ? 60 : 78,
      comment: risk ? "对方催促时容易紧张" : "情绪比较稳",
      evidence: excerpt(
        session.messages,
        /转账|汇款|安全账户|验证码|点链接|保密|充值|保证金|马上/,
        "没有出现明显的紧张或松口"
      )
    },
    {
      name: "复盘",
      score: clamp(60 + elderTurns * 5 - (risk ? 10 : 0), 50, 95),
      comment: elderTurns >= 3 ? "完整经历了多轮对话" : "可以多练一轮",
      evidence: session.messages.filter((message) => message.role === "elder").at(-1)?.text.slice(0, 100) ?? "尚未作答"
    }
  ];
  const total = Math.round(
    dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length
  );

  const tacticCount = new Map<string, number>();
  for (const message of session.messages) {
    if (message.role !== "scammer" || !message.tactic) continue;
    tacticCount.set(message.tactic, (tacticCount.get(message.tactic) ?? 0) + 1);
  }
  const tacticSummary = Array.from(tacticCount.entries())
    .map(([tactic, count]) => `${tactic}×${count}`)
    .join("、");

  const stepByDimension: Record<string, string> = {
    识别: "对方提到转账、验证码或“安全账户”时，先在心里标记为红旗。",
    拒绝: "练一句固定回复：“我不转账，我先挂断。”",
    求证: "先问“你是谁、哪个单位”，再用官方电话回拨核实。",
    求助: "把家人电话放在手边，拿不准就先打给家人或 96110。",
    情绪: "对方越催，越要停下来，深呼吸后再决定。",
    复盘: "演练后和家人复述对方用了哪些手法。"
  };
  const nextSteps = [...dimensions]
    .sort((a, b) => a.score - b.score)
    .map((dimension) => stepByDimension[dimension.name])
    .filter((step): step is string => Boolean(step))
    .slice(0, 2);
  if (elderTurns < 3) nextSteps.push("可以再练一次，多经历几轮追问。");
  else nextSteps.push("把 96110 和家人的号码设成快捷拨号。");

  return {
    scenario: { id: scenario.id, title: scenario.title },
    total,
    level: total >= 80 ? "识别得不错" : total >= 60 ? "有基本警惕" : "还需要练习",
    summary:
      total >= 80
        ? "你能把对方从“身份”拉回到“核实和求助”，这是最有效的防线。"
        : total >= 60
          ? "你已经有一些警惕，但在被催促时还可以更坚定地挂断和求助。"
          : "这次容易被对方带着走，记住：先挂断，再找家人或拨打 96110。",
    dimensions,
    tacticSummary: tacticSummary || "身份施压",
    redFlags: scenario.redFlags,
    advice: scenario.tips,
    nextSteps: nextSteps.slice(0, 3),
    transcript: session.messages,
    disclaimer: "这是模拟演练，所有人物、账号、链接均为虚构，不构成真实反诈结论。"
  };
}

export function createRoleplayService(db: AppDb, modelRouter: ModelRouter) {
  function scenarios() {
    return ROLEPLAY_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      subtitle: scenario.subtitle,
      opener: scenario.opener,
      maxTurns: 5
    }));
  }

  function scenarioById(id: string): RoleplayScenario {
    const scenario = ROLEPLAY_SCENARIOS.find((item) => item.id === id);
    if (!scenario) throw new Error("not_found");
    return scenario;
  }

  async function start(elderId: string, scenarioId: string) {
    const scenario = scenarioById(scenarioId);
    const session = await db.roleplaySessions.create({
      elderId,
      scenarioId,
      maxTurns: 5,
      opener: scenario.opener
    });
    return {
      sessionId: session.id,
      scenario: {
        id: scenario.id,
        title: scenario.title,
        subtitle: scenario.subtitle,
        maxTurns: session.maxTurns
      },
      message: scenario.opener,
      turn: 1,
      maxTurns: session.maxTurns
    };
  }

  async function nextScammerReply(
    session: DbRoleplaySession,
    scenario: RoleplayScenario,
    messages: RoleplayMessage[]
  ): Promise<{ reply: string; tactic: string }> {
    const fallbackReply = scenario.turns[session.turn - 1] ?? "（对方沉默了一会儿）";
    const fallbackTactic = scenario.tactics[session.turn - 1] ?? "施压";
    try {
      const result = await modelRouter.chatJSON({
        task: "roleplay_turn",
        schema: RoleplayTurnSchema,
        temperature: 0.5,
        maxTokens: 300,
        timeoutMs: 8_000,
        messages: [
          { role: "system", content: ROLEPLAY_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              scenarioId: scenario.id,
              scenarioTitle: scenario.title,
              scenarioHint: scenario.subtitle,
              turn: session.turn,
              maxTurns: session.maxTurns,
              tactics: scenario.tactics,
              transcript: messages.slice(-8)
            })
          }
        ]
      });
      const reply = sanitizeReply(result.reply);
      if (!reply) return { reply: fallbackReply, tactic: fallbackTactic };
      return { reply, tactic: result.tactic.trim().slice(0, 20) || fallbackTactic };
    } catch {
      return { reply: fallbackReply, tactic: fallbackTactic };
    }
  }

  async function turn(id: string, elderId: string, text: string) {
    const session = await db.roleplaySessions.get(id);
    if (!session || session.elderId !== elderId) throw new Error("not_found");
    if (session.status !== "active") throw new Error("roleplay_closed");
    const scenario = scenarioById(session.scenarioId);

    const messages: RoleplayMessage[] = [
      ...session.messages,
      { role: "elder", text, ts: Date.now() }
    ];
    const nextTurn = session.turn + 1;

    if (nextTurn > session.maxTurns) {
      const completed = await db.roleplaySessions.update(id, {
        turn: session.turn,
        messages,
        status: "completed"
      });
      const report = buildReport(completed ?? session, scenario);
      await db.roleplaySessions.update(id, { report });
      return {
        done: true,
        reply: "（演练结束）对方不再回复。下面是复盘。",
        report
      };
    }

    const next = await nextScammerReply(session, scenario, messages);
    messages.push({ role: "scammer", text: next.reply, tactic: next.tactic, ts: Date.now() });
    await db.roleplaySessions.update(id, { turn: nextTurn, messages });
    return {
      done: false,
      reply: next.reply,
      tactic: next.tactic,
      turn: nextTurn,
      maxTurns: session.maxTurns
    };
  }

  async function end(id: string, elderId: string) {
    const session = await db.roleplaySessions.get(id);
    if (!session || session.elderId !== elderId) throw new Error("not_found");
    const scenario = scenarioById(session.scenarioId);
    const report = buildReport(session, scenario);
    await db.roleplaySessions.update(id, { status: "completed", report });
    return { report };
  }

  return { scenarios, start, turn, end };
}

export type RoleplayService = ReturnType<typeof createRoleplayService>;
