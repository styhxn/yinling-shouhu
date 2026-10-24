import React from "react";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { FamilyConfirm } from "../../lib/types.js";
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

export function FamilyDashboardPage() {
  const { me } = useAuth();
  const toast = useToast();
  const elderId = me?.familyLinks[0]?.elderId ?? "";
  const [items, setItems] = React.useState<FamilyConfirm[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.safety.pendingConfirms(elderId || undefined);
      setItems(res.items);
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
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      toast.push({
        kind: decision === "denied" ? "ok" : "normal",
        title: decision === "denied" ? "已阻止这次转账" : "已确认",
        detail: decision === "denied" ? "已记录为高风险事件。" : "请继续保持电话畅通。"
      });
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

  return (
    <div className="yl-page">
      <section className="yl-pageHeader">
        <div>
          <h1>家属概览</h1>
          <p>高风险操作会在这里等您确认。看到“转账确认”请先打电话核实。</p>
        </div>
        <button type="button" className="btn" onClick={() => void load()}>
          <Icon name="refresh" size="sm" />
          刷新
        </button>
      </section>

      <section className="yl-summaryGrid">
        <div className="yl-summaryCard">
          <span className="yl-summaryLabel">待确认</span>
          <strong>{items.length}</strong>
          <small>高风险操作</small>
        </div>
        <div className="yl-summaryCard">
          <span className="yl-summaryLabel">已绑定老人</span>
          <strong>{elderId || "未绑定"}</strong>
          <small>演示账号：李奶奶</small>
        </div>
        <div className="yl-summaryCard">
          <span className="yl-summaryLabel">安全提示</span>
          <strong>96110</strong>
          <small>反诈专线</small>
        </div>
      </section>

      <section className="yl-panel">
        <div className="yl-sectionTitle">
          <Icon name="shieldCheck" size="sm" />
          待确认事项
        </div>

        {loading ? (
          <div className="yl-loading">正在读取…</div>
        ) : error ? (
          <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div>
        ) : items.length === 0 ? (
          <div className="yl-emptyState yl-emptyState--compact">
            <Icon name="check" size="xl" />
            <strong>暂时没有待确认事项</strong>
            <p>如果老人发起转账，确认请求会出现在这里。</p>
          </div>
        ) : (
          <div className="yl-confirmList">
            {items.map((item) => (
              <article key={item.id} className="yl-confirmCard">
                <div className="yl-confirmTop">
                  <span className="yl-confirmType">{TYPE_LABEL[item.type] ?? item.type}</span>
                  <span className="yl-confirmTime">
                    {new Date(item.createdAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
                <p className="yl-confirmDesc">{describePayload(item.payload)}</p>
                <div className="yl-inlineActions">
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
    </div>
  );
}
