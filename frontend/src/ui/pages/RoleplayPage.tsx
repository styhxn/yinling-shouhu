import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { RoleplayReport, RoleplayScenario } from "../../lib/types.js";
import { useToast } from "../state/toast.js";

type RpMessage = { role: "scammer" | "elder"; text: string; tactic?: string };

export function RoleplayPage() {
  const toast = useToast();
  const [scenarios, setScenarios] = React.useState<RoleplayScenario[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [scenario, setScenario] = React.useState<RoleplayScenario | null>(null);
  const [messages, setMessages] = React.useState<RpMessage[]>([]);
  const [turn, setTurn] = React.useState(1);
  const [maxTurns, setMaxTurns] = React.useState(5);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<RoleplayReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    api.safety
      .roleplayScenarios()
      .then((res) => {
        if (alive) setScenarios(res.items);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function start(item: RoleplayScenario) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await api.safety.startRoleplay(item.id);
      setSessionId(res.sessionId);
      setScenario({
        id: res.scenario.id,
        title: res.scenario.title,
        subtitle: res.scenario.subtitle,
        opener: res.message,
        maxTurns: res.maxTurns
      });
      setMessages([{ role: "scammer", text: res.message }]);
      setTurn(res.turn);
      setMaxTurns(res.maxTurns);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "演练启动失败");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!sessionId || !input.trim() || busy) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "elder", text }]);
    setBusy(true);
    try {
      const res = await api.safety.roleplayTurn(sessionId, text);
      if (res.done && res.report) {
        setReport(res.report);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "scammer", text: res.reply, ...(res.tactic ? { tactic: res.tactic } : {}) }
        ]);
        setTurn(res.turn ?? turn + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const res = await api.safety.endRoleplay(sessionId);
      setReport(res.report);
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "复盘失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSessionId(null);
    setScenario(null);
    setMessages([]);
    setReport(null);
    setInput("");
    setError(null);
  }

  return (
    <div className="yl-page ys-roleplayPage">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">反诈演练</p>
          <h1>练一练，别让话术牵着走</h1>
          <p>选一个常见骗局，和模拟骗子过几招。结束后会给出六维复盘。</p>
        </div>
        <Link to="/elder/safety" className="btn">返回守护</Link>
      </section>

      <div className="ys-simNote">
        <Icon name="shieldCheck" size="sm" />
        <span>这是模拟演练，所有人物、账号、链接均为虚构。随时可以结束。</span>
      </div>

      {!sessionId ? (
        loading ? (
          <p className="ys-mutedText">正在准备演练场景…</p>
        ) : (
          <>
            <section className="ys-scenarioGrid">
              {scenarios.map((item) => (
                <article key={item.id} className="ys-scenarioCard">
                  <span className="ys-kicker">模拟剧本</span>
                  <h3>{item.title}</h3>
                  <p>{item.subtitle}</p>
                  <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void start(item)}>
                    开始演练
                  </button>
                </article>
              ))}
            </section>
            <section className="ys-roleplayTips" aria-label="演练提示">
              <span className="ys-kicker">上场前先记住</span>
              <div className="ys-roleplayTipsGrid">
                <div>
                  <strong>先停一下</strong>
                  <p>对方越催，越说明有问题。先说“我要问家里人”。</p>
                </div>
                <div>
                  <strong>不报验证码</strong>
                  <p>验证码、银行卡号、屏幕共享，都不能给陌生人。</p>
                </div>
                <div>
                  <strong>挂断后核实</strong>
                  <p>自己拨打 110 或 96110，不要回拨对方给的号码。</p>
                </div>
              </div>
            </section>
          </>
        )
      ) : report ? (
        <section className="ys-roleplayReport">
          <div className="ys-reportScore">
            <div>
              <span className="ys-kicker">演练复盘</span>
              <h2>{report.level}</h2>
              <p>{report.scenario.title}</p>
              <p className="ys-reportSummary">{report.summary}</p>
            </div>
            <div className="ys-scoreNumber">
              <strong>{report.total}</strong>
              <small>综合分</small>
            </div>
          </div>

          <p className="ys-reportTactics">
            <span>对方手法</span>
            {report.tacticSummary}
          </p>

          <div className="ys-dimensionGrid">
            {report.dimensions.map((item) => (
              <div key={item.name} className="ys-dimension">
                <div className="ys-dimensionHead">
                  <strong>{item.name}</strong>
                  <span>{item.score}</span>
                </div>
                <div className="ys-dimensionBar">
                  <div className="ys-dimensionFill" style={{ width: `${item.score}%` }} />
                </div>
                <small>{item.comment}</small>
                <small className="ys-dimensionEvidence">依据：{item.evidence}</small>
              </div>
            ))}
          </div>

          <div className="ys-reportLists">
            <div>
              <h3>这次出现的红旗</h3>
              <ul>
                {report.redFlags.map((flag) => <li key={flag}>{flag}</li>)}
              </ul>
            </div>
            <div>
              <h3>下次可以这样做</h3>
              <ul>
                {report.advice.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3>下一步行动</h3>
              <ul>
                {report.nextSteps.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>

          <p className="ys-finePrint">{report.disclaimer}</p>
          <div className="ys-inlineActions">
            <button type="button" className="btn btnPrimary" onClick={reset}>再练一次</button>
            <Link to="/elder/safety" className="btn">返回守护</Link>
          </div>
        </section>
      ) : (
        <section className="ys-roleplayChat">
          <div className="ys-roleplayTop">
            <div>
              <span className="ys-kicker">模拟演练</span>
              <h2>{scenario?.title}</h2>
            </div>
            <span className="ys-roleplayTurn">第 {turn} / {maxTurns} 轮</span>
          </div>

          <div className="ys-roleplayList">
            {messages.map((message, index) => (
              <div
                key={`${message.role}_${index}`}
                className={`ys-rpMsg ${message.role === "elder" ? "ys-rpMsg--elder" : "ys-rpMsg--scammer"}`}
              >
                <span className="ys-rpWho">
                  {message.role === "elder" ? "我" : "模拟对方"}
                  {message.tactic ? ` · ${message.tactic}` : ""}
                </span>
                <p>{message.text}</p>
              </div>
            ))}
            {busy ? <p className="ys-mutedText">对方正在回复…</p> : null}
          </div>

          <div className="ys-roleplayComposer">
            <div className="ys-rpSuggestions" aria-label="回应建议">
              <span>不知道怎么回？点一句：</span>
              <button type="button" onClick={() => setInput("我先挂断，自己打 110 核实。")}>
                我先挂断，自己核实
              </button>
              <button type="button" onClick={() => setInput("这件事我要先问问家里人。")}>
                先问问家里人
              </button>
              <button type="button" onClick={() => setInput("我不会转账，也不会点陌生链接。")}>
                不转账、不点链接
              </button>
            </div>
            <textarea
              className="input ys-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="您会怎么回应？例如：我先挂断，打 110 核实。"
              disabled={busy}
            />
            <div className="ys-inlineActions">
              <button type="button" className="btn btnPrimary" disabled={!input.trim() || busy} onClick={() => void send()}>
                <Icon name="send" size="sm" />
                回复
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void end()}>
                结束并复盘
              </button>
            </div>
          </div>
        </section>
      )}

      {error ? <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div> : null}
    </div>
  );
}
