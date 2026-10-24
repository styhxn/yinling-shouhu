import React from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { StoryBook, StoryChapter } from "../../lib/types.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";

export function StoryChapterPage() {
  const { id = "" } = useParams();
  const [chapter, setChapter] = React.useState<StoryChapter | null>(null);
  const [book, setBook] = React.useState<StoryBook | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [speaking, setSpeaking] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await api.memory.exportStory();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename ?? "我的人生故事.html";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "导出失败，请稍后再试");
    } finally {
      setExporting(false);
    }
  };

  React.useEffect(() => {
    let alive = true;
    api.memory
      .getStory(id)
      .then((res) => {
        if (!alive) return;
        setChapter(res.chapter);
        setBook(res.book);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "故事加载失败");
      });
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [id]);

  if (error) {
    return (
      <div className="yl-page">
        <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div>
        <Link to="/elder/story" className="btn">返回时间轴</Link>
      </div>
    );
  }

  if (!chapter) {
    return <div className="yl-loading">正在翻开故事…</div>;
  }

  const paragraphs = chapter.content.split(/\n+/).filter(Boolean);

  return (
    <div className="yl-page">
      <section className="yl-pageHeader">
        <div>
          <div className="yl-eyebrow">{book?.title ?? "我的人生故事"}</div>
          <h1>{chapter.title}</h1>
        </div>
        <Link to="/elder/story" className="btn">返回时间轴</Link>
      </section>

      <article className="yl-storyReader">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </article>

      <div className="yl-storyActions">
        <button
          type="button"
          className="btn btnPrimary"
          onClick={() => {
            if (speaking) {
              stopSpeaking();
              setSpeaking(false);
            } else {
              speakNow(chapter.content);
              setSpeaking(true);
            }
          }}
        >
          <Icon name={speaking ? "stop" : "volume"} size="sm" />
          {speaking ? "停止朗读" : "朗读这篇故事"}
        </button>
        <button type="button" className="btn" onClick={handleExport} disabled={exporting}>
          <Icon name="download" size="sm" />
          {exporting ? "正在导出…" : "导出故事书（可打印）"}
        </button>
        <span className="muted">朗读使用浏览器语音；导出会生成可打印的整本 HTML 纪念册。</span>
      </div>
      {exportError ? (
        <div className="yl-errorBar">
          <Icon name="alertCircle" size="sm" />
          <span>{exportError}</span>
        </div>
      ) : null}
    </div>
  );
}
