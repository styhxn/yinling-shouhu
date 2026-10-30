import React from "react";
import { asrErrorZh, asrStatusZh, AsrError, startRecognizeZhBuffered } from "../voice/asr.js";
import type { AsrSession, AsrStatus } from "../voice/asr.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";
import { Icon } from "./Icon.js";

type AskResult = {
  answer: string;
  provider: string;
  conversationId: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
  time?: string;
};

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowLabel() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function VoiceQaWindow({
  ask,
  placeholder = "请输入问题，回车发送",
  initialHint = "你可以问：炸鸡健康吗？我适合吃海鲜吗？",
  autoSpeakDefault = true
}: {
  ask: (question: string, conversationId?: string) => Promise<AskResult>;
  placeholder?: string;
  initialHint?: string;
  autoSpeakDefault?: boolean;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [provider, setProvider] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [autoSpeak, setAutoSpeak] = React.useState(autoSpeakDefault);
  const [speaking, setSpeaking] = React.useState(false);
  const speakTimerRef = React.useRef<number | null>(null);

  const [asrStatus, setAsrStatus] = React.useState<AsrStatus | null>(null);
  const [asrPartial, setAsrPartial] = React.useState<string>("");
  const asrSessionRef = React.useRef<AsrSession | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  React.useEffect(() => {
    return () => {
      if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
      asrSessionRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  async function sendQuestion(raw: string) {
    const q = raw.trim();
    if (!q) return;
    if (busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setAsrPartial("");
    setAsrStatus(null);

    const myConversationId = conversationId ?? undefined;
    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        role: "user",
        content: q,
        time: nowLabel()
      }
    ]);

    try {
      const res = await ask(q, myConversationId);
      setConversationId(res.conversationId);
      setProvider(res.provider);
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: res.answer,
          meta: res.provider,
          time: nowLabel()
        }
      ]);
      if (autoSpeak) {
        stopSpeaking();
        speakNow(res.answer);
        setSpeaking(true);
        const approxMs = Math.min(12_000, Math.max(1_600, Math.round((res.answer.length / 6) * 1000)));
        if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
        speakTimerRef.current = window.setTimeout(() => setSpeaking(false), approxMs);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "问答失败";
      setError(msg.includes("http_") ? "问答服务暂不可用" : "问答失败");
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: "抱歉，我没有得到有效回答。你可以换个说法再试试。",
          meta: "error",
          time: nowLabel()
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  const pressedRef = React.useRef(false);

  // 按住开始识别
  function pressStart() {
    if (busy) return;
    if (pressedRef.current) return;
    pressedRef.current = true;
    setError(null);
    setAsrPartial("");
    setSpeaking(false);
    stopSpeaking();

    try {
      const session = startRecognizeZhBuffered({
        timeoutMs: 30_000,
        silenceMs: 1_800,
        onPartial: (t) => setAsrPartial(t),
        onStatus: (s) => setAsrStatus(s)
      });
      asrSessionRef.current = session;
      session.result.catch((err) => {
        if (!pressedRef.current) return;
        pressedRef.current = false;
        asrSessionRef.current = null;
        setAsrStatus(null);
        if (!(err instanceof AsrError && err.code === "aborted")) {
          setError(asrErrorZh(err));
        }
      });
    } catch (err) {
      pressedRef.current = false;
      setAsrStatus("error");
      setError(asrErrorZh(err));
      window.setTimeout(() => setAsrStatus(null), 800);
    }
  }

  // 松开：结束识别并发送已累积的文本
  function pressEnd() {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    const session = asrSessionRef.current;
    asrSessionRef.current = null;
    setAsrStatus(null);
    if (!session) return;

    session.stop();
    void session.result
      .then((text) => {
        const trimmed = text.trim();
        if (trimmed !== "") {
          void sendQuestion(trimmed);
        } else {
          setError("没有听到声音，请再说一次。");
        }
      })
      .catch((err) => {
        if (!(err instanceof AsrError && err.code === "aborted")) {
          setError(asrErrorZh(err));
        }
      });
  }

  const listening = asrStatus === "starting" || asrStatus === "listening";
  const activeViz = listening || speaking;

  return (
    <div className="panel qaWindow">
      <div className="qaHeader">
        <div className="qaTitleWrap">
          <div className="cardTitle">语音问答</div>
          <div className="muted">
            {error ? error : listening ? `语音识别：${asrStatusZh(asrStatus)}` : provider ? `服务：${provider}` : initialHint}
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label className="qaToggle">
            <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
            自动播报
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy && !listening}
            onClick={() => {
              stopSpeaking();
              setSpeaking(false);
              if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
            }}
          >
            停止播报
          </button>
          <button
            type="button"
            className={["btn btnPrimary qaHoldBtn", pressedRef.current || listening ? "qaHoldBtnActive" : ""].join(" ")}
            disabled={busy && !listening}
            onPointerDown={(e) => {
              e.preventDefault();
              pressStart();
            }}
            onPointerUp={() => pressEnd()}
            onPointerLeave={() => pressEnd()}
            onPointerCancel={() => pressEnd()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Icon name="mic" size="sm" />
            {pressedRef.current || listening ? "松开发送" : "按住说话"}
          </button>
        </div>
      </div>

      <div className={["qaViz", activeViz ? "qaVizActive" : ""].filter(Boolean).join(" ")} aria-hidden="true">
        <div className="qaBars">
          <span className="qaBar" />
          <span className="qaBar" />
          <span className="qaBar" />
          <span className="qaBar" />
          <span className="qaBar" />
        </div>
        <div className="qaVizText">{asrPartial ? `我听到：${asrPartial}` : listening ? "请开始说话…" : "语音窗口待命"}</div>
      </div>

      <div className="qaChat" ref={scrollRef}>
        {messages.length ? (
          messages.map((m) => (
            <div key={m.id} className={["qaMsg", m.role === "user" ? "qaMsgUser" : "qaMsgBot"].join(" ")}>
              <div className="qaAvatar" aria-hidden="true">
                <Icon name={m.role === "user" ? "user" : "bot"} size="sm" />
              </div>
              <div className="qaMsgBody">
                <div className="qaMsgBubble">{m.content}</div>
                <div className="qaMsgMeta">
                  {m.time ? <span className="qaMsgTime">{m.time}</span> : null}
                  {m.meta ? <span className="qaMsgProvider">{m.meta}</span> : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="qaEmpty">
            <div className="qaEmptyIcon" aria-hidden="true">
              <Icon name="bot" size="lg" />
            </div>
            <div className="qaEmptyTitle">开始对话吧</div>
            <div className="qaEmptyHint">{initialHint}</div>
          </div>
        )}
        {busy ? (
          <div className="qaMsg qaMsgBot">
            <div className="qaAvatar" aria-hidden="true">
              <Icon name="bot" size="sm" />
            </div>
            <div className="qaMsgBody">
              <div className="qaMsgBubble qaTyping">
                <span className="qaDot" />
                <span className="qaDot" />
                <span className="qaDot" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="qaComposer">
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void sendQuestion(text);
            }
          }}
          disabled={busy || listening}
        />
        <button type="button" className="btn btnAccent qaSendBtn" disabled={busy || listening || !text.trim()} onClick={() => sendQuestion(text)}>
          <Icon name="send" size="sm" />
          <span>发送</span>
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || listening || (!messages.length && !conversationId)}
          onClick={() => {
            stopSpeaking();
            setSpeaking(false);
            if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
            setMessages([]);
            setConversationId(null);
            setProvider(null);
            setError(null);
            setAsrPartial("");
            setAsrStatus(null);
          }}
        >
          清空
        </button>
      </div>
    </div>
  );
}

