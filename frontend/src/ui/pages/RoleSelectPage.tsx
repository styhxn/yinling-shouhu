import React from "react";
import { useNavigate } from "react-router-dom";
import heroUrl from "../assets/landing/hero.webp";
import assistantShot from "../assets/landing/assistant.webp";
import safetyShot from "../assets/landing/safety.webp";
import healthShot from "../assets/landing/health.webp";
import memoryShot from "../assets/landing/memory.webp";
import familyShot from "../assets/landing/family.webp";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import { homeForRole, useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import type { Role } from "../../lib/types.js";
import "./landing.css";

const NAV = [
  { id: "top", label: "首页" },
  { id: "assistant", label: "AI 小助手" },
  { id: "safety", label: "安全守护" },
  { id: "health", label: "健康照护" },
  { id: "memory", label: "回忆陪伴" },
  { id: "family", label: "家人协同" }
] as const;

type SectionId = (typeof NAV)[number]["id"];
const ALL_SECTION_IDS: string[] = [...NAV.map((item) => item.id), "entry"];

type Feature = {
  id: Exclude<SectionId, "top">;
  index: string;
  kicker: string;
  title: React.ReactNode;
  desc: string;
  points: Array<{ title: string; detail: string }>;
  shot: string;
  alt: string;
  browser: string;
  chips: [string, string];
  mark: string;
  tone: "paper" | "ink" | "sage" | "sepia" | "pine";
  flip?: boolean;
};

const FEATURES: Feature[] = [
  {
    id: "assistant",
    index: "02",
    kicker: "AI 陪伴 · 语音优先",
    title: (
      <>
        不用打字，
        <br />
        <em>说一句就行</em>
      </>
    ),
    desc: "一个记得住上下文的 AI 小助手。今天该吃什么药、刚才家人说了什么、上次聊到哪段回忆，它都能接得住。",
    points: [
      { title: "听得懂", detail: "语音识别后先给出文字，确认无误再发送。" },
      { title: "记得住", detail: "用药、安全、回忆和家人的留言，汇成同一份上下文。" },
      { title: "说得清", detail: "回答配上工具依据和决策轨迹，家人可以随时回看。" }
    ],
    shot: assistantShot,
    alt: "小助手首页展示今日用药、安全和家人留言上下文",
    browser: "陪伴屏 · 小助手",
    chips: ["语音输入，自动修订", "上次聊到：一家人的年夜饭"],
    mark: "听",
    tone: "paper"
  },
  {
    id: "safety",
    index: "03",
    kicker: "反诈识别 · 家人确认",
    title: (
      <>
        先停一停，
        <br />
        <em>再确认</em>
      </>
    ),
    desc: "可疑转账、陌生链接、上门推销，小助手用长辈听得懂的话拆开风险；真正涉及钱的动作，必须等家人确认。",
    points: [
      { title: "识别高风险话术", detail: "冒充公检法、虚假投资、刷单返利，逐句解释可疑点。" },
      { title: "高风险动作有确认门", detail: "转账、汇款不再靠一个人判断，家人手机上同步确认。" },
      { title: "找不到家一键求助", detail: "把最后位置和求助信息一起发给家人。" }
    ],
    shot: safetyShot,
    alt: "可疑信息鉴定页面展示公检法诈骗识别和三条防骗原则",
    browser: "守护 · 可疑信息鉴定",
    chips: ["风险等级：高 · 建议先挂断", "已通知家人：女儿"],
    mark: "守",
    tone: "ink",
    flip: true
  },
  {
    id: "health",
    index: "04",
    kicker: "用药提醒 · 饮食搭配",
    title: (
      <>
        药别漏，
        <br />
        <em>饭要对</em>
      </>
    ),
    desc: "按当天计划提醒用药，结合身体档案提示相互作用和漏服处理；一日三餐少盐、稳血压，也能照顾到口味。",
    points: [
      { title: "今天的药按点提醒", detail: "已吃、稍后、跳过都有记录，家人端同步看到。" },
      { title: "相互作用先提醒", detail: "降压药配西柚、二甲双胍配酒，提前说清楚。" },
      { title: "饮食按身体情况配", detail: "高血压、糖尿病、痛风各自有方案，不再靠猜。" }
    ],
    shot: healthShot,
    alt: "用药页展示今日计划、相互作用提醒和饮食注意事项",
    browser: "健康照护 · 今天的药",
    chips: ["今日用药 3 次 · 依从率 86%", "降压药与西柚：避免同服"],
    mark: "养",
    tone: "sage"
  },
  {
    id: "memory",
    index: "05",
    kicker: "记忆访谈 · 故事留存",
    title: (
      <>
        把记得的，
        <br />
        <em>留下来</em>
      </>
    ),
    desc: "一次只问一个问题，陪长辈把童年、工作、家人慢慢讲成可以读、也可以听的故事。AI 负责追问，家人负责听见。",
    points: [
      { title: "一次一个问题", detail: "不催、不打断，长辈说多久都可以。" },
      { title: "自动整理成章节", detail: "访谈内容沉淀成家庭故事，按主题归档。" },
      { title: "家人一起读", detail: "故事可以朗读、导出，成为一家人共同的记忆。" }
    ],
    shot: memoryShot,
    alt: "我的故事页面展示 AI 整理的家庭回忆和时间线",
    browser: "回忆 · 我的故事",
    chips: ["正在整理：纺织厂的第一天", "已收录 3 段家庭回忆"],
    mark: "忆",
    tone: "sepia",
    flip: true
  },
  {
    id: "family",
    index: "06",
    kicker: "照护简报 · 留言与确认",
    title: (
      <>
        不在身边，
        <br />
        <em>也能放心</em>
      </>
    ),
    desc: "每天一页照护简报：用药依从率、安全提醒、长辈留言和待确认事项，一屏看清；需要您拍板的事，直接处理。",
    points: [
      { title: "AI 今日简报", detail: "把一整天的照护重点压缩成几句话。" },
      { title: "周报依从率", detail: "本周吃药、安全、陪伴变化趋势一目了然。" },
      { title: "留言和确认闭环", detail: "给长辈留言、处理转账确认，都留在同一个地方。" }
    ],
    shot: familyShot,
    alt: "家人端照护台展示今日简报、待确认事项和用药依从率",
    browser: "家人端 · 照护台",
    chips: ["本周用药依从率 86%", "待确认：1 件 · 转账风险"],
    mark: "家",
    tone: "pine"
  }
];

function revealDelay(ms: number): React.CSSProperties {
  return { "--lp-delay": `${ms}ms` } as React.CSSProperties;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function RoleSelectPage() {
  const { me, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const pageRef = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState<Role | null>(null);
  const [demoMode, setDemoMode] = React.useState(false);
  const [active, setActive] = React.useState<string>("top");
  const [navSolid, setNavSolid] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    api.auth
      .meta()
      .then((meta) => {
        if (alive) setDemoMode(meta.demoMode);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("lp-scroll");
    return () => root.classList.remove("lp-scroll");
  }, []);

  React.useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const items = Array.from(page.querySelectorAll<HTMLElement>(".lp-reveal"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    page.classList.add("is-enhanced");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
    );
    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      page.classList.remove("is-enhanced");
    };
  }, []);

  React.useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const y = window.scrollY;
        let current = "top";
        for (const id of ALL_SECTION_IDS) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.45) {
            current = id;
          }
        }
        setActive(current);
        setNavSolid(y > window.innerHeight * 0.62);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
      });
    };
    update();
    const timer = window.setTimeout(update, 600);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("load", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("load", update);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  async function enterDemo(role: Role) {
    if (busy) return;
    setBusy(role);
    try {
      await login(role);
      nav(homeForRole(role), { replace: true });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "进入失败",
        detail: err instanceof Error ? err.message : "请确认后端已启动"
      });
    } finally {
      setBusy(null);
    }
  }

  const activeIndex = NAV.findIndex((item) => item.id === active);
  const activeLabel = activeIndex >= 0 ? NAV[activeIndex]?.label ?? "进入系统" : "进入系统";
  const counterNo = activeIndex >= 0 ? pad(activeIndex + 1) : "06";
  const onLightSection = active === "assistant" || active === "health";

  return (
    <div className="lp-page" ref={pageRef}>
      <a className="yl-skipLink" href="#main">
        跳到主要内容
      </a>

      <header className={`lp-nav ${navSolid ? "is-solid" : ""}`}>
        <div className="lp-navProgress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
        <div className="lp-navInner">
          <button type="button" className="lp-brand" onClick={() => scrollToId("top")} aria-label="银龄守护首页">
            <span className="lp-brandSeal" aria-hidden="true">银</span>
            <span className="lp-brandText">
              <strong>银龄守护</strong>
              <small>水韵江苏</small>
            </span>
          </button>

          <nav className="lp-navLinks" aria-label="首页功能导航">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`lp-navLink ${active === item.id ? "is-active" : ""}`}
                aria-current={active === item.id ? "location" : undefined}
                onClick={() => scrollToId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="lp-navActions">
            {me ? (
              <button type="button" className="lp-navCta" onClick={() => nav(homeForRole(me.user.role))}>
                {me.user.role === "elder" ? "回到陪伴屏" : "回到照护台"}
                <Icon name="arrowRight" size="sm" />
              </button>
            ) : (
              <button type="button" className="lp-navCta" onClick={() => scrollToId("entry")}>
                进入系统
                <Icon name="arrowRight" size="sm" />
              </button>
            )}
          </div>
        </div>

        <nav className="lp-mobileNav" aria-label="首页功能导航">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lp-mobileNavLink ${active === item.id ? "is-active" : ""}`}
              aria-current={active === item.id ? "location" : undefined}
              onClick={() => scrollToId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <aside
        className={`lp-rail ${onLightSection ? "is-on-light" : ""} ${active === "entry" ? "is-hidden" : ""}`}
        aria-label="页面进度"
      >
        {NAV.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`lp-railBtn ${active === item.id ? "is-active" : ""}`}
            onClick={() => scrollToId(item.id)}
            aria-label={`${item.label}，第 ${index + 1} 屏`}
          >
            <span className="lp-railLabel">{item.label}</span>
            <span className="lp-railNo">{pad(index + 1)}</span>
            <span className="lp-railDot" aria-hidden="true" />
          </button>
        ))}
      </aside>

      <div
        className={`lp-counter ${onLightSection ? "is-on-light" : ""} ${active === "entry" ? "is-hidden" : ""}`}
        aria-hidden="true"
      >
        <span className="lp-counterNo">{counterNo}</span>
        <span className="lp-counterDivider">/</span>
        <span className="lp-counterTotal">06</span>
        <span className="lp-counterLabel">{activeLabel}</span>
      </div>

      <main id="main">
        <section id="top" className="lp-hero" aria-label="银龄守护首页">
          <img
            className="lp-heroImage"
            src={heroUrl}
            alt="江南水乡清晨，石桥、河道、白墙与一条木船"
            loading="eager"
            decoding="async"
          />
          <div className="lp-heroShade" aria-hidden="true" />
          <div className="lp-wrap lp-heroInner">
            <div className="lp-heroCopy">
              <p className="lp-heroKicker">
                <span className="lp-seal" aria-hidden="true">银</span>
                水韵江苏 · 银龄守护
              </p>
              <h1 className="lp-heroTitle">
                让 AI 住进
                <em>爸妈的日常</em>
              </h1>
              <p className="lp-heroLead">
                会倾听、会提醒、会守护。让长辈被照顾，也让家人被安心。
              </p>
              <p className="lp-heroTags">AI 陪伴 · 安全守护 · 健康照护 · 回忆留存</p>
              <div className="lp-heroActions">
                <button type="button" className="lp-btn lp-btn--paper" onClick={() => scrollToId("entry")}>
                  开始体验
                  <Icon name="arrowRight" size="sm" />
                </button>
                <button type="button" className="lp-btn lp-btn--ghost" onClick={() => scrollToId("assistant")}>
                  看看能做什么
                </button>
              </div>
              {demoMode ? (
                <div className="lp-demoInline">
                  <span>演示直达</span>
                  <button type="button" disabled={busy !== null} onClick={() => void enterDemo("elder")}>
                    {busy === "elder" ? "进入中…" : "长辈端"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void enterDemo("family")}>
                    {busy === "family" ? "进入中…" : "家人端"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="lp-heroCard">
            <div className="lp-heroCardHead">
              <span className="lp-liveDot" aria-hidden="true" />
              AI 今日简报
            </div>
            <p>早上 8 点的药记得打卡。南京今天多云 18 度，您在鼓楼区附近很安全。</p>
            <div className="lp-heroCardFoot">
              <span>用药 · 2 次</span>
              <span>安全 · 2 条提醒</span>
              <span>回忆 · 3 段</span>
            </div>
          </aside>

          <button type="button" className="lp-scrollCue" onClick={() => scrollToId("assistant")}>
            <span>向下了解</span>
            <i aria-hidden="true" />
          </button>
        </section>

        {FEATURES.map((feature) => (
          <section
            key={feature.id}
            id={feature.id}
            className={[
              "lp-feature",
              `lp-feature--${feature.tone}`,
              feature.flip ? "lp-feature--flip" : ""
            ].join(" ")}
            aria-labelledby={`${feature.id}-title`}
          >
            {feature.tone === "sepia" ? (
              <img className="lp-featureBackdrop" src={heroUrl} alt="" aria-hidden="true" loading="lazy" />
            ) : null}
            <span className="lp-watermark" aria-hidden="true">
              {feature.mark}
            </span>
            <div className="lp-wrap lp-featureGrid">
              <div className="lp-copy">
                <div className="lp-eyebrow lp-reveal" style={revealDelay(0)}>
                  <span className="lp-eyebrowNum">{feature.index}</span>
                  <span className="lp-eyebrowLine" aria-hidden="true" />
                  <span>{feature.kicker}</span>
                </div>
                <h2 id={`${feature.id}-title`} className="lp-reveal" style={revealDelay(70)}>
                  {feature.title}
                </h2>
                <p className="lp-desc lp-reveal" style={revealDelay(130)}>
                  {feature.desc}
                </p>
                <ul className="lp-points lp-reveal" style={revealDelay(190)}>
                  {feature.points.map((point, pointIndex) => (
                    <li key={point.title}>
                      <span className="lp-pointNo" aria-hidden="true">{pad(pointIndex + 1)}</span>
                      <span className="lp-pointBody">
                        <strong>{point.title}</strong>
                        <small>{point.detail}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="lp-inlineCta lp-reveal" style={revealDelay(250)} onClick={() => scrollToId("entry")}>
                  进入系统体验
                  <Icon name="arrowRight" size="sm" />
                </button>
              </div>

              <div className="lp-visual lp-reveal" style={revealDelay(140)}>
                <div className="lp-visualGlow" aria-hidden="true" />
                <div className="lp-stage">
                  <div className="lp-browser">
                    <div className="lp-browserBar" aria-hidden="true">
                      <span className="lp-browserDots"><i /><i /><i /></span>
                      <em>{feature.browser}</em>
                    </div>
                    <div className="lp-browserMedia">
                      <img src={feature.shot} alt={feature.alt} loading="lazy" decoding="async" />
                    </div>
                  </div>
                  <div className={`lp-chip lp-chip--top lp-chip--${feature.id}`}>
                    <span className="lp-chipDot" aria-hidden="true" />
                    {feature.chips[0]}
                  </div>
                  <div className={`lp-chip lp-chip--bottom lp-chip--${feature.id}`}>
                    <Icon name="sparkles" size="sm" />
                    {feature.chips[1]}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}

        <section id="entry" className="lp-entry" aria-labelledby="entry-title">
          <div className="lp-entryRing" aria-hidden="true" />
          <div className="lp-wrap lp-entryInner">
            <div className="lp-entryHead lp-reveal">
              <p className="lp-eyebrow lp-eyebrow--entry">
                <span className="lp-eyebrowNum">现在</span>
                <span className="lp-eyebrowLine" aria-hidden="true" />
                <span>进入系统</span>
              </p>
              <h2 id="entry-title">
                让今天，从一句
                <br />
                <em>「早上好」</em>
                开始
              </h2>
              <p>选择身份进入。长辈不用记账号，家人用手机号登录。</p>
            </div>

            <div className="lp-roleGrid lp-reveal" style={revealDelay(90)}>
              <button type="button" className="lp-roleCard" onClick={() => nav("/login/elder")}>
                <span className="lp-roleNum" aria-hidden="true">01</span>
                <span className="lp-roleContent">
                  <span className="lp-roleKicker">长辈端 · 陪伴屏</span>
                  <strong className="lp-roleTitle">我是长辈</strong>
                  <span className="lp-roleDesc">用家人给的 6 位绑定码进入，只保留最常用的大按钮。</span>
                </span>
                <span className="lp-roleArrow" aria-hidden="true">
                  <Icon name="arrowRight" size="sm" />
                </span>
              </button>
              <button type="button" className="lp-roleCard" onClick={() => nav("/login/family")}>
                <span className="lp-roleNum" aria-hidden="true">02</span>
                <span className="lp-roleContent">
                  <span className="lp-roleKicker">家人端 · 照护台</span>
                  <strong className="lp-roleTitle">我是家人</strong>
                  <span className="lp-roleDesc">手机号登录，绑定长辈，查看简报、留言和处理确认。</span>
                </span>
                <span className="lp-roleArrow" aria-hidden="true">
                  <Icon name="arrowRight" size="sm" />
                </span>
              </button>
            </div>

            {demoMode ? (
              <div className="lp-entryDemo">
                <span>演示直达</span>
                <button type="button" disabled={busy !== null} onClick={() => void enterDemo("elder")}>
                  {busy === "elder" ? "进入中…" : "长辈演示"}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void enterDemo("family")}>
                  {busy === "family" ? "进入中…" : "家人演示"}
                </button>
              </div>
            ) : null}

            {me ? (
              <div className="lp-entryCurrent">
                <span>当前身份</span>
                <strong>{me.user.displayName}</strong>
                <button type="button" onClick={() => nav(homeForRole(me.user.role))}>
                  继续使用
                  <Icon name="arrowRight" size="sm" />
                </button>
              </div>
            ) : null}

            <footer className="lp-footer">
              <span>银龄守护 · 水韵江苏</span>
              <span>AI 陪伴 / 安全守护 / 健康照护 / 回忆留存</span>
              <span>江苏 · 南京</span>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
