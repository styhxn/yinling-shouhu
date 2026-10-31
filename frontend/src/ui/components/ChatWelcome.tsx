import React from "react";
import { Icon } from "./Icon.js";
import { api } from "../../lib/api.js";
import type { AgentBrief, ElderMessage, FamilySummary, MemoryItem } from "../../lib/types.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";
import { useToast } from "../state/toast.js";

export type ChatWelcomeContext = {
  displayName: string;
  brief?: AgentBrief | null;
  summary?: FamilySummary | null;
  latestMemory?: MemoryItem | null;
  familyMessage?: ElderMessage | null;
};

function greeting(hour = new Date().getHours()) {
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function locationText(summary: FamilySummary | null | undefined) {
  if (!summary?.location) return "暂无位置";
  if (summary.location.source === "demo") return "演示位置";
  if (!summary.location.live) return "最后位置";
  if (summary.alerts.open > 0) return `${summary.alerts.open} 条提醒`;
  return "位置已更新";
}

function locationHint(summary: FamilySummary | null | undefined) {
  if (!summary?.location) return "家人可设置安全区域";
  if (summary.location.address) return summary.location.address;
  return `坐标 ${summary.location.lat.toFixed(4)}, ${summary.location.lng.toFixed(4)}`;
}

export function ChatWelcome({
  context,
  onPrompt,
  onAcknowledgeFamilyMessage
}: {
  context: ChatWelcomeContext;
  onPrompt: (text: string) => void;
  onAcknowledgeFamilyMessage?: (() => void) | undefined;
}) {
  const toast = useToast();
  const { displayName, brief, summary, latestMemory, familyMessage } = context;
  const due = summary?.medications.dueToday ?? 0;
  const taken = summary?.medications.taken ?? 0;
  const remaining = Math.max(0, due - taken);
  const memoryCount = summary?.memoryCount ?? 0;

  React.useEffect(() => () => stopSpeaking(), []);

  const sentence = familyMessage
    ? `${familyMessage.familyName}给您留了句话，我放在下面了。`
    : remaining > 0
      ? `今天还有 ${remaining} 次药没吃，我记着呢。`
      : summary?.alerts.open
        ? `有 ${summary.alerts.open} 条安全提醒，先看看再出门。`
        : latestMemory
          ? `上次您讲到「${latestMemory.title}」，今天想接着聊吗？`
          : "今天想说什么都行，我慢慢听。";

  const prompts = Array.from(
    new Set([
      remaining > 0 ? "我该吃药了吗？" : "今天吃什么合适？",
      "我能吃红烧肉吗？",
      summary?.alerts.open ? "有人让我转账，怎么办？" : "今天天气怎么样？",
      latestMemory ? "我想接着上次的故事聊聊" : "给我讲个笑话吧"
    ])
  );

  async function acknowledgeMessage() {
    try {
      await api.elderMessages.list();
      onAcknowledgeFamilyMessage?.();
      toast.push({ kind: "ok", title: "已读过这条留言" });
    } catch {
      toast.push({ kind: "normal", title: "留言还没读成功", detail: "稍后再点一次就好。" });
    }
  }

  return (
    <div className="yl-chatWelcome">
      <header className="yl-chatWelcomeHead">
        <span className="yl-chatWelcomeSeal" aria-hidden="true">
          陪
        </span>
        <div>
          <p className="yl-chatWelcomeKicker">
            <Icon name="sparkles" size="sm" />
            AI 陪伴小助手
          </p>
          <h2>
            {greeting()}，{displayName}
          </h2>
          <p className="yl-chatWelcomeLead">{sentence}</p>
          {brief?.summary ? <p className="yl-chatWelcomeBrief">今日简报：{brief.summary}</p> : null}
        </div>
      </header>

      <div className="yl-chatContextGrid">
        <button
          type="button"
          className="yl-chatContextTile"
          onClick={() => onPrompt("我该吃药了吗？")}
        >
          <span className="yl-chatContextIcon"><Icon name="pill" size="sm" /></span>
          <span>用药</span>
          <strong>{due === 0 ? "还没有计划" : remaining === 0 ? "今天吃完了" : `还有 ${remaining} 次`}</strong>
          <small>今天已吃 {taken} 次</small>
        </button>
        <button
          type="button"
          className="yl-chatContextTile"
          onClick={() => onPrompt("我现在在哪里？")}
        >
          <span className="yl-chatContextIcon"><Icon name="shieldCheck" size="sm" /></span>
          <span>安全</span>
          <strong>{locationText(summary)}</strong>
          <small>{locationHint(summary)}</small>
        </button>
        <button
          type="button"
          className="yl-chatContextTile"
          onClick={() => onPrompt(latestMemory ? "我想接着上次的故事聊聊" : "给我讲讲以前的故事")}
        >
          <span className="yl-chatContextIcon"><Icon name="bookOpen" size="sm" /></span>
          <span>回忆</span>
          <strong>{latestMemory ? latestMemory.title : "还没有故事"}</strong>
          <small>{memoryCount > 0 ? `一共 ${memoryCount} 段回忆` : "想聊的时候再开始"}</small>
        </button>
      </div>

      {familyMessage ? (
        <div className="yl-chatFamilyMessage">
          <span className="yl-chatFamilyIcon"><Icon name="message" size="sm" /></span>
          <div className="yl-chatFamilyBody">
            <strong>{familyMessage.familyName}给您留言</strong>
            <p>{familyMessage.content}</p>
            <div className="yl-chatFamilyActions">
              <button
                type="button"
                onClick={() => speakNow(`${familyMessage.familyName}说：${familyMessage.content}`)}
              >
                <Icon name="volume" size="sm" />
                念给我听
              </button>
              <button type="button" onClick={() => void acknowledgeMessage()}>
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {latestMemory ? (
        <div className="yl-chatMemory">
          <span className="yl-chatMemoryLabel">上次聊到</span>
          <p>{latestMemory.summary || latestMemory.transcript.slice(0, 100)}</p>
          <button
            type="button"
            className="yl-chatMemoryMore"
            onClick={() => onPrompt("我想接着上次的故事聊聊")}
          >
            接着聊
            <Icon name="arrowRight" size="sm" />
          </button>
        </div>
      ) : null}

      <div className="yl-chatWelcomePrompts">
        <span>您也可以这样问</span>
        <div className="yl-quickGrid">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="yl-quickPrompt"
              onClick={() => onPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
