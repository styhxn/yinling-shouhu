import React from "react";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { FamilyConfirm, FamilySummary, WeeklyReport } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";
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

export function FamilyDashboardPage() {
  const { me } = useAuth();
  const toast = useToast();
  const elderId = me?.familyLinks[0]?.elderId ?? "";
  const [summary, setSummary] = React.useState<FamilySummary | null>(null);
  const [report, setReport] = React.useState<WeeklyReport | null>(null);
  const [items, setItems] = React.useState<FamilyConfirm[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function load() {
    if (!elderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, reportRes, pendingRes] = await Promise.all([
        api.family.summary(elderId),
        api.family.weeklyReport(elderId),
        api.safety.pendingConfirms(elderId)
      ]);
      setSummary(summaryRes.summary);
      setReport(reportRes.report);
      setItems(pendingRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, [elderId]);

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
