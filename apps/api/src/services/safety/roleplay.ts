import type { AppDb, DbRoleplaySession, RoleplayMessage } from "../../store/db.js";

export type RoleplayScenario = {
  id: string;
  title: string;
  subtitle: string;
  opener: string;
  turns: string[];
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
    redFlags: ["稳赚不赔", "内幕消息", "提现前充值", "限时催促", "要求保密"],
    tips: ["停止转账", "不要继续充值", "保留聊天和转账记录", "联系家人并拨打 96110"]
  },
  {
    id: "fake_health",
    title: "保健品推销",
    subtitle: "免费义诊，号称能根治高血压",
    opener:
      "我们是社区义诊专家，这款药能根治高血压，今天免费体验。很多老人用了都停掉了医院的药。",
    turns: [
      "先买三个疗程，效果不好可以再来找我。",
      "今天买二送一，明天就恢复原价。",
      "不用告诉医生，这是秘方，医生不懂。",
      "你子女要是拦着，就是不孝顺、不关心你。"
    ],
    redFlags: ["包治/根治", "让停正规药", "限时促销", "要求保密", "道德绑架"],
    tips: ["不要购买", "不要停医生开的药", "查看药品批准文号", "让家人或药师一起核实"]
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
      comment: explicitScam ? "明确说出了“骗子/诈骗”" : resist ? "有警惕，但可以更具体" : "还需要多留意红旗话术"
    },
    {
      name: "拒绝",
      score: resist ? 88 : 50,
      comment: resist ? "没有顺着对方的要求做" : "容易在压力下松口"
    },
    {
      name: "求证",
      score: ask ? 82 : 55,
      comment: ask ? "会追问对方身份和理由" : "可以先问“你是谁、为什么”"
    },
    {
      name: "求助",
      score: help ? 90 : 50,
      comment: help ? "知道找家人或 110/96110" : "记住：拿不准就找家人或 96110"
    },
    {
      name: "情绪",
      score: risk ? 60 : 78,
      comment: risk ? "对方催促时容易紧张" : "情绪比较稳"
    },
    {
      name: "复盘",
      score: clamp(60 + elderTurns * 5 - (risk ? 10 : 0), 50, 95),
      comment: elderTurns >= 3 ? "完整经历了多轮对话" : "可以多练一轮"
    }
  ];
  const total = Math.round(
    dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length
  );

  return {
    scenario: { id: scenario.id, title: scenario.title },
    total,
    level: total >= 80 ? "识别得不错" : total >= 60 ? "有基本警惕" : "还需要练习",
    dimensions,
    redFlags: scenario.redFlags,
    advice: scenario.tips,
    transcript: session.messages,
    disclaimer: "这是模拟演练，所有人物、账号、链接均为虚构，不构成真实反诈结论。"
  };
}

export function createRoleplayService(db: AppDb) {
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

  function start(elderId: string, scenarioId: string) {
    const scenario = scenarioById(scenarioId);
    const session = db.roleplaySessions.create({
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

  function turn(id: string, elderId: string, text: string) {
    const session = db.roleplaySessions.get(id);
    if (!session || session.elderId !== elderId) throw new Error("not_found");
    if (session.status !== "active") throw new Error("roleplay_closed");
    const scenario = scenarioById(session.scenarioId);

    const messages: RoleplayMessage[] = [
      ...session.messages,
      { role: "elder", text, ts: Date.now() }
    ];
    const nextTurn = session.turn + 1;

    if (nextTurn > session.maxTurns) {
      const completed = db.roleplaySessions.update(id, {
        turn: session.turn,
        messages,
        status: "completed"
      });
      const report = buildReport(completed ?? session, scenario);
      db.roleplaySessions.update(id, { report });
      return {
        done: true,
        reply: "（演练结束）对方不再回复。下面是复盘。",
        report
      };
    }

    const reply = scenario.turns[session.turn - 1] ?? "（对方沉默了一会儿）";
    messages.push({ role: "scammer", text: reply, ts: Date.now() });
    db.roleplaySessions.update(id, { turn: nextTurn, messages });
    return { done: false, reply, turn: nextTurn, maxTurns: session.maxTurns };
  }

  function end(id: string, elderId: string) {
    const session = db.roleplaySessions.get(id);
    if (!session || session.elderId !== elderId) throw new Error("not_found");
    const scenario = scenarioById(session.scenarioId);
    const report = buildReport(session, scenario);
    db.roleplaySessions.update(id, { status: "completed", report });
    return { report };
  }

  return { scenarios, start, turn, end };
}

export type RoleplayService = ReturnType<typeof createRoleplayService>;
