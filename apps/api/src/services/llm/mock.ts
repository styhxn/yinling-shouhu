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
  if (/药|服用|氨氯地平|二甲双胍/.test(content)) {
    return "我查到您的用药计划了。请按医生说的时间服用，如果不确定，先问家属或药师。";
  }
  if (/位置|坐标|最后|鼓楼/.test(content)) {
    return "我查到老人最后的位置了。建议先打电话确认，如果联系不上，马上通知家属或使用一键寻人。";
  }
  if (/冷静期|已通知|家属/.test(content)) {
    return "好的，我已经暂停这次操作，并通知了家属。请先不要转账，等家人确认。";
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
