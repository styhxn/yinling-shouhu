import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { streamAgent } from "../../lib/sse.js";
import { asrErrorZh, startRecognizeZhBuffered, type AsrStatus } from "../voice/asr.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";
import { useToast } from "../state/toast.js";
import type { ChatMessage, PendingConfirmation, ToolEvent } from "../../lib/types.js";

const TOOL_LABELS: Record<string, string> = {
  get_weather: "查询天气",
  get_health_records: "读取健康记录",
  get_medications: "查看用药",
  search_memories: "检索老人口述",
  check_scam: "反诈鉴定",
  start_cooling_off: "启动转账冷静期",
  get_location: "查询位置"
};

const QUICK_PROMPTS = [
  "今天天气怎么样？",
  "我该吃药了吗？",
  "有人让我转账，怎么办？",
  "我今天有点闷，想聊聊天"
];

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowLabel() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

function ToolChip({ tool }: { tool: ToolEvent }) {
  return (
    <div className={`yl-toolChip yl-toolChip--${tool.status}`}>
      <span className="yl-toolIcon">
        {tool.status === "running" ? (
          <Icon name="spinner" size="sm" className="yl-spin" />
        ) : tool.status === "done" ? (
          <Icon name="check" size="sm" />
        ) : (
          <Icon name="close" size="sm" />
        )}
      </span>
      <span className="yl-toolName">{toolLabel(tool.name)}</span>
      <span className="yl-toolSummary">
        {tool.status === "running"
          ? "正在处理…"
          : tool.summary ?? (tool.ok ? "已完成" : "未完成")}
      </span>
      {typeof tool.latencyMs === "number" && tool.status !== "running" ? (
        <span className="yl-toolLatency">{tool.latencyMs}ms</span>
      ) : null}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`yl-chatMsg ${isUser ? "yl-chatMsg--user" : "yl-chatMsg--bot"}`}>
      <div className="yl-chatAvatar">
        <Icon name={isUser ? "user" : "bot"} size="sm" />
      </div>
      <div className="yl-chatBody">
        {message.toolEvents.length > 0 && (
          <div className="yl-toolList">
            {message.toolEvents.map((tool) => (
              <ToolChip key={`${tool.id}_${tool.name}`} tool={tool} />
            ))}
          </div>
        )}
        {message.content ? (
          <div className={`yl-bubble ${message.error ? "yl-bubble--error" : ""}`}>{message.content}</div>
        ) : message.toolEvents.length === 0 ? (
          <div className="yl-bubble yl-bubble--typing">
            <span className="yl-dot" />
            <span className="yl-dot" />
            <span className="yl-dot" />
          </div>
        ) : null}
        {message.riskLevel === "high" && (
          <div className="yl-riskInline">
            <Icon name="alertTriangle" size="sm" />
            <span>这条信息风险很高，先不要转账。</span>
            <a href="tel:96110" className="yl-linkBtn">拨打 96110</a>
          </div>
        )}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="yl-citations">
            <span className="yl-citationsLabel">依据</span>
            {message.citations.map((citation, index) =>
              citation.type === "memory" ? (
                <Link
                  key={`${citation.id ?? citation.title}_${index}`}
                  to="/elder/story"
                  className="yl-citationChip"
                >
                  <Icon name="bookOpen" size="sm" />
                  {citation.title}
                </Link>
              ) : citation.url ? (
                <a
                  key={`${citation.url}_${index}`}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="yl-citationChip"
                >
                  <Icon name="link" size="sm" />
                  {citation.title}
                </a>
              ) : (
                <span key={`${citation.title}_${index}`} className="yl-citationChip">
                  {citation.title}
                </span>
              )
            )}
          </div>
        )}
        <div className="yl-chatMeta">
          <span>{message.time}</span>
          {!isUser && message.content && (
            <button
              type="button"
              className="yl-iconBtn"
              aria-label="朗读"
              onClick={() => {
                stopSpeaking();
                speakNow(message.content);
              }}
            >
              <Icon name="volume" size="sm" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmationDialog({
  pending,
  onDecision,
  onExpired
}: {
  pending: PendingConfirmation;
  onDecision: (decision: "approve" | "cancel") => void;
  onExpired: () => void;
}) {
  const [remaining, setRemaining] = React.useState(() => Math.max(0, pending.expiresAt - Date.now()));
  const expiredRef = React.useRef(false);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const left = Math.max(0, pending.expiresAt - Date.now());
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpired();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [pending.expiresAt, onExpired]);

  const expired = remaining <= 0;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="yl-modalOverlay" role="dialog" aria-modal="true" aria-label="需要确认">
      <div className="yl-modal">
        <div className="yl-modalIcon">
          <Icon name="alertTriangle" size="lg" />
        </div>
        <h2>需要您确认</h2>
        <p>{pending.summary}</p>
        <div className="yl-modalCountdown">
          {expired ? "确认已过期，请重新发起" : `${seconds} 秒内确认`}
        </div>
        <div className="yl-modalActions">
          <button type="button" className="btn" onClick={() => onDecision("cancel")}>取消</button>
          <button
            type="button"
            className="btn btnDanger"
            disabled={expired}
            onClick={() => onDecision("approve")}
          >
            同意继续
          </button>
        </div>
        <p className="yl-modalHint">本系统不会执行真实转账，只会暂停并通知家属。</p>
      </div>
    </div>
  );
}

export function AgentChatPage() {
  const toast = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "streaming" | "waiting" | "error">("idle");
  const [pending, setPending] = React.useState<PendingConfirmation | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [asrStatus, setAsrStatus] = React.useState<AsrStatus | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const stopAsrRef = React.useRef<null | (() => void)>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sessionRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function updateLastAssistant(updater: (message: ChatMessage) => ChatMessage) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i]?.role === "assistant") {
          next[i] = updater(next[i]!);
          break;
        }
      }
      return next;
    });
  }

  function handleEvent(event: string, data: any) {
    switch (event) {
      case "meta":
        setSessionId(data.sessionId);
        break;
      case "token":
        updateLastAssistant((message) => ({ ...message, content: message.content + (data.text ?? "") }));
        break;
      case "tool_call": {
        const tool: ToolEvent = {
          id: data.id,
          name: data.name,
          args: data.args,
          risk: data.risk,
          status: "running"
        };
        updateLastAssistant((message) => ({ ...message, toolEvents: [...message.toolEvents, tool] }));
        break;
      }
      case "tool_result":
        setMessages((prev) =>
          prev.map((message) => ({
            ...message,
            toolEvents: message.toolEvents.map((tool) =>
              tool.id === data.id
                ? {
                    ...tool,
                    status: data.ok ? "done" : "error",
                    ok: Boolean(data.ok),
                    summary: data.summary,
                    latencyMs: data.latencyMs
                  }
                : tool
            )
          }))
        );
        break;
      case "confirmation_required":
        setPending({
          id: data.id,
          tool: data.tool,
          summary: data.summary,
          risk: "high",
          expiresAt: data.expiresAt
        });
        setStatus("waiting");
        break;
      case "done":
        setSessionId(data.sessionId ?? sessionRef.current);
        updateLastAssistant((message) => ({
          ...message,
          riskLevel: data.riskLevel,
          citations: Array.isArray(data.citations) ? data.citations : []
        }));
        setStatus("idle");
        break;
      case "error":
        setError(data.message ?? "服务暂时不可用");
        updateLastAssistant((message) => ({
          ...message,
          content: message.content || "抱歉，我刚才没听清。",
          error: true
        }));
        setStatus("error");
        break;
      default:
        break;
    }
  }

  async function run(body: Record<string, unknown>) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStatus("streaming");

    try {
      await streamAgent(body, handleEvent, controller.signal);
      setStatus((prev) => (prev === "waiting" ? "waiting" : "idle"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "连接失败");
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || status === "streaming" || status === "waiting") return;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content: q, toolEvents: [], time: nowLabel() },
      { id: uid(), role: "assistant", content: "", toolEvents: [], time: nowLabel() }
    ]);
    await run({
      message: q,
      ...(sessionRef.current ? { sessionId: sessionRef.current } : {})
    });
  }

  async function decide(decision: "approve" | "cancel") {
    if (!pending || !sessionRef.current) return;
    const current = pending;
    setPending(null);
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "assistant", content: "", toolEvents: [], time: nowLabel() }
    ]);
    await run({
      sessionId: sessionRef.current,
      confirmationId: current.id,
      confirmationDecision: decision,
      message: ""
    });
  }

  function stop() {
    abortRef.current?.abort();
  }

  function startVoice() {
    if (asrStatus === "starting" || asrStatus === "listening") return;
    try {
      const session = startRecognizeZhBuffered({
        timeoutMs: 30_000,
        silenceMs: 2_000,
        onPartial: setInput,
        onStatus: setAsrStatus
      });
      stopAsrRef.current = session.stop;
      session.result
        .then((text) => {
          setInput(text);
          setAsrStatus(null);
        })
        .catch((err) => {
          setError(asrErrorZh(err));
          setAsrStatus(null);
        })
        .finally(() => {
          stopAsrRef.current = null;
        });
    } catch (err) {
      setError(asrErrorZh(err));
    }
  }

  function stopVoice() {
    stopAsrRef.current?.();
    stopAsrRef.current = null;
    setAsrStatus(null);
  }

  const listening = asrStatus === "starting" || asrStatus === "listening";
  const busy = status === "streaming" || status === "waiting";

  return (
    <div className="yl-chatPage">
      <div className="yl-chatHeader">
        <div>
          <h1>小助手</h1>
          <p>有事可以问我，不用打字，按着说话就行。</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            stop();
            stopSpeaking();
            setMessages([]);
            setSessionId(null);
            setError(null);
            setStatus("idle");
          }}
        >
          清空
        </button>
      </div>

      <div className="yl-chatList" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="yl-chatEmpty">
            <div className="yl-chatEmptyIcon">
              <Icon name="bot" size="xl" />
            </div>
            <strong>我在呢，您慢慢说</strong>
            <p>您可以直接说话，也可以点下面的问题试试。</p>
            <div className="yl-quickGrid">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="yl-quickPrompt" onClick={() => void send(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {error ? (
        <div className="yl-errorBar">
          <Icon name="alertCircle" size="sm" />
          <span>{error}</span>
          <button type="button" className="yl-linkBtn" onClick={() => setError(null)}>知道了</button>
        </div>
      ) : null}

      <div className="yl-composer">
        <button
          type="button"
          className={`btn ${listening ? "btnDanger" : ""}`}
          onClick={listening ? stopVoice : startVoice}
          disabled={status === "streaming" || status === "waiting"}
        >
          <Icon name="mic" size="sm" />
          {listening ? "结束语音" : "语音输入"}
        </button>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "我在听，请说……" : "您可以直接说话或打字"}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={status === "streaming" || status === "waiting"}
        />
        {status === "streaming" ? (
          <button type="button" className="btn btnDanger" onClick={stop}>
            <Icon name="stop" size="sm" />
            停止
          </button>
        ) : (
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => void send(input)}
            disabled={!input.trim() || busy}
          >
            <Icon name="send" size="sm" />
            发送
          </button>
        )}
      </div>

      {pending ? (
        <ConfirmationDialog
          pending={pending}
          onDecision={(decision) => void decide(decision)}
          onExpired={() => {
            setPending(null);
            setStatus("idle");
            toast.push({
              kind: "normal",
              title: "确认已过期",
              detail: "如果还需要处理，请重新发起一次。"
            });
          }}
        />
      ) : null}
    </div>
  );
}
