import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { MemoryItem } from "../../lib/types.js";
import { asrErrorZh, startRecognizeZhBuffered, type AsrStatus } from "../voice/asr.js";
import { useToast } from "../state/toast.js";

const TOPICS = ["童年", "家乡", "工作", "家庭", "江苏记忆"];

export function MemoryInterviewPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [topic, setTopic] = React.useState("童年");
  const [interviewId, setInterviewId] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState<string | null>(null);
  const [turn, setTurn] = React.useState(0);
  const [maxTurns, setMaxTurns] = React.useState(5);
  const [answer, setAnswer] = React.useState("");
  const [memory, setMemory] = React.useState<MemoryItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [asrStatus, setAsrStatus] = React.useState<AsrStatus | null>(null);
  const stopAsrRef = React.useRef<null | (() => void)>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setMemory(null);
    setAnswer("");
    try {
      const result = await api.memory.startInterview({ topic });
      setInterviewId(result.interviewId);
      setQuestion(result.question);
      setTurn(result.turn);
      setMaxTurns(result.maxTurns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "访谈启动失败");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!interviewId || !answer.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.memory.answer(interviewId, answer.trim());
      setAnswer("");
      if (result.done && result.memory) {
        setMemory(result.memory);
        setQuestion(null);
      } else {
        setQuestion(result.question);
        setTurn(result.turn ?? turn + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function generateStory() {
    if (!memory) return;
    setBusy(true);
    try {
      const result = await api.memory.generateStory({ memoryIds: [memory.id] });
      nav(`/elder/story/${result.chapter.id}`);
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "整理失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    if (asrStatus === "starting" || asrStatus === "listening") return;
    try {
      const session = startRecognizeZhBuffered({
        timeoutMs: 30_000,
        silenceMs: 2_500,
        onPartial: setAnswer,
        onStatus: setAsrStatus
      });
      stopAsrRef.current = session.stop;
      session.result
        .then((text) => {
          setAnswer(text);
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

  const listening = asrStatus === "starting" || asrStatus === "listening";

  if (memory) {
    return (
      <div className="yl-page">
        <section className="yl-successPanel">
          <div className="yl-successIcon">
            <Icon name="check" size="xl" />
          </div>
          <h1>这段回忆已经记下了</h1>
          <p>《{memory.title}》已保存到您的故事时间轴。要不要现在整理成一篇故事？</p>
          <div className="yl-inlineActions">
            <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void generateStory()}>
              <Icon name="sparkles" size="sm" />
              {busy ? "整理中…" : "生成故事"}
            </button>
            <Link to="/elder/story" className="btn">回到时间轴</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="yl-page">
      <section className="yl-pageHeader">
        <div>
          <h1>说说您年轻时候的事</h1>
          <p>我会一次只问一个问题，您按着说话就行，不想说也没关系。</p>
        </div>
        <Link to="/elder/story" className="btn">返回</Link>
      </section>

      {!interviewId ? (
        <section className="yl-panel">
          <div className="yl-sectionTitle">
            <Icon name="bookOpen" size="sm" />
            选一个话题
          </div>
          <div className="yl-topicGrid">
            {TOPICS.map((item) => (
              <button
                key={item}
                type="button"
                className={`yl-topicCard ${topic === item ? "yl-topicCard--active" : ""}`}
                onClick={() => setTopic(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void start()}>
            <Icon name="play" size="sm" />
            {busy ? "准备中…" : "开始访谈"}
          </button>
        </section>
      ) : (
        <section className="yl-panel yl-interviewPanel">
          <div className="yl-interviewProgress">
            <span>第 {turn} / {maxTurns} 个问题</span>
            <div className="yl-progressTrack">
              <div className="yl-progressBar" style={{ width: `${Math.min(100, (turn / maxTurns) * 100)}%` }} />
            </div>
          </div>

          <div className="yl-interviewQuestion">
            <Icon name="bot" size="lg" />
            <h2>{question}</h2>
          </div>

          <textarea
            className="input yl-textarea"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="您可以在这里打字，也可以点下面的语音输入"
            disabled={busy}
          />

          <div className="yl-inlineActions">
            <button
              type="button"
              className={`btn ${listening ? "btnDanger" : ""}`}
              onClick={() => {
                if (listening) {
                  stopAsrRef.current?.();
                  stopAsrRef.current = null;
                  setAsrStatus(null);
                } else {
                  startVoice();
                }
              }}
              disabled={busy}
            >
              <Icon name="mic" size="sm" />
              {listening ? "结束语音" : "语音输入"}
            </button>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => void submit()}
              disabled={!answer.trim() || busy}
            >
              {busy ? "保存中…" : "提交回答"}
            </button>
          </div>

          {error ? <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div> : null}
        </section>
      )}
    </div>
  );
}
