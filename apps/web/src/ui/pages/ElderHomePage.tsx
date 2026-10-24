import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import { useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function ElderHomePage() {
  const { me } = useAuth();
  const toast = useToast();
  const [memoryCount, setMemoryCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    api.memory
      .list()
      .then((res) => {
        if (alive) setMemoryCount(res.items.length);
      })
      .catch(() => {
        if (alive) setMemoryCount(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="yl-page">
      <section className="yl-hello">
        <div>
          <h1>
            {me?.user.displayName ?? "您好"}，{greeting()}
          </h1>
          <p>今天想聊点什么，或者需要我帮您办点事？</p>
        </div>
        <div className="yl-helloStatus">
          <span className="yl-statusPill">
            <Icon name="bookOpen" size="sm" />
            {memoryCount === null ? "回忆加载中" : `已记录 ${memoryCount} 段回忆`}
          </span>
          <span className="yl-statusPill yl-statusPill--ok">
            <span className="yl-dot" />
            家属已连接
          </span>
        </div>
      </section>

      <section className="yl-bigActions">
        <Link to="/elder/chat" className="yl-bigAction yl-bigAction--talk">
          <span className="yl-bigIcon">
            <Icon name="message" size={36} />
          </span>
          <span className="yl-bigTitle">我想说说话</span>
          <span className="yl-bigDesc">问天气、聊家常、让我帮您查一查</span>
        </Link>

        <Link to="/elder/safety" className="yl-bigAction yl-bigAction--lost">
          <span className="yl-bigIcon">
            <Icon name="mapPin" size={36} />
          </span>
          <span className="yl-bigTitle">我找不到家了</span>
          <span className="yl-bigDesc">联系家人 · 位置守护（W3 上线）</span>
        </Link>

        <Link to="/elder/safety/scam?mode=transfer" className="yl-bigAction yl-bigAction--scam">
          <span className="yl-bigIcon">
            <Icon name="shieldCheck" size={36} />
          </span>
          <span className="yl-bigTitle">有人让我转账</span>
          <span className="yl-bigDesc">先别转，我帮您看看是不是骗子</span>
        </Link>
      </section>

      <section className="yl-quickRow">
        <Link to="/elder/story" className="yl-quickCard">
          <Icon name="bookOpen" size="lg" />
          <span>
            <strong>我的故事</strong>
            <small>把回忆整理成故事</small>
          </span>
          <Icon name="chevronRight" size="sm" />
        </Link>

        <button
          type="button"
          className="yl-quickCard"
          onClick={() =>
            toast.push({
              kind: "normal",
              title: "用药提醒",
              detail: "W3 上线，届时可拍照识药、按时提醒"
            })
          }
        >
          <Icon name="pill" size="lg" />
          <span>
            <strong>吃药提醒</strong>
            <small>W3 上线</small>
          </span>
          <Icon name="chevronRight" size="sm" />
        </button>

        <button
          type="button"
          className="yl-quickCard"
          onClick={() =>
            toast.push({
              kind: "normal",
              title: "联系家人",
              detail: "请让家属在后续设置页绑定联系电话"
            })
          }
        >
          <Icon name="phone" size="lg" />
          <span>
            <strong>联系家人</strong>
            <small>让家属知道您现在的情况</small>
          </span>
          <Icon name="chevronRight" size="sm" />
        </button>
      </section>
    </div>
  );
}
