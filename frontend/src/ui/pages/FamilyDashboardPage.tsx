import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type {
  AgentBrief,
  FamilyConfirm,
  FamilyMessage,
  FamilySummary,
  SafetyAlert,
  WeeklyReport
} from "../../lib/types.js";
import { useAuth } from "../state/auth.js";
import { useRealtime } from "../state/realtime.js";
import { useToast } from "../state/toast.js";

const TYPE_LABEL: Record<string, string> = {
  transfer: "转账确认",
  medication: "用药变更",
  poster: "寻人海报",
  emergency: "紧急呼救"
};

function describePayload(payload: Record<string, unknown>) {
  const amount = typeof payload.amount === "number" ? `金额 ¥${payload.amount}` : "";
  const counterparty = typeof payload.counterparty === "string" ? `对方：${payload.counterparty}` : "";
  const reason = typeof payload.reason === "string" ? `理由：${payload.reason}` : "";
  return [amount, counterparty, reason].filter(Boolean).join(" · ") || "请点开与家人确认";
}

function formatTime(ts: number | null | undefined) {
  if (!ts) return "暂无";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function alertLabel(type: string) {
  if (type === "geofence.exit") return "离开安全区域";
  if (type === "scam.high") return "高风险信息";
  if (type === "cooling_off") return "转账冷静期";
  return "安全提醒";
}

function alertDetail(alert: SafetyAlert) {
  const payload = alert.payload ?? {};
  if (alert.type === "geofence.exit") {
    const name = typeof payload.geofenceName === "string" ? payload.geofenceName : "安全区域";
    const distance =
      typeof payload.distanceMeters === "number" ? `，距离约 ${payload.distanceMeters} 米` : "";
    return `已离开${name}${distance}`;
  }
  if (alert.type === "scam.high") return "检测到高风险信息，请尽快电话确认";
  if (alert.type === "cooling_off") return "转账处于冷静期，等待家属处理";
  return "";
}

export function FamilyDashboardPage() {
  const { me } = useAuth();
  const toast = useToast();
  const elderId = me?.familyLinks[0]?.elderId ?? "";
  const [summary, setSummary] = React.useState<FamilySummary | null>(null);
  const [report, setReport] = React.useState<WeeklyReport | null>(null);
  const [brief, setBrief] = React.useState<AgentBrief | null>(null);
  const [items, setItems] = React.useState<FamilyConfirm[]>([]);
  const [messages, setMessages] = React.useState<FamilyMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [alertBusyId, setAlertBusyId] = React.useState<string | null>(null);
  const { lastEvent } = useRealtime();
  const refreshTimerRef = React.useRef<number | null>(null);

  async function load(silent = false) {
    if (!elderId) {
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [summaryRes, reportRes, pendingRes, messagesRes] = await Promise.all([
        api.family.summary(elderId),
        api.family.weeklyReport(elderId),
        api.safety.pendingConfirms(elderId),
        api.family.messages()
      ]);
      setSummary(summaryRes.summary);
      setReport(reportRes.report);
      setItems(pendingRes.items);
      setMessages(messagesRes.items);
      void api.agent
        .brief({ elderId })
        .then((res) => setBrief(res.brief))
        .catch(() => undefined);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, [elderId]);

  React.useEffect(() => {
    const event = lastEvent;
    if (!event) return;
    const relevant = new Set([
      "safety.alert",
      "safety.alert.updated",
      "family.confirm.requested",
      "family.confirm.responded",
      "family.message",
      "location.updated",
      "emergency.triggered"
    ]);
    if (!relevant.has(event.type) || !elderId) return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void load(true);
    }, 350);
  }, [lastEvent, elderId]);

  React.useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  async function respond(item: FamilyConfirm, decision: "approved" | "denied") {
    setBusyId(item.id);
    try {
      await api.safety.respondConfirm(
        item.id,
        decision,
        decision === "denied" ? "家属判断为诈骗，已阻止" : "家属已核实"
      );
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      toast.push({
        kind: decision === "denied" ? "ok" : "normal",
        title: decision === "denied" ? "已阻止这次转账" : "已确认",
        detail: decision === "denied" ? "已记录为高风险事件。" : "请继续保持电话畅通。"
      });
      await load();
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "处理失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function resolveAlert(alert: SafetyAlert) {
    setAlertBusyId(alert.id);
    try {
      await api.safety.ackAlert(alert.id, "ack");
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              alerts: {
                open: Math.max(0, prev.alerts.open - 1),
                items: prev.alerts.items.filter((item) => item.id !== alert.id)
              }
            }
          : prev
      );
      toast.push({ kind: "ok", title: "已标记为处理" });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "处理失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setAlertBusyId(null);
    }
  }

  if (!elderId) {
    return (
      <div className="yl-page">
        <div className="ys-emptyBlock">
          <Icon name="users" size="xl" />
          <strong>还没有绑定老人</strong>
          <p>请让家属账号绑定需要照护的老人。</p>
        </div>
      </div>
    );
  }

  const adherence = summary?.medications.adherencePct;

  return (
    <div className="yl-page ys-familyPage">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">照护概览</p>
          <h1>{summary?.elder.displayName ?? "家人"}</h1>
          <p>位置、用药、安全和本周照护简报，都在这一页。</p>
        </div>
        <button type="button" className="btn" onClick={() => void load()}>
          <Icon name="refresh" size="sm" />
          刷新
        </button>
      </section>

      {loading ? (
        <p className="ys-mutedText">正在读取照护数据…</p>
      ) : error ? (
        <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div>
      ) : (
        <>
          <section className="ys-summaryStrip">
            <div className="ys-summaryItem">
              <span>位置</span>
              <strong>{summary?.location ? "已更新" : "暂无"}</strong>
              <small>{formatTime(summary?.location?.ts)}</small>
            </div>
            <div className="ys-summaryItem">
              <span>用药</span>
              <strong>{adherence === null || typeof adherence === "undefined" ? "暂无记录" : `${adherence}%`}</strong>
              <small>
                今日 {summary?.medications.taken ?? 0}/{summary?.medications.dueToday ?? 0} 次
              </small>
            </div>
            <div className="ys-summaryItem">
              <span>安全提醒</span>
              <strong>{summary?.alerts.open ?? 0}</strong>
              <small>{summary?.alerts.open ? "需要查看" : "暂无"}</small>
            </div>
            <div className="ys-summaryItem">
              <span>记忆</span>
              <strong>{summary?.memoryCount ?? 0}</strong>
              <small>段回忆</small>
            </div>
          </section>

          {brief && (
            <section className="ys-panel ys-familyBrief">
              <div className="ys-sectionTitle">
                <Icon name="sparkles" size="sm" />
                AI 今日简报
                <span className="ys-aiPriority ys-aiPriority--today" style={{ marginLeft: "auto" }}>
                  {brief.engine === "rules+llm" ? "模型整理" : "规则整理"}
                </span>
              </div>
              <h2>{brief.summary}</h2>
              <p className="ys-mutedText">
                {brief.greeting}。{brief.encouragement}
              </p>
              {brief.items.length > 0 && (
                <div className="ys-familyBriefItems">
                  {brief.items.map((item) => (
                    <div key={item.title} className="ys-familyBriefItem">
                      <span>{item.priority === "now" ? "现在" : item.priority === "today" ? "今天" : "有空时"}</span>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}
              {brief.traceId && (
                <Link to={`/family/trace/${brief.traceId}`} className="yl-traceLink">
                  <Icon name="sparkles" size="sm" />
                  查看 AI 决策依据
                </Link>
              )}
            </section>
          )}

          {messages.length > 0 && (
            <section className="ys-panel">
              <div className="ys-sectionTitle">
                <Icon name="message" size="sm" />
                来自老人的消息
              </div>
              <div className="ys-messageList">
                {messages.map((m) => (
                  <article
                    key={m.id}
                    className={`ys-messageCard ${m.read ? "" : "ys-messageCard--unread"}`}
                  >
                    <div className="ys-messageTop">
                      <span className="ys-messageFrom">{m.elderName}</span>
                      {!m.read && <span className="ys-messageBadge">新</span>}
                      <span className="ys-messageTime">{formatTime(m.createdAt)}</span>
                    </div>
                    <p className="ys-messageContent">{m.content}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {summary && summary.alerts.items.length > 0 ? (
            <section className="ys-panel">
              <div className="ys-sectionTitle">
                <Icon name="alertTriangle" size="sm" />
                安全提醒
              </div>
              <div className="ys-alertList">
                {summary.alerts.items.map((alert) => (
                  <div key={alert.id} className="ys-alertItem">
                    <span className="ys-alertDot" />
                    <div className="ys-alertBody">
                      <strong>{alertLabel(alert.type)}</strong>
                      <small>{formatTime(alert.createdAt)}</small>
                      {alertDetail(alert) ? <p>{alertDetail(alert)}</p> : null}
                      {alert.payload.assessment ? (
                        <div className="ys-alertAssessment">
                          <span className="ys-aiPriority ys-aiPriority--today">
                            守护 Agent · {alert.payload.assessment.riskLevel === "high" ? "高风险" : "已研判"}
                          </span>
                          <p>{alert.payload.assessment.summary}</p>
                          <Link
                            to={`/family/trace/${alert.payload.assessment.traceId}`}
                            className="yl-traceLink"
                          >
                            <Icon name="sparkles" size="sm" />
                            查看 AI 决策依据
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={alertBusyId === alert.id}
                      onClick={() => void resolveAlert(alert)}
                    >
                      {alertBusyId === alert.id ? "处理中…" : "已处理"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="ys-report">
            <div className="ys-reportHead">
              <div>
                <span className="ys-kicker">本周照护简报</span>
                <h2>{report?.summary ?? "本周简报生成中"}</h2>
              </div>
              <span className="ys-reportPeriod">
                {report ? `${formatTime(report.period.from)} - ${formatTime(report.period.to)}` : ""}
              </span>
            </div>
            {report && (
              <>
                <div className="ys-reportGrid">
                  {report.sections.map((section) => (
                    <div key={section.title} className="ys-reportSection">
                      <strong>{section.title}</strong>
                      <p>{section.content}</p>
                    </div>
                  ))}
                </div>
                <div className="ys-reportSuggestions">
                  <strong>建议</strong>
                  <ul>
                    {report.suggestions.map((suggestion) => (
                      <li key={suggestion}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
                <p className="ys-finePrint">{report.disclaimer}</p>
              </>
            )}
          </section>

          <section className="ys-panel">
            <div className="ys-sectionTitle">
              <Icon name="shieldCheck" size="sm" />
              待确认事项
            </div>
            {items.length === 0 ? (
              <div className="ys-emptyBlock ys-emptyBlock--inline">
                <Icon name="check" size="lg" />
                <strong>暂时没有待确认事项</strong>
                <p>老人发起转账时，确认请求会出现在这里。</p>
              </div>
            ) : (
              <div className="ys-confirmList">
                {items.map((item) => (
                  <article key={item.id} className="ys-confirmCard">
                    <div className="ys-confirmTop">
                      <span className="ys-confirmType">{TYPE_LABEL[item.type] ?? item.type}</span>
                      <span className="ys-confirmTime">{formatTime(item.createdAt)}</span>
                    </div>
                    <p className="ys-confirmDesc">{describePayload(item.payload)}</p>
                    <div className="ys-inlineActions">
                      <button
                        type="button"
                        className="btn btnDanger"
                        disabled={busyId === item.id}
                        onClick={() => void respond(item, "denied")}
                      >
                        拒绝/阻止
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busyId === item.id}
                        onClick={() => void respond(item, "approved")}
                      >
                        确认
                      </button>
                      <a className="btn" href="tel:96110">
                        <Icon name="phone" size="sm" />
                        96110
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
