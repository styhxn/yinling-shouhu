import React from "react";
import { Link } from "react-router-dom";
import heroUrl from "../assets/jiangsu-hero.webp";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { FamilySummary, MemoryItem } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatClock(ts: number | null | undefined) {
  if (!ts) return "暂无记录";
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ElderHomePage() {
  const { me } = useAuth();
  const [summary, setSummary] = React.useState<FamilySummary | null>(null);
  const [latestMemory, setLatestMemory] = React.useState<MemoryItem | null>(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([api.family.summary(), api.memory.list()])
      .then(([summaryRes, memoryRes]) => {
        if (!alive) return;
        setSummary(summaryRes.summary);
        setLatestMemory(memoryRes.items[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const date = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  const due = summary?.medications.dueToday ?? 0;
  const taken = summary?.medications.taken ?? 0;
  const logged = summary?.medications.logged ?? 0;
  const adherence =
    summary?.medications.adherencePct === null ||
    typeof summary?.medications.adherencePct === "undefined"
      ? "暂无记录"
      : `${summary.medications.adherencePct}%`;

  return (
    <div className="ys-home">
      <header className="ys-homeHeader">
        <div>
          <p className="ys-homeDate">{date}</p>
          <h1>今日</h1>
          <p className="ys-homeGreeting">
            {me?.user.displayName ?? "您好"}，{greeting()}。今天先照顾好自己。
          </p>
        </div>
        <span className="ys-seal">水韵江苏</span>
      </header>

      <section className="ys-homeHero">
        <div className="ys-homeHeroText">
          <h2>把日子过稳，把故事留下。</h2>
          <p>用药、位置、家人的消息，都在这里。想说话的时候，小助手也在。</p>
          <div className="ys-homeHeroActions">
            <Link to="/elder/story" className="btn btnPrimary">
              看看我的故事
            </Link>
            <Link to="/elder/chat" className="ys-textLink">
              问小助手
              <Icon name="arrowRight" size="sm" />
            </Link>
          </div>
        </div>
        <figure className="ys-homeHeroMedia">
          <img src={heroUrl} alt="江南水乡清晨" className="ys-homeHeroImage" />
          <figcaption>水韵江苏 · 清晨的水巷</figcaption>
        </figure>
      </section>

      <section className="ys-todayStrip">
        <div className="ys-todayItem">
          <span>用药</span>
          <strong>{logged === 0 ? "待记录" : `${taken}/${due} 次`}</strong>
          <small>{logged === 0 ? "今天还没有打卡" : `依从率 ${adherence}`}</small>
        </div>
        <div className="ys-todayItem">
          <span>位置</span>
          <strong>{summary?.location ? "已更新" : "暂无"}</strong>
          <small>
            {summary?.location ? `最后更新 ${formatClock(summary.location.ts)}` : "家属可设置安全区域"}
          </small>
        </div>
        <div className="ys-todayItem">
          <span>待确认</span>
          <strong>{summary?.pendingConfirms ?? 0}</strong>
          <small>{summary?.pendingConfirms ? "家属需要处理" : "暂时没有"}</small>
        </div>
      </section>

      <section className="ys-homeGrid">
        <Link to="/elder/story" className="ys-storyFeature">
          <span className="ys-kicker">记忆故事</span>
          <h2>{latestMemory ? latestMemory.title : "还有一段故事没讲完"}</h2>
          <p className="ys-storyQuote">
            {latestMemory
              ? latestMemory.summary || latestMemory.transcript.slice(0, 90)
              : "一次只问一个问题，您按着说话，我帮您整理成可以读、可以听的故事。"}
          </p>
          <div className="ys-storyImage" style={{ backgroundImage: `url(${heroUrl})` }} aria-hidden="true" />
          <span className="ys-moduleLink">
            进入故事
            <Icon name="arrowRight" size="sm" />
          </span>
        </Link>

        <Link to="/elder/safety" className="ys-module">
          <span className="ys-moduleIcon">
            <Icon name="mapPin" size="lg" />
          </span>
          <span className="ys-kicker">安心守护</span>
          <h3>位置与安全</h3>
          <p>
            {summary?.alerts.open
              ? `${summary.alerts.open} 条安全提醒待查看`
              : "围栏、寻人、紧急联系，都放在这里。"}
          </p>
          <span className="ys-moduleLink">
            去看看
            <Icon name="arrowRight" size="sm" />
          </span>
        </Link>

        <Link to="/elder/meds" className="ys-module">
          <span className="ys-moduleIcon">
            <Icon name="pill" size="lg" />
          </span>
          <span className="ys-kicker">健康照护</span>
          <h3>今天的药</h3>
          <p>
            {due > 0
              ? `计划 ${due} 次，已记录 ${taken} 次。`
              : "还没有用药计划，可以拍照识药。"}
          </p>
          <span className="ys-moduleLink">
            去记录
            <Icon name="arrowRight" size="sm" />
          </span>
        </Link>

        <Link to="/elder/safety/scam" className="ys-scamBand">
          <div>
            <span className="ys-kicker">反诈守护</span>
            <h3>有人让您转账时，先来这里看一眼。</h3>
            <p>文字、短信截图、链接都可以帮您看看。拿不准就先问家人，或拨打 96110。</p>
          </div>
          <span className="ys-scamArrow">
            <Icon name="shieldCheck" size="lg" />
          </span>
        </Link>
      </section>

      <div className="ys-assistantRow">
        <span>有事可以问小助手，不用打字，按着说话就行。</span>
        <Link to="/elder/chat" className="ys-textLink">
          去问问
          <Icon name="arrowRight" size="sm" />
        </Link>
      </div>

      <footer className="ys-quoteStrip">
        <p>君到姑苏见，人家尽枕河。</p>
        <small>唐 · 杜荀鹤《送人游吴》</small>
      </footer>
    </div>
  );
}
