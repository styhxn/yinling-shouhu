import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { MemoryItem, StoryChapter } from "../../lib/types.js";
import { useToast } from "../state/toast.js";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function MemoryListPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [chapters, setChapters] = React.useState<StoryChapter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [memories, stories] = await Promise.all([
        api.memory.list(),
        api.memory.listStories()
      ]);
      setItems(memories.items);
      setChapters(stories.chapters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function generate(item: MemoryItem) {
    setBusyId(item.id);
    try {
      const result = await api.memory.generateStory({ memoryIds: [item.id] });
      nav(`/elder/story/${result.chapter.id}`);
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "整理失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="yl-page">
      <section className="yl-pageHeader">
        <div>
          <h1>我的故事</h1>
          <p>您说过的回忆，会慢慢变成可以读、可以听的故事。</p>
        </div>
        <Link to="/elder/story/new" className="btn btnPrimary">
          <Icon name="plus" size="sm" />
          开始新故事
        </Link>
      </section>

      {chapters.length > 0 && (
        <section className="yl-storyShelf">
          <div className="yl-sectionTitle">
            <Icon name="bookOpen" size="sm" />
            已整理的故事
          </div>
          <div className="yl-storyShelfGrid">
            {chapters.map((chapter) => (
              <Link key={chapter.id} to={`/elder/story/${chapter.id}`} className="yl-storyCard">
                <strong>{chapter.title}</strong>
                <p>{chapter.content.slice(0, 80)}…</p>
                <span className="yl-cardLink">继续读 <Icon name="arrowRight" size="sm" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="yl-loading">正在翻开您的故事…</div>
      ) : error ? (
        <div className="yl-errorBar">
          <Icon name="alertCircle" size="sm" />
          <span>{error}</span>
          <button type="button" className="yl-linkBtn" onClick={() => void load()}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <div className="yl-emptyState">
          <Icon name="bookOpen" size="xl" />
          <strong>还没有故事</strong>
          <p>点“开始新故事”，我会一次问您一个问题，您按着说话就行。</p>
          <Link to="/elder/story/new" className="btn btnPrimary">开始第一个故事</Link>
        </div>
      ) : (
        <section className="yl-memoryTimeline">
          {items.map((item) => (
            <article key={item.id} className="yl-memoryCard">
              <div className="yl-memoryDot" />
              <div className="yl-memoryBody">
                <div className="yl-memoryTop">
                  <div>
                    <h2>{item.title}</h2>
                    <div className="yl-memoryMeta">
                      {item.timeRange && <span>{item.timeRange}</span>}
                      {item.place && <span>{item.place}</span>}
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={busyId === item.id}
                    onClick={() => void generate(item)}
                  >
                    <Icon name="sparkles" size="sm" />
                    {busyId === item.id ? "整理中…" : "整理成故事"}
                  </button>
                </div>
                <p className="yl-memoryText">
                  {item.summary || item.transcript.slice(0, 120)}
                </p>
                <div className="yl-tagRow">
                  {item.tags.map((tag) => (
                    <span key={tag} className="yl-tag">{tag}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
