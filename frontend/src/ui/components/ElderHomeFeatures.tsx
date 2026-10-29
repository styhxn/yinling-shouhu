import React from "react";
import { Icon } from "./Icon.js";
import { useToast } from "../state/toast.js";
import { useRealtime } from "../state/realtime.js";
import { speakNow } from "../voice/tts.js";
import { api } from "../../lib/api.js";
import type { AgentBrief, ElderMessage } from "../../lib/types.js";
import "./elderFeatures.css";

/* 健康记录存在本机，不上传 */
const HEALTH_KEY = "yl-health-records";
type HealthRecord = {
  ts: number;
  systolic?: number;
  diastolic?: number;
  glucose?: number;
};

function loadHealth(): HealthRecord[] {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (raw) return JSON.parse(raw) as HealthRecord[];
  } catch {
    /* ignore */
  }
  return [];
}

type FamilyMember = {
  familyUserId: string;
  displayName: string;
  relation: string | null;
  phone: string | null;
};

const RELATION_LABELS: Record<string, string> = {
  daughter: "女儿",
  son: "儿子",
  wife: "妻子",
  husband: "丈夫",
  father: "父亲",
  mother: "母亲",
  grandchild: "孙辈",
  brother: "兄弟",
  sister: "姐妹",
  caregiver: "照护者",
  relative: "亲属"
};

function relationLabel(r: string | null): string {
  if (!r) return "家属";
  return RELATION_LABELS[r] ?? r;
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return "暂无";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* 附近医院 / 药店 / 公园（演示数据，仅展示电话，网页无法直接拨号） */
const NEARBY = [
  { name: "玄武社区卫生服务中心", dist: "距您约 800 米", tag: "看病开药", phone: "02587654321" },
  { name: "老百姓大药房", dist: "距您约 1.2 公里", tag: "买常用药", phone: "02587651234" },
  { name: "社区小公园", dist: "步行约 5 分钟", tag: "散步晒太阳", phone: "" }
];

function bpStatus(r: HealthRecord): { text: string; cls: string } {
  if (typeof r.systolic === "number") {
    if (r.systolic >= 140) return { text: "偏高", cls: "is-high" };
    if (r.systolic <= 90) return { text: "偏低", cls: "is-low" };
  }
  return { text: "正常", cls: "is-ok" };
}

export function ElderHomeFeatures({ brief }: { brief?: AgentBrief | null }) {
  const toast = useToast();
  const [members, setMembers] = React.useState<FamilyMember[]>([]);
  const [membersLoaded, setMembersLoaded] = React.useState(false);
  const [msgOpen, setMsgOpen] = React.useState(false);
  const [contactsOpen, setContactsOpen] = React.useState(false);
  const [msgText, setMsgText] = React.useState(
    "家人您好，我在银龄守护里想联系您，麻烦您登录系统看看我。"
  );
  const [sendingTo, setSendingTo] = React.useState<string | null>(null);

  const [records, setRecords] = React.useState<HealthRecord[]>(() => loadHealth());
  const [systolic, setSystolic] = React.useState("");
  const [diastolic, setDiastolic] = React.useState("");
  const [glucose, setGlucose] = React.useState("");
  const [waterOn, setWaterOn] = React.useState(false);
  const waterTimer = React.useRef<number | null>(null);

  const { lastEvent } = useRealtime();
  const [inbox, setInbox] = React.useState<ElderMessage[]>([]);
  const [inboxLoading, setInboxLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setInboxLoading(true);
    api
      .elderMessages
      .list()
      .then((res) => {
        if (alive && res.ok) setInbox(res.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setInboxLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!lastEvent || lastEvent.type !== "elder.message") return;
    api
      .elderMessages
      .list()
      .then((res) => {
        if (res.ok) setInbox(res.items);
      })
      .catch(() => undefined);
  }, [lastEvent]);

  React.useEffect(() => {
    let alive = true;
    api
      .family.members()
      .then((res) => {
        if (alive && res.ok) {
          setMembers(res.members);
        }
        if (alive) setMembersLoaded(true);
      })
      .catch(() => {
        if (alive) setMembersLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  function saveHealth() {
    const s = systolic.trim() ? Number(systolic) : NaN;
    const d = diastolic.trim() ? Number(diastolic) : NaN;
    const g = glucose.trim() ? Number(glucose) : NaN;
    if (Number.isNaN(s) && Number.isNaN(d) && Number.isNaN(g)) {
      toast.push({ kind: "normal", title: "先填一项再保存", detail: "血压或血糖填一个就可以。" });
      return;
    }
    const rec: HealthRecord = { ts: Date.now() };
    if (!Number.isNaN(s)) rec.systolic = s;
    if (!Number.isNaN(d)) rec.diastolic = d;
    if (!Number.isNaN(g)) rec.glucose = g;
    const next = [rec, ...records].slice(0, 10);
    setRecords(next);
    try {
      localStorage.setItem(HEALTH_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setSystolic("");
    setDiastolic("");
    setGlucose("");
    toast.push({ kind: "ok", title: "已记录", detail: "数据只存在您这台设备上。" });
  }

  function toggleWater() {
    if (waterOn) {
      if (waterTimer.current) window.clearInterval(waterTimer.current);
      waterTimer.current = null;
      setWaterOn(false);
      toast.push({ kind: "normal", title: "已关闭喝水提醒" });
    } else {
      setWaterOn(true);
      toast.push({ kind: "ok", title: "已开启喝水提醒", detail: "每两小时提醒您喝口水。" });
      waterTimer.current = window.setInterval(() => {
        toast.push({ kind: "normal", title: "该喝水啦", detail: "喝一小杯温水，对身体好。" });
      }, 2 * 60 * 60 * 1000);
    }
  }

  React.useEffect(
    () => () => {
      if (waterTimer.current) window.clearInterval(waterTimer.current);
    },
    []
  );

  function listenBrief() {
    if (!brief) return;
    const text = [
      brief.greeting,
      brief.summary,
      ...brief.items.map((it) => `${it.title}：${it.detail}`)
    ].join("。");
    speakNow(text);
  }

  async function sendTo(member: FamilyMember) {
    if (sendingTo) return;
    setSendingTo(member.familyUserId);
    try {
      const res = await api.family.sendMessage({
        familyUserId: member.familyUserId,
        content: msgText,
        kind: "contact"
      });
      if (res.ok) {
        toast.push({
          kind: "ok",
          title: `已发送给${relationLabel(member.relation)} ${member.displayName}`,
          detail: "消息已送到 TA 的账号，TA 登录就能看到。"
        });
      } else {
        toast.push({ kind: "danger", title: "发送失败", detail: "请稍后再试一次。" });
      }
    } catch {
      toast.push({ kind: "danger", title: "发送失败", detail: "请稍后再试一次。" });
    } finally {
      setSendingTo(null);
    }
  }

  async function sendToAll() {
    if (sendingTo || members.length === 0) return;
    setSendingTo("__all__");
    try {
      let okCount = 0;
      for (const m of members) {
        const res = await api.family.sendMessage({
          familyUserId: m.familyUserId,
          content: msgText,
          kind: "contact"
        });
        if (res.ok) okCount += 1;
      }
      if (okCount > 0) {
        toast.push({
          kind: "ok",
          title: `已通知 ${okCount} 位家属`,
          detail: "消息已送到他们的账号。"
        });
      } else {
        toast.push({ kind: "danger", title: "发送失败", detail: "请稍后再试一次。" });
      }
    } catch {
      toast.push({ kind: "danger", title: "发送失败", detail: "请稍后再试一次。" });
    } finally {
      setSendingTo(null);
    }
  }

  async function copyPhone(phone: string, label: string) {
    try {
      await navigator.clipboard.writeText(phone);
      toast.push({ kind: "ok", title: "已复制号码", detail: `${label}：${phone}` });
    } catch {
      toast.push({ kind: "normal", title: label, detail: phone });
    }
  }

  return (
    <section className="ys-featureSection" aria-label="长辈贴心小帮手">
      <h2 className="ys-featureTitle">长辈贴心小帮手</h2>
      <p className="ys-featureSub">这几样常用的，点一下就行，不用打字。</p>

      <div className="ys-featureGrid">
        {/* 听简报 */}
        <div className="ys-featureCard">
          <span className="ys-featureIcon">
            <Icon name="volume" size="lg" />
          </span>
          <h3>听简报</h3>
          <p>眼睛累了就听着，小助手把今日安排念给您听。</p>
          <button
            type="button"
            className="btn ys-featureAction"
            onClick={listenBrief}
            disabled={!brief}
          >
            念给我听
          </button>
        </div>

        {/* 一键联系家属（替代拨打电话：给家属账号发消息） */}
        <div className="ys-featureCard ys-featureCard--sos">
          <span className="ys-featureIcon">
            <Icon name="message" size="lg" />
          </span>
          <div>
            <h3>一键联系家属</h3>
            <p>不方便打电话，就给家人的账号发条消息。</p>
          </div>
          <button
            type="button"
            className="btn btnDanger ys-featureAction"
            onClick={() => setMsgOpen(true)}
          >
            发消息给家属
          </button>
        </div>

        {/* 记录健康 */}
        <div className="ys-featureCard">
          <span className="ys-featureIcon">
            <Icon name="activity" size="lg" />
          </span>
          <h3>记录健康</h3>
          <p>量了血压、血糖，顺手记下来。</p>
          <div className="ys-healthForm">
            <label>
              高压
              <input
                className="input"
                inputMode="numeric"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                placeholder="如 128"
              />
            </label>
            <label>
              低压
              <input
                className="input"
                inputMode="numeric"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                placeholder="如 80"
              />
            </label>
            <label>
              血糖
              <input
                className="input"
                inputMode="decimal"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value)}
                placeholder="如 6.1"
              />
            </label>
          </div>
          <button type="button" className="btn ys-featureAction" onClick={saveHealth}>
            保存记录
          </button>
          {records.length > 0 && (
            <ul className="ys-healthList">
              {records.slice(0, 3).map((r) => {
                const st = bpStatus(r);
                return (
                  <li key={r.ts}>
                    <span>
                      {new Date(r.ts).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    <span>
                      {r.systolic ?? "—"}/{r.diastolic ?? "—"}
                    </span>
                    <span>{r.glucose ? `${r.glucose}` : "—"}</span>
                    <span className={`ys-tag ${st.cls}`}>{st.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 常用电话与联系人（查看，不拨号） */}
        <div className="ys-featureCard ys-featureCard--contacts">
          <span className="ys-featureIcon">
            <Icon name="phone" size="lg" />
          </span>
          <h3>常用电话与联系人</h3>
          <p>家属留下的电话、附近的医院药店，点开就能看。</p>
          <button
            type="button"
            className="btn ys-featureAction"
            onClick={() => setContactsOpen(true)}
          >
            查看联系电话
          </button>
        </div>

        {/* 喝水提醒 */}
        <div className="ys-featureCard">
          <span className="ys-featureIcon">
            <Icon name="bell" size="lg" />
          </span>
          <h3>喝水提醒</h3>
          <p>年纪大了容易忘喝水，定时提醒您。</p>
          <button
            type="button"
            className={`btn ys-featureAction ${waterOn ? "btnDanger" : ""}`}
            onClick={toggleWater}
            aria-pressed={waterOn}
          >
            {waterOn ? "已开启，点此关闭" : "提醒我喝水"}
          </button>
        </div>
      </div>

      {/* 家属的留言（收件箱）：展示家属发来的站内消息 */}
      <section className="ys-featureSection" aria-label="家属的留言">
        <h2 className="ys-featureTitle">家属的留言</h2>
        <p className="ys-featureSub">家人给您发的消息都在这里，新的会标“新”。</p>
        {inboxLoading ? (
          <p className="ys-mutedText">正在读取留言…</p>
        ) : inbox.length === 0 ? (
          <div className="ys-emptyBlock ys-emptyBlock--inline">
            <Icon name="message" size="lg" />
            <strong>还没有留言</strong>
            <p>家人发消息给您后，会显示在这里。</p>
          </div>
        ) : (
          <div className="ys-messageList">
            {inbox.map((m) => (
              <article
                key={m.id}
                className={`ys-messageCard ${
                  m.fromRole === "elder" ? "ys-messageCard--mine" : ""
                } ${!m.read && m.fromRole === "family" ? "ys-messageCard--unread" : ""}`}
              >
                <div className="ys-messageTop">
                  <span className="ys-messageFrom">
                    {m.fromRole === "family" ? m.familyName : "我"}
                  </span>
                  {!m.read && m.fromRole === "family" && (
                    <span className="ys-messageBadge">新</span>
                  )}
                  <span className="ys-messageTime">{formatTime(m.createdAt)}</span>
                </div>
                <p className="ys-messageContent">{m.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 弹窗一：给家属发消息 */}
      {msgOpen && (
        <div
          className="yl-modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="给家属发消息"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setMsgOpen(false);
          }}
        >
          <div className="yl-modal ys-contactModal ys-msgModal">
            <div className="ys-modalHead">
              <span className="ys-modalHeadIcon">
                <Icon name="message" size="lg" />
              </span>
              <h2>给家属发消息</h2>
            </div>
            <p className="ys-contactHint">
              网页不能直接打电话，这里把消息送到家属的账号，TA 登录就能看到。
            </p>

            <h3 className="ys-contactSub">想对家属说的话</h3>
            <textarea
              className="input ys-msgInput"
              value={msgText}
              maxLength={500}
              rows={4}
              onChange={(e) => setMsgText(e.target.value)}
              aria-label="想对家属说的话"
            />

            <h3 className="ys-contactSub">选择要发送的家属</h3>
            {membersLoaded && members.length === 0 && (
              <p className="ys-contactEmpty">暂未关联家属账号。</p>
            )}
            <div className="ys-contactList">
              {members.map((m) => (
                <div key={m.familyUserId} className="ys-contactItem">
                  <div className="ys-contactItemMain">
                    <strong>{m.displayName}</strong>
                    <small>{relationLabel(m.relation)}</small>
                  </div>
                  <button
                    type="button"
                    className="btn ys-featureAction"
                    disabled={sendingTo !== null}
                    onClick={() => void sendTo(m)}
                  >
                    {sendingTo === m.familyUserId ? "发送中…" : "发消息"}
                  </button>
                </div>
              ))}
            </div>
            {members.length > 1 && (
              <button
                type="button"
                className="btn btnDanger ys-featureAction"
                disabled={sendingTo !== null}
                onClick={() => void sendToAll()}
              >
                {sendingTo === "__all__" ? "发送中…" : "一键通知全部家属"}
              </button>
            )}

            <button type="button" className="btn" onClick={() => setMsgOpen(false)}>
              关掉
            </button>
          </div>
        </div>
      )}

      {/* 弹窗二：查看联系电话与联系人 */}
      {contactsOpen && (
        <div
          className="yl-modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="常用电话与联系人"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setContactsOpen(false);
          }}
        >
          <div className="yl-modal ys-contactModal ys-phoneModal">
            <div className="ys-modalHead">
              <span className="ys-modalHeadIcon">
                <Icon name="phone" size="lg" />
              </span>
              <h2>常用电话与联系人</h2>
            </div>
            <p className="ys-contactHint">
              网页不能直接拨号，号码可复制后手动拨打。
            </p>

            <h3 className="ys-contactSub">家属联系电话</h3>
            <ul className="ys-phoneList">
              {membersLoaded && members.length === 0 && (
                <li className="ys-phoneEmpty">暂未留下联系电话。</li>
              )}
              {members
                .filter((m) => m.phone)
                .map((m) => (
                  <li key={m.familyUserId} className="ys-phoneItem">
                    <div>
                      <strong>{m.displayName}</strong>
                      <small>{relationLabel(m.relation)}</small>
                    </div>
                    <span className="ys-phoneNum">{m.phone}</span>
                    <button
                      type="button"
                      className="ys-copyBtn"
                      onClick={() => void copyPhone(m.phone as string, `${m.displayName}电话`)}
                      aria-label="复制号码"
                    >
                      <Icon name="copy" size="sm" />
                      复制
                    </button>
                  </li>
                ))}
            </ul>

            <h3 className="ys-contactSub">附近的医院 · 药店</h3>
            <ul className="ys-phoneList">
              {NEARBY.map((n) => (
                <li key={n.name} className="ys-phoneItem">
                  <div>
                    <strong>{n.name}</strong>
                    <small>
                      {n.dist} · {n.tag}
                    </small>
                  </div>
                  {n.phone ? (
                    <>
                      <span className="ys-phoneNum">{n.phone}</span>
                      <button
                        type="button"
                        className="ys-copyBtn"
                        onClick={() => void copyPhone(n.phone as string, n.name)}
                        aria-label="复制号码"
                      >
                        <Icon name="copy" size="sm" />
                        复制
                      </button>
                    </>
                  ) : (
                    <span className="ys-phoneNone">走走就好</span>
                  )}
                </li>
              ))}
            </ul>

            <button type="button" className="btn" onClick={() => setContactsOpen(false)}>
              关掉
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
