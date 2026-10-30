import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { MemoryInsight, MemoryItem } from "../../lib/types.js";
import { asrErrorZh, AsrError, startRecognizeZhBuffered, type AsrStatus } from "../voice/asr.js";
import { useToast } from "../state/toast.js";
import { useA11y } from "../state/a11y.js";

const TOPICS = ["童年", "家乡", "工作", "家庭", "江苏记忆"];

export function MemoryInterviewPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { announce, say } = useA11y();
  const [topic, setTopic] = React.useState("童年");
  const [interviewId, setInterviewId] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState<string | null>(null);
  const [turn, setTurn] = React.useState(0);
  const [maxTurns, setMaxTurns] = React.useState(5);
  const [answer, setAnswer] = React.useState("");
  const [memory, setMemory] = React.useState<MemoryItem | null>(null);
  const [insight, setInsight] = React.useState<MemoryInsight | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [asrStatus, setAsrStatus] = React.useState<AsrStatus | null>(null);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [photoPrompt, setPhotoPrompt] = React.useState(false);
  const [adaptive, setAdaptive] = React.useState(false);
  const stopAsrRef = React.useRef<null | (() => void)>(null);

  React.useEffect(() => {
    if (question) announce(question);
  }, [question, announce]);

  React.useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  async function start() {
    setBusy(true);
    setError(null);
    setMemory(null);
    setInsight(null);
    setAnswer("");
    setAdaptive(false);
    try {
      let photoId: string | undefined;
      if (photoFile) {
        const uploaded = await api.uploads.image(photoFile, "memory");
        photoId = uploaded.upload.id;
      }
      const result = await api.memory.startInterview({
        topic,
        ...(photoId ? { photoId } : {})
      });
      setInterviewId(result.interviewId);
      setQuestion(result.question);
      setTurn(result.turn);
      setMaxTurns(result.maxTurns);
      setPhotoPrompt(Boolean(result.photoPrompt));
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
        setInsight(result.insight ?? null);
        setQuestion(null);
      } else {
        setQuestion(result.question);
        setTurn(result.turn ?? turn + 1);
        setAdaptive(Boolean(result.adaptive));
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
          if (!(err instanceof AsrError && err.code === "aborted")) {
            setError(asrErrorZh(err));
          }
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
          {photoPreview ? (
            <img className="yl-successPhoto" src={photoPreview} alt="这段回忆附带的老照片" />
          ) : null}
          {insight ? (
            <div className="yl-insightCard">
              <div className="yl-insightHead">
                <Icon name="sparkles" size="sm" />
                <strong>{insight.engine === "rules+llm" ? "已自动整理" : "已按原话整理"}</strong>
              </div>
              <p>{insight.summary}</p>
              <div className="yl-insightTags">
                {Array.from(
                  new Set(
                    [insight.timeRange, insight.place, ...insight.people, ...insight.tags].filter(
                      (item): item is string => Boolean(item)
                    )
                  )
                ).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          ) : null}
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

          <div className="yl-photoPicker">
            {photoPreview ? (
              <div className="yl-photoPreview">
                <img src={photoPreview} alt="访谈照片预览" />
                <div>
                  <strong>从这张照片开始</strong>
                  <p>我会先问照片里的地点和人物，再接着往下聊。</p>
                </div>
                <button type="button" className="btn btn--sm" onClick={() => setPhotoFile(null)}>
                  移除
                </button>
              </div>
            ) : (
              <label className="yl-photoAdd">
                <Icon name="camera" size="lg" />
                <span>
                  <strong>带一张老照片（可选）</strong>
                  <small>看着照片，更容易想起当时的人和事</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void start()}>
            <Icon name="play" size="sm" />
            {busy ? "准备中…" : "开始访谈"}
          </button>
          {error ? (
            <div className="yl-errorBar">
              <Icon name="alertCircle" size="sm" />
              <span>{error}</span>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="yl-panel yl-interviewPanel">
          <div className="yl-interviewProgress">
            <span>第 {turn} / {maxTurns} 个问题</span>
            <div className="yl-progressTrack">
              <div className="yl-progressBar" style={{ width: `${Math.min(100, (turn / maxTurns) * 100)}%` }} />
            </div>
          </div>

          <div className="yl-interviewMeta">
            {photoPrompt ? (
              <span className="yl-badge">
                <Icon name="camera" size="sm" />
                从照片开始
              </span>
            ) : null}
            {adaptive ? (
              <span className="yl-badge yl-badge--accent">
                <Icon name="sparkles" size="sm" />
                接着您刚才说的追问
              </span>
            ) : null}
          </div>

          <div className="yl-interviewQuestion" aria-live="polite">
            <Icon name="bot" size="lg" />
            <div className="yl-interviewQuestionBody">
              <h2>{question}</h2>
              <button
                type="button"
                className="btn yl-interviewReplay"
                onClick={() => {
                  if (question) say(question);
                }}
              >
                <Icon name="volume" size="sm" />
                再念一遍
              </button>
            </div>
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
