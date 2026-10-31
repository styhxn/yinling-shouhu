import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { ChatPanel } from "../components/ChatPanel.js";
import { api } from "../../lib/api.js";
import type { AgentBrief, DietPlan, ElderMessage, FamilySummary } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";
import { useA11y } from "../state/a11y.js";
import { useRealtime } from "../state/realtime.js";
import { useToast } from "../state/toast.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";
import "./kiosk.css";

type FamilyMember = {
  familyUserId: string;
  displayName: string;
  relation: string | null;
  phone: string | null;
};

function greeting(hour = new Date().getHours()) {
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function relationLabel(member: FamilyMember | null) {
  if (!member) return "家人";
  if (member.relation === "daughter") return "女儿";
  if (member.relation === "son") return "儿子";
  return member.relation || member.displayName;
}

function clockText(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dateText(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

export function KioskPage() {
  const { me, logout } = useAuth();
  const { voiceEnabled, toggleVoice } = useA11y();
  const toast = useToast();
  const nav = useNavigate();
  const [now, setNow] = React.useState(() => new Date());
  const [brief, setBrief] = React.useState<AgentBrief | null>(null);
  const [briefState, setBriefState] = React.useState<"loading" | "ready" | "error">("loading");
  const [summary, setSummary] = React.useState<FamilySummary | null>(null);
  const [dietPlan, setDietPlan] = React.useState<DietPlan | null>(null);
  const [dietState, setDietState] = React.useState<"loading" | "ready" | "error">("loading");
  const [members, setMembers] = React.useState<FamilyMember[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [peaceSent, setPeaceSent] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [familyNotice, setFamilyNotice] = React.useState<ElderMessage | null>(null);
  const [noticeCount, setNoticeCount] = React.useState(0);
  const { lastEvent } = useRealtime();

  const loadFamilyNotice = React.useCallback(async () => {
    try {
      const res = await api.elderMessages.list({ peek: true });
      const unread = res.items.find(
        (item) => item.fromRole === "family" && !item.read
      ) ?? null;
      setFamilyNotice(unread);
      setNoticeCount(res.unreadCount);
      return res.unreadCount;
    } catch {
      // 留言提醒是增强信息，读取失败不打扰长辈。
      return 0;
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    document.body.classList.add("kiosk-mode");
    return () => document.body.classList.remove("kiosk-mode");
  }, []);

  React.useEffect(() => {
    let alive = true;
    api.agent
      .brief()
      .then((res) => {
        if (!alive) return;
        setBrief(res.brief);
        setBriefState("ready");
      })
      .catch(() => {
        if (alive) setBriefState("error");
      });
    api.family
      .summary()
      .then((res) => {
        if (alive) setSummary(res.summary);
      })
      .catch(() => undefined);
    api.family
      .members()
      .then((res) => {
        if (alive) setMembers(res.members);
      })
      .catch(() => undefined);
    api.diet
      .plan()
      .then((res) => {
        if (!alive) return;
        setDietPlan(res.plan);
        setDietState("ready");
      })
      .catch(() => {
        if (alive) setDietState("error");
      });
    void loadFamilyNotice();
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [loadFamilyNotice]);

  React.useEffect(() => {
    if (lastEvent?.type !== "elder.message") return;
    void loadFamilyNotice().then((count) => {
      if (count > 0 && voiceEnabled) speakNow("家人来消息了，按念给我听就能听。");
    });
  }, [lastEvent, loadFamilyNotice, voiceEnabled]);

  const name = me?.user.displayName ?? "您好";
  const family = members[0] ?? null;
  const familyLabel = relationLabel(family);
  const due = summary?.medications.dueToday ?? 0;
  const taken = summary?.medications.taken ?? 0;
  const remaining = Math.max(0, due - taken);
  const briefText =
    briefState === "ready" && brief?.summary
      ? brief.summary
      : briefState === "loading"
        ? "今天也要按时吃药、好好吃饭；有事就按下面的大按钮。"
        : "今天先把药吃好，慢慢来，有事就按一下和我说话。";
  const medsReady = summary !== null;

  function readBrief() {
    stopSpeaking();
    speakNow(`${name}，${greeting(now.getHours())}。${briefText}`);
  }

  async function sendPeace() {
    if (busy) return;
    if (!family) {
      toast.push({ kind: "normal", title: "还没找到家人账号", detail: "请联系家人先绑定。" });
      return;
    }
    setBusy(true);
    try {
      await api.family.sendMessage({
        familyUserId: family.familyUserId,
        content: "我挺好的，您放心。",
        kind: "peace"
      });
      setPeaceSent(true);
      toast.push({ kind: "ok", title: `已经给${familyLabel}报平安`, detail: "消息已发到家人端。" });
      speakNow(`已经给${familyLabel}报平安了，您放心。`);
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "消息没发出去",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusy(false);
    }
  }

  async function switchIdentity() {
    await logout();
    nav("/", { replace: true });
  }

  function readNotice() {
    if (!familyNotice) return;
    stopSpeaking();
    speakNow(`${familyNotice.familyName}给您留言：${familyNotice.content}`);
  }

  async function acknowledgeNotice() {
    try {
      await api.elderMessages.list();
    } catch {
      // 标记已读失败也先收起提醒，避免挡住主界面。
    }
    setFamilyNotice(null);
    setNoticeCount(0);
  }

  return (
    <div className="ys-kiosk">
      <header className="ys-kioskTop">
        <div className="ys-kioskBrand">
          <span className="ys-kioskBrandMark" />
          <span>
            <strong>银龄守护</strong>
            <small>陪伴屏 · 水韵江苏</small>
          </span>
        </div>
        <div className="ys-kioskStatus">
          <span className="ys-kioskDot" />
          {brief?.engine === "rules+llm" ? "AI 陪伴中" : "守护中"}
        </div>
        <button
          type="button"
          className="ys-kioskA11y"
          onClick={() => window.dispatchEvent(new CustomEvent("yl:open-a11y"))}
          aria-label="打开无障碍工具"
        >
          <Icon name="settings" size="sm" />
          <span>无障碍</span>
        </button>
        <button type="button" className="ys-kioskSwitch" onClick={() => void switchIdentity()}>
          <Icon name="logOut" size="sm" />
          切换
        </button>
      </header>

      <main className="ys-kioskMain" id="main" tabIndex={-1}>
        <section className="ys-kioskHello">
          <div className="ys-kioskClockRow">
            <div>
              <p className="ys-kioskDate">{dateText(now)}</p>
              <h1>
                {greeting(now.getHours())}，{name}
              </h1>
            </div>
            <time className="ys-kioskClock" dateTime={now.toISOString()}>
              {clockText(now)}
            </time>
          </div>

          <div className="ys-kioskBrief">
            <span className="ys-kioskBriefBadge">
              <Icon name="sparkles" size="sm" />
              {briefState === "loading" ? "先看这些" : "AI 今日简报"}
            </span>
            <p>{briefText}</p>
            <button type="button" className="ys-kioskBriefVoice" onClick={readBrief}>
              <Icon name="volume" size="sm" />
              念给我听
            </button>
          </div>
        </section>

        {familyNotice ? (
          <section className="ys-kioskMessage" aria-live="polite" aria-label="家人的新留言">
            <span className="ys-kioskMessageIcon">
              <Icon name="message" size="lg" />
            </span>
            <div className="ys-kioskMessageBody">
              <strong>
                {familyNotice.familyName}给您留言
                {noticeCount > 1 ? `（还有 ${noticeCount} 条）` : ""}
              </strong>
              <p>{familyNotice.content}</p>
            </div>
            <div className="ys-kioskMessageActions">
              <button type="button" className="ys-kioskMessageRead" onClick={readNotice}>
                <Icon name="volume" size="sm" />
                念给我听
              </button>
              <button type="button" className="ys-kioskMessageDone" onClick={() => void acknowledgeNotice()}>
                知道了
              </button>
            </div>
          </section>
        ) : null}

        <section className="ys-kioskTalk">
          <button
            type="button"
            className="ys-kioskTalkBtn"
            onClick={() => setChatOpen(true)}
            aria-label="按一下，和 AI 小助手说话"
          >
            <span className="ys-kioskTalkRing" />
            <span className="ys-kioskTalkIcon">
              <Icon name="mic" size={44} />
            </span>
            <strong>按一下，和我说话</strong>
            <small>不用打字，慢慢说</small>
          </button>
          <p className="ys-kioskTalkHint">
            不知道怎么说？就说“今天吃什么”“有人让我转账”“我找不到家了”。
          </p>
        </section>

        <section className="ys-kioskGrid" aria-label="四个常用功能">
          <Link to="/elder/meds" className="ys-kioskTile ys-kioskTile--med">
            <span className="ys-kioskTileIcon"><Icon name="pill" size="lg" /></span>
            <span className="ys-kioskTileKicker">吃药</span>
            <strong>
              {!medsReady ? "正在查看" : due === 0 ? "还没有计划" : remaining === 0 ? "今天都吃了" : `还有 ${remaining} 次`}
            </strong>
            <small>
              {!medsReady ? "稍等一下" : due === 0 ? "可以拍药盒问我" : `今天已吃 ${taken} 次`}
            </small>
          </Link>

          <Link to="/elder/safety/scam" className="ys-kioskTile ys-kioskTile--scam">
            <span className="ys-kioskTileIcon"><Icon name="shieldCheck" size="lg" /></span>
            <span className="ys-kioskTileKicker">防骗</span>
            <strong>先别转账</strong>
            <small>把话或截图给我看</small>
          </Link>

          <Link to="/elder/diet" className="ys-kioskTile ys-kioskTile--diet">
            <span className="ys-kioskTileIcon"><Icon name="heart" size="lg" /></span>
            <span className="ys-kioskTileKicker">吃饭</span>
            <strong>{dietState === "ready" && dietPlan ? "按身体配好了" : "今天吃什么"}</strong>
            <small>
              {dietState === "loading"
                ? "正在按身体情况配餐"
                : dietPlan?.headline ?? "按血压、血糖搭配"}
            </small>
          </Link>

          <Link to="/elder/safety/help" className="ys-kioskTile ys-kioskTile--home">
            <span className="ys-kioskTileIcon"><Icon name="mapPin" size="lg" /></span>
            <span className="ys-kioskTileKicker">找不到家</span>
            <strong>按一下，通知家人</strong>
            <small>会把最后位置发给家人</small>
          </Link>
        </section>

        <footer className="ys-kioskFooter">
          <button
            type="button"
            className={`ys-kioskPeace ${peaceSent ? "is-sent" : ""}`}
            disabled={busy || peaceSent}
            onClick={() => void sendPeace()}
          >
            <Icon name={peaceSent ? "circleCheck" : "message"} size="sm" />
            {peaceSent ? `已给${familyLabel}报平安` : `给${familyLabel}报平安`}
          </button>
          <Link to="/elder/story" className="ys-kioskFootLink">
            <Icon name="bookOpen" size="sm" />
            我的回忆
          </Link>
          <Link to="/elder/today" className="ys-kioskFootLink">
            <Icon name="layoutGrid" size="sm" />
            更多功能
          </Link>
        </footer>
      </main>

      {chatOpen && (
        <div className="ys-kioskChatOverlay" role="dialog" aria-modal="true" aria-label="和 AI 小助手说话">
          <div className="ys-kioskChatCard">
            <ChatPanel
              variant="kiosk"
              autoSpeak
              autoStartVoice
              muted={!voiceEnabled}
              onToggleMute={toggleVoice}
              onClose={() => {
                setChatOpen(false);
                stopSpeaking();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
