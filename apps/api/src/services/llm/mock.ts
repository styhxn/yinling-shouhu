import type {
  ChatJSONRequest,
  ChatMessage,
  ChatStreamEvent,
  ChatStreamRequest,
  ModelRouter,
  ToolCall,
  VisionJSONRequest
} from "./types.js";
import { analyzeScam } from "../safety/scam.js";
import { ROLEPLAY_SCENARIOS } from "../safety/roleplay.js";

function chunks(text: string, size = 8): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "user") return msg.content;
  }
  return "";
}

function lastUserJson(messages: ChatMessage[]): Record<string, unknown> {
  try {
    const parsed = JSON.parse(lastUserText(messages));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function pickTool(text: string): ToolCall | null {
  if (/转账|汇款|安全账户|验证码|共享屏幕|银行卡/.test(text)) {
    return {
      id: "call_cooling",
      name: "start_cooling_off",
      args: { reason: text.slice(0, 200) }
    };
  }
  if (/天气|出门|菜场|下雨|穿衣|散步/.test(text)) {
    return { id: "call_weather", name: "get_weather", args: { location: "南京" } };
  }
  if (/吃药|用药|药盒|服药/.test(text)) {
    return { id: "call_meds", name: "get_medications", args: {} };
  }
  if (/忌口|冲突|漏服|一起吃|同吃|能不能和药/.test(text)) {
    return { id: "call_med_safety", name: "get_medication_safety", args: {} };
  }
  if (/能吃|可以吃|能不能吃|红烧肉|咸菜|葡萄柚|甜饮料|喝酒/.test(text)) {
    return {
      id: "call_food",
      name: "check_food",
      args: { food: text.replace(/[?？。！!]/g, "").slice(0, 40) }
    };
  }
  if (/吃什么|吃饭|菜谱|饮食|早饭|午饭|晚饭|血糖/.test(text)) {
    return { id: "call_diet", name: "get_diet_plan", args: {} };
  }
  if (/小时候|记得|故事|回忆|童年|家乡|工作|老伴|以前/.test(text)) {
    return { id: "call_memories", name: "search_memories", args: { query: text.slice(0, 80) } };
  }
  if (/骗子|诈骗|短信|截图|链接|客服/.test(text)) {
    return {
      id: "call_scam",
      name: "check_scam",
      args: { inputType: "text", text: text.slice(0, 2000) }
    };
  }
  if (/找不到家|迷路|回家|走丢|不认得路/.test(text)) {
    return { id: "call_home", name: "help_me_get_home", args: {} };
  }
  if (/位置|没回来|找不到|在哪|走丢/.test(text)) {
    return { id: "call_location", name: "get_location", args: {} };
  }
  return null;
}

function summarizeTool(content: string): string {
  if (/南京|℃|天气|雨/.test(content)) {
    return "今天南京 18℃，有小雨，出门记得带伞，路滑慢一点。";
  }
  if (/风险|诈骗|转账|安全账户/.test(content)) {
    return "这条信息风险很高，先不要转账，也不要点链接。建议马上联系家人，必要时拨打 96110。";
  }
  if (/找不到家|迷路|回家|通知.*家人|站在安全/.test(content)) {
    return "您先别急，我已经通知家人了。先站在安全、明亮的地方，看看身边的门牌或店铺，给家人打个电话。";
  }
  if (/葡萄柚|忌口|漏服|药物冲突/.test(content)) {
    return "用药方面有一处要留意：吃氨氯地平时别吃葡萄柚，二甲双胍期间别喝酒。漏服了不要吃双倍，先问医生或家人。";
  }
  if (/早餐|午餐|晚餐|少盐|少油|饮食/.test(content)) {
    return "今天的饭菜我帮您安排好了：清淡少盐，主食少量，配点鱼、豆腐和青菜。想吃别的东西，先问我一声。";
  }
  if (/建议先别吃|少量吃|没有查到明确禁忌/.test(content)) {
    return "我帮您看过了。您有高血压和糖尿病，吃之前先看看咸淡和份量；拿不准就少吃一点，或问问家人。";
  }
  if (/药|服用|氨氯地平|二甲双胍/.test(content)) {
    return "我查到您的用药计划了。请按医生说的时间服用，如果不确定，先问家人或药师。";
  }
  if (/位置|坐标|最后|鼓楼/.test(content)) {
    return "我查到长辈最后的位置了。建议先打电话确认，如果联系不上，马上通知家人或使用一键寻人。";
  }
  if (/冷静期|已通知|家人/.test(content)) {
    return "好的，我已经暂停这次操作，并通知了家人。请先不要转账，等家人确认。";
  }
  return `我查到了：${content.slice(0, 180)}`;
}

/**
 * Deterministic provider for tests and local development without API keys.
 * It intentionally only understands the W1 demo intents.
 */
export class MockModelProvider implements ModelRouter {
  readonly mode = "mock" as const;

  async *chatStream(req: ChatStreamRequest): AsyncIterable<ChatStreamEvent> {
    const last = req.messages[req.messages.length - 1];

    if (last?.role === "tool") {
      for (const piece of chunks(summarizeTool(last.content))) {
        yield { type: "token", text: piece };
      }
      yield { type: "done", usage: { promptTokens: 12, completionTokens: 24 } };
      return;
    }

    const tool = req.tools?.length ? pickTool(lastUserText(req.messages)) : null;
    if (tool) {
      yield { type: "tool_call", id: tool.id, name: tool.name, args: tool.args };
      yield { type: "done" };
      return;
    }

    for (const piece of chunks("我在呢，您可以慢慢说。想聊聊天、问天气、吃药，或者觉得有人骗您，都可以告诉我。")) {
      yield { type: "token", text: piece };
    }
    yield { type: "done", usage: { promptTokens: 10, completionTokens: 30 } };
  }

  async chatJSON<T>(req: ChatJSONRequest<T>): Promise<T> {
    if (req.task === "scam_analysis") {
      const input = lastUserJson(req.messages);
      const text = typeof input.text === "string" ? input.text : "";
      const url = typeof input.url === "string" ? input.url : "";
      const inputType = input.inputType === "url" ? "url" : "text";
      const result = analyzeScam({ inputType, text, url });
      const first = result.redFlags[0];
      return req.schema.parse({
        riskLevel: result.riskLevel,
        scamType: result.scamType,
        confidence: result.confidence,
        summary: first
          ? `规则匹配到“${first.quote}”：${first.reason}`
          : "未发现明确诈骗话术，但仍建议通过官方渠道核实。",
        redFlags: result.redFlags,
        actions: result.actions,
        questionsToAsk: result.questionsToAsk
      });
    }

    if (req.task === "interview_followup") {
      const input = lastUserJson(req.messages);
      const transcript = Array.isArray(input.transcript)
        ? (input.transcript as Array<Record<string, unknown>>)
        : [];
      const lastAnswer =
        typeof transcript.at(-1)?.answer === "string"
          ? String(transcript.at(-1)?.answer)
          : "";
      const place = lastAnswer.match(
        /(?:住在|在)([\u4e00-\u9fa5]{2,6}(?:河边|村|镇|街|路|桥))/
      )?.[1];
      const templates = [
        "那时候的屋子是什么样子的？",
        "您还记得当时最开心的一件事吗？",
        "这件事里还有谁在场？",
        "后来还回去看过吗？"
      ];
      return req.schema.parse({
        question: place
          ? `${place}那时候是什么样子？您常和谁一起去？`
          : templates[transcript.length % templates.length],
        focus: place ? "place" : "detail"
      });
    }

    if (req.task === "memory_distill") {
      const input = lastUserJson(req.messages);
      const transcript = Array.isArray(input.transcript)
        ? (input.transcript as Array<Record<string, unknown>>)
        : [];
      const topic = typeof input.topic === "string" ? input.topic : "回忆";
      const answers = transcript
        .map((item) => (typeof item.answer === "string" ? item.answer : ""))
        .filter(Boolean);
      const text = answers.join(" ").replace(/第\s*\d+\s*段回忆[：:，,]?/g, "");
      const place = text.match(
        /(?:住在|在)([\u4e00-\u9fa5]{2,8}(?:河边|村|镇|街|路|桥|厂|学校))/
      )?.[1];
      const people = Array.from(
        new Set(
          text.match(/母亲|父亲|妈妈|爸爸|老伴|女儿|儿子|邻居|同事|老师|朋友|孙子|孙女/g) ??
            []
        )
      );
      const firstAnswer = answers[0];
      const lastAnswer = answers.at(-1);
      return req.schema.parse({
        title: place ? `${place.slice(0, 16)}的回忆` : `${topic}的回忆`,
        summary: (
          firstAnswer && lastAnswer && firstAnswer !== lastAnswer
            ? `${firstAnswer} ${lastAnswer}`
            : firstAnswer ?? lastAnswer ?? `${topic}的一段回忆`
        ).slice(0, 160),
        timeRange: text.match(/小时候|年轻时|上学时|退休前|那几年|那年/)?.[0] ?? null,
        place: place?.slice(0, 30) ?? null,
        people: people.slice(0, 6),
        tags: [topic, ...people.slice(0, 2)]
      });
    }

    if (req.task === "story_chapter") {
      const input = lastUserJson(req.messages);
      const memories = Array.isArray(input.memories)
        ? (input.memories as Array<Record<string, unknown>>)
        : [];
      const answers: string[] = [];
      for (const memory of memories) {
        const transcript = typeof memory.transcript === "string" ? memory.transcript : "";
        for (const line of transcript.split(/\n+/)) {
          if (!line.startsWith("答：")) continue;
          const answer = line.replace(/^答：\s*/, "").trim();
          if (answer) answers.push(answer);
        }
      }
      const firstTitle =
        typeof memories[0]?.title === "string" ? String(memories[0].title) : "一段回忆";
      const summary =
        typeof memories[0]?.summary === "string" ? String(memories[0].summary) : "";
      const body = answers.length
        ? answers
            .map((answer, index) =>
              index === 0 ? `那年，${answer.replace(/[。！？]$/, "")}。` : answer
            )
            .join("\n\n")
        : summary || "这是一段家人记录的回忆。";
      const quote = answers[0]?.slice(0, 24);
      return req.schema.parse({
        title: firstTitle,
        content: `${body}\n\n${quote ? `“${quote}”\n\n` : ""}根据长辈口述整理，家人可修改。`
      });
    }

    if (req.task === "roleplay_turn") {
      const input = lastUserJson(req.messages);
      const scenario = ROLEPLAY_SCENARIOS.find((item) => item.id === input.scenarioId);
      const turn = typeof input.turn === "number" ? Math.max(1, Math.floor(input.turn)) : 1;
      const index = Math.min(turn - 1, (scenario?.turns.length ?? 1) - 1);
      return req.schema.parse({
        reply: scenario?.turns[index] ?? "机会只有这一次，你再考虑一下。",
        tactic: scenario?.tactics[index] ?? "施压",
        intensity: Math.min(3, Math.max(1, turn))
      });
    }

    if (req.task === "memory_profile") {
      const input = lastUserJson(req.messages);
      const memories = Array.isArray(input.memories)
        ? (input.memories as Array<Record<string, unknown>>)
        : [];
      const corpus = memories
        .map((memory) =>
          [
            typeof memory.title === "string" ? memory.title : "",
            typeof memory.summary === "string" ? memory.summary : "",
            typeof memory.transcript === "string" ? memory.transcript : "",
            Array.isArray(memory.people) ? memory.people.join(" ") : "",
            Array.isArray(memory.tags) ? memory.tags.join(" ") : "",
            typeof memory.place === "string" ? memory.place : ""
          ].join("\n")
        )
        .join("\n");
      const people = Array.from(
        new Set(
          memories
            .flatMap((memory) => (Array.isArray(memory.people) ? memory.people : []))
            .filter((item): item is string => typeof item === "string")
            .concat(
              corpus.match(/母亲|父亲|妈妈|爸爸|老伴|女儿|儿子|邻居|同事|老师|朋友|孙子|孙女|师傅/g) ??
                []
            )
        )
      ).slice(0, 8);
      const places = Array.from(
        new Set(
          memories
            .map((memory) => (typeof memory.place === "string" ? memory.place : ""))
            .filter(Boolean)
            .concat(
              Array.from(
                corpus.matchAll(
                  /(?:住在|在)([\u4e00-\u9fa5]{2,10}(?:河边|村|镇|街|路|桥|厂|学校|公园))/g
                )
              ).map((match) => match[1] ?? "")
            )
        )
      )
        .filter(Boolean)
        .slice(0, 8);
      const routines = Array.from(
        corpus.matchAll(/(?:每天|常常|总是|经常)([^。！？\n]{2,24})/g)
      )
        .map((match) => (match[1] ?? "").trim())
        .filter(Boolean)
        .slice(0, 4);
      const preferences = Array.from(
        corpus.matchAll(/(?:喜欢|爱|最爱)([^。！？\n]{2,24})/g)
      )
        .map((match) => (match[1] ?? "").trim())
        .filter(Boolean)
        .slice(0, 4);
      const summaryParts = [
        people.length ? `常提到${people.slice(0, 3).join("、")}` : "",
        places.length ? `对${places.slice(0, 2).join("、")}有清晰记忆` : "",
        routines.length ? `习惯${routines[0]}` : ""
      ].filter(Boolean);
      return req.schema.parse({
        summary: summaryParts.length ? `${summaryParts.join("；")}。` : "还没有足够的记忆形成画像。",
        people: people.map((name) => ({ name })),
        places: places.map((name) => ({ name })),
        routines,
        preferences,
        sensitivities: /去世|走了|不在了|过世/.test(corpus)
          ? ["提到已故亲人时，先共情，不追问细节"]
          : []
      });
    }

    if (req.task === "agent_plan") {
      const input = lastUserJson(req.messages);
      const catalog = Array.isArray(input.allowedTools)
        ? (input.allowedTools as Array<Record<string, unknown>>)
        : [];
      const allowed = catalog
        .map((item) => (typeof item.name === "string" ? item.name : ""))
        .filter(Boolean);
      const kind = input.kind === "brief" || input.kind === "alert" ? input.kind : "custom";
      const preferred =
        kind === "brief"
          ? ["get_memory_profile", "get_medications", "get_weather", "get_location"]
          : kind === "alert"
            ? ["get_location", "get_memory_profile", "get_medications", "get_weather"]
            : ["get_medications", "get_memory_profile", "get_weather", "search_memories"];
      const picked = preferred.filter((tool) => allowed.includes(tool)).slice(0, 4);
      const steps = (picked.length ? picked : allowed.slice(0, 2)).map((tool) => ({
        tool,
        args:
          tool === "get_weather"
            ? { location: "南京" }
            : tool === "search_memories"
              ? { limit: 2 }
              : {},
        reason:
          tool === "get_medications"
            ? "先看今天的用药计划"
            : tool === "get_weather"
              ? "判断天气是否影响出门"
              : tool === "get_location"
                ? "看最后一次位置上报"
                : tool === "get_memory_profile"
                  ? "带上长辈熟悉的人和习惯"
                  : "找与今天相关的口述记忆"
      }));
      return req.schema.parse({
        steps,
        rationale: "按任务类型读取用药、天气、位置和记忆，再给出一条可执行建议。"
      });
    }

    if (req.task === "agent_decision") {
      const input = lastUserJson(req.messages);
      const facts = Array.isArray(input.facts)
        ? (input.facts as unknown[])
            .filter((item): item is string => typeof item === "string")
            .slice(0, 5)
        : [];
      const context =
        input.context && typeof input.context === "object" && !Array.isArray(input.context)
          ? (input.context as Record<string, unknown>)
          : {};
      const kind = input.kind;
      if (kind === "brief") {
        const items = facts.slice(0, 3).map((fact) => {
          if (/记忆画像|常提到|沟通提醒/.test(fact)) {
            return {
              title: "AI 记得您",
              detail: fact.replace(/^记忆画像：/, "").slice(0, 150),
              priority: "later",
              actionLabel: "看看故事",
              href: "/elder/story"
            };
          }
          if (/药|服用|打卡|mg|片|每日|每次/.test(fact)) {
            return {
              title: "按时吃药",
              detail: fact.slice(0, 150),
              priority: "now",
              actionLabel: "去打卡",
              href: "/elder/meds"
            };
          }
          if (/天气|℃|雨|风/.test(fact)) {
            return {
              title: "出门看天气",
              detail: fact.slice(0, 150),
              priority: "today",
              actionLabel: "问小助手",
              href: "/elder/chat"
            };
          }
          if (/位置|围栏|最后/.test(fact)) {
            return {
              title: "位置与安全",
              detail: fact.slice(0, 150),
              priority: "today",
              actionLabel: "查看守护",
              href: "/elder/safety"
            };
          }
          return {
            title: "今天的回忆",
            detail: fact.slice(0, 150),
            priority: "later",
            actionLabel: "看看故事",
            href: "/elder/story"
          };
        });
        return req.schema.parse({
          summary: "今天先把药吃好、把天气看明白，其他的慢慢来。",
          riskLevel: "low",
          confidence: 0.82,
          needsConfirmation: false,
          escalation: "none",
          facts: facts.map((fact) => fact.slice(0, 160)),
          actions: [
            { label: "和小助手说说", kind: "link", href: "/elder/chat" },
            { label: "看看故事", kind: "link", href: "/elder/story" }
          ],
          briefItems: items.length
            ? items
            : [
                {
                  title: "今天先照顾好自己",
                  detail: "还没有足够的数据生成更多提醒，先喝口水、慢慢来。",
                  priority: "today"
                }
              ],
          explanation: "根据用药、天气、位置和记忆记录整理。"
        });
      }

      const alertLevel =
        typeof context.alertLevel === "string" ? context.alertLevel.toLowerCase() : "warn";
      const riskLevel = alertLevel === "critical" ? "high" : alertLevel === "info" ? "low" : "medium";
      const alertType =
        typeof context.alertType === "string" ? context.alertType : "safety_alert";
      const alertLabel =
        alertType === "geofence.exit"
          ? "越界提醒"
          : alertType === "cooling_off"
            ? "转账冷静期"
            : "安全提醒";
      return req.schema.parse({
        summary:
          riskLevel === "high"
            ? `我注意到一条${alertLabel}，先别慌，建议马上电话确认并联系家人。`
            : `我注意到一条${alertLabel}，先确认一下情况，再决定要不要通知家人。`,
        riskLevel,
        confidence: 0.78,
        needsConfirmation: riskLevel === "high",
        escalation: riskLevel === "high" ? "family" : "none",
        facts: facts.map((fact) => fact.slice(0, 160)),
        actions: [
          { label: "查看位置", kind: "link", href: "/elder/safety" },
          { label: "联系家人", kind: "link", href: "/elder/chat" },
          ...(riskLevel === "high"
            ? [{ label: "拨打 110", kind: "call", href: "tel:110" }]
            : [])
        ],
        explanation: `事件类型：${alertLabel}；结合最近位置、用药和天气记录做综合研判。`
      });
    }

    return req.schema.parse({});
  }

  async visionJSON<T>(req: VisionJSONRequest<T>): Promise<T> {
    return req.schema.parse({});
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const out = new Array<number>(8).fill(0);
      for (let i = 0; i < text.length; i += 1) {
        out[i % 8] = (out[i % 8] ?? 0) + text.charCodeAt(i) / 1000;
      }
      return out;
    });
  }
}
