import React from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { AntiFraudHit, CoolingOff, FamilyConfirm, ScamResult } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";

const RISK_LABEL: Record<string, string> = {
  high: "高风险",
  medium: "中等风险",
  low: "低风险",
  unknown: "不确定"
};

const TYPE_LABEL: Record<string, string> = {
  impersonate_police: "冒充公检法",
  investment: "虚假投资",
  health_product: "保健品/医疗",
  part_time: "刷单兼职",
  customer_service: "冒充客服",
  loan: "虚假贷款",
  prize: "中奖/补贴",
  romance: "网络交友",
  other: "其他"
};

function CoolingOffPanel({
  cooling,
  busy,
  onRespond
}: {
  cooling: { coolingOff: CoolingOff; familyConfirm: FamilyConfirm };
  busy: boolean;
  onRespond: (action: "cancel" | "continue") => void;
}) {
  const [remaining, setRemaining] = React.useState(() =>
    Math.max(0, cooling.coolingOff.expiresAt - Date.now())
  );

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, cooling.coolingOff.expiresAt - Date.now()));
    }, 500);
    return () => window.clearInterval(timer);
  }, [cooling.coolingOff.expiresAt]);

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="yl-coolingPanel">
      <div className="yl-coolingTop">
        <Icon name="clock" size="lg" />
        <div>
          <strong>已暂停：转账冷静期</strong>
          <p>家人已收到确认请求。请不要转账，等家人确认。</p>
        </div>
        <span className="yl-coolingCount">{seconds > 0 ? `${seconds}s` : "已结束"}</span>
      </div>
      <div className="yl-coolingActions">
        <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => onRespond("cancel")}>
          取消转账
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => onRespond("continue")}>
          仍要继续（通知家人）
        </button>
      </div>
      <div className="yl-coolingMeta">
        状态：{cooling.coolingOff.status} · 家人确认：{cooling.familyConfirm.status}
      </div>
    </div>
  );
}

export function ScamCheckPage() {
  const [searchParams] = useSearchParams();
  const transferMode = searchParams.get("mode") === "transfer";
  const { me } = useAuth();
  const toast = useToast();
  const resultRef = React.useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = React.useState<"text" | "image" | "url">(
    transferMode ? "text" : "text"
  );
  const [text, setText] = React.useState(
    transferMode ? "对方让我把钱转到安全账户，还让我不要告诉家里人。" : ""
  );
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ScamResult | null>(null);
  const [related, setRelated] = React.useState<AntiFraudHit[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooling, setCooling] = React.useState<{
    coolingOff: CoolingOff;
    familyConfirm: FamilyConfirm;
  } | null>(null);
  const [coolingBusy, setCoolingBusy] = React.useState(false);

  const isElder = me?.user.role === "elder";

  async function analyze() {
    setError(null);
    if (tab === "text" && !text.trim()) {
      setError("请先粘贴或输入可疑文字");
      return;
    }
    if (tab === "url" && !url.trim()) {
      setError("请先输入可疑链接");
      return;
    }
    if (tab === "image" && !file) {
      setError("请先选择一张截图");
      return;
    }

    setBusy(true);
    setResult(null);
    setRelated([]);
    setCooling(null);
    try {
      let payload: { inputType: "text" | "url" | "image"; text?: string; url?: string; imageId?: string };
      if (tab === "image" && file) {
        const uploaded = await api.uploads.image(file, "scam");
        payload = { inputType: "image", imageId: uploaded.upload.id };
      } else if (tab === "url") {
        payload = { inputType: "url", url: url.trim() };
      } else {
        payload = { inputType: "text", text: text.trim() };
      }
      const res = await api.safety.checkScam(payload);
      setResult(res.result);
      setRelated(res.related ?? []);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "鉴定失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function startCoolingOff() {
    setCoolingBusy(true);
    try {
      const res = await api.safety.startCoolingOff({
        reason: text.trim() || result?.extractedText || "可疑转账"
      });
      setCooling({ coolingOff: res.coolingOff, familyConfirm: res.familyConfirm });
      toast.push({
        kind: "ok",
        title: "已通知家人",
        detail: "请先不要转账，等家人确认。"
      });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "启动失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setCoolingBusy(false);
    }
  }

  async function respondCoolingOff(action: "cancel" | "continue") {
    if (!cooling) return;
    setCoolingBusy(true);
    try {
      const res = await api.safety.respondCoolingOff(cooling.coolingOff.id, action);
      setCooling({ ...cooling, coolingOff: res.coolingOff });
      toast.push({
        kind: action === "cancel" ? "ok" : "normal",
        title: action === "cancel" ? "已取消转账" : "已通知家人继续确认",
        detail: action === "cancel" ? "这一步做得对。" : "家人会收到确认请求。"
      });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "操作失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setCoolingBusy(false);
    }
  }

  return (
    <div className="yl-page">
      <section className="yl-pageHeader">
        <div>
          <h1>可疑信息鉴定</h1>
          <p>把可疑的话、短信截图或链接发给我，我帮您看看有没有问题。</p>
        </div>
      </section>

      {transferMode && (
        <div className="yl-warnBanner">
          <Icon name="alertTriangle" size="lg" />
          <div>
            <strong>先停一下，不要转账</strong>
            <p>先把对方的话或截图发给我，再决定下一步。</p>
          </div>
        </div>
      )}

      <section className="yl-panel">
        <div className="yl-tabs">
          <button type="button" className={tab === "text" ? "yl-tab yl-tab--active" : "yl-tab"} onClick={() => setTab("text")}>
            粘贴文字
          </button>
          <button type="button" className={tab === "image" ? "yl-tab yl-tab--active" : "yl-tab"} onClick={() => setTab("image")}>
            上传截图
          </button>
          <button type="button" className={tab === "url" ? "yl-tab yl-tab--active" : "yl-tab"} onClick={() => setTab("url")}>
            可疑链接
          </button>
        </div>

        {tab === "text" && (
          <textarea
            className="input yl-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例如：我是警察，你涉嫌洗钱，把钱转到安全账户，不要告诉家里人……"
          />
        )}

        {tab === "url" && (
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴可疑链接，例如 http://..."
          />
        )}

        {tab === "image" && (
          <label className="yl-uploadBox">
            <Icon name="camera" size="xl" />
            <strong>{file ? file.name : "选择聊天/短信截图"}</strong>
            <span>支持 JPG/PNG/WebP，不超过 10MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <div className="yl-inlineActions">
          <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void analyze()}>
            <Icon name={busy ? "spinner" : "shieldCheck"} size="sm" className={busy ? "yl-spin" : ""} />
            {busy ? "鉴定中…" : "开始鉴定"}
          </button>
          <a className="btn" href="tel:96110">
            <Icon name="phone" size="sm" />
            拨打 96110
          </a>
        </div>

        {error ? <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div> : null}
      </section>

      {result && (
        <section ref={resultRef} className={`yl-resultPanel yl-risk--${result.riskLevel}`}>
          <div className="yl-resultHeader">
            <div>
              <span className="yl-riskBadge">{RISK_LABEL[result.riskLevel] ?? result.riskLevel}</span>
              <span className="yl-riskType">{TYPE_LABEL[result.scamType] ?? result.scamType}</span>
            </div>
            <span className="yl-confidence">置信度 {Math.round(result.confidence * 100)}%</span>
          </div>

          <p className="yl-engineLine">
            {result.engine === "rules+llm"
              ? "规则 + AI 联合分析"
              : result.engine === "vision"
                ? "图片识别 + 规则分析"
                : "规则引擎分析"}
            {result.model ? ` · ${result.model}` : ""}
          </p>

          {result.explanation ? (
            <div className="yl-aiSummary">
              <div className="yl-sectionTitle">判断依据</div>
              <p>{result.explanation}</p>
            </div>
          ) : null}

          {result.extractedText ? (
            <div className="yl-extractedText">
              <div className="yl-sectionTitle">识别到的内容</div>
              <p>{result.extractedText}</p>
            </div>
          ) : null}

          {result.redFlags.length > 0 && (
            <div className="yl-redFlags">
              <div className="yl-sectionTitle">可疑点</div>
              {result.redFlags.map((flag, index) => (
                <div key={`${flag.quote}_${index}`} className="yl-redFlag">
                  <Icon name="alertTriangle" size="sm" />
                  <div>
                    <strong>“{flag.quote}”</strong>
                    <p>{flag.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="yl-actionChips">
            {result.actions.map((action) => (
              <span key={action} className="yl-actionChip">{action}</span>
            ))}
          </div>

          {isElder && result.riskLevel === "high" && !cooling && (
            <div className="yl-coolingCta">
              <div>
                <strong>先别转账</strong>
                <p>我可以帮您暂停 60 秒，并通知家人一起确认。</p>
              </div>
              <button type="button" className="btn btnDanger" disabled={coolingBusy} onClick={() => void startCoolingOff()}>
                {coolingBusy ? "正在通知…" : "启动转账冷静期"}
              </button>
            </div>
          )}

          {cooling ? (
            <CoolingOffPanel cooling={cooling} busy={coolingBusy} onRespond={(action) => void respondCoolingOff(action)} />
          ) : null}

          {related.length > 0 && (
            <div className="yl-related">
              <div className="yl-sectionTitle">相关案例</div>
              {related.map((hit) => (
                <div key={hit.id} className="yl-relatedItem">
                  <strong>{hit.title}</strong>
                  <p>{hit.summary}</p>
                </div>
              ))}
            </div>
          )}

          {result.sources.length > 0 && (
            <div className="yl-sources">
              <div className="yl-sectionTitle">核实用渠道</div>
              <div className="yl-sourceLinks">
                {result.sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          <p className="yl-disclaimer">{result.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
