import React from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { AgentTrace, AgentTraceStep } from "../../lib/types.js";
import { useAuth } from "../state/auth.js";

const AGENT_LABEL: Record<string, string> = {
  companion: "陪伴 Agent",
  guardian: "守护 Agent",
  family: "家人 Agent"
};

const TRIGGER_LABEL: Record<string, string> = {
  user: "用户主动发起",
  schedule: "定时任务",
  event: "安全事件触发",
  family: "家人请求",
  system: "系统调度"
};

const STEP_LABEL: Record<AgentTraceStep["type"], string> = {
  plan: "计划",
  tool_call: "工具调用",
  tool_result: "工具结果",
  decision: "决策",
  error: "错误"
};

const RISK_LABEL: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险"
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ActionLink({
  action,
  isFamily
}: {
  action: NonNullable<AgentTrace["decision"]>["actions"][number];
  isFamily: boolean;
}) {
  if (action.kind === "call" && action.href) {
    return (
      <a href={action.href} className="btn btnPrimary yl-traceAction">
        <Icon name="phone" size="sm" />
        {action.label}
      </a>
    );
  }
  if (action.kind === "link" && action.href?.startsWith("/") && !isFamily) {
    return (
      <Link to={action.href} className="btn yl-traceAction">
        {action.label}
        <Icon name="arrowRight" size="sm" />
      </Link>
    );
  }
  if (action.kind === "link" && action.href?.startsWith("/") && isFamily) {
    return (
      <Link to="/family" className="btn yl-traceAction">
        {action.label}
        <Icon name="arrowRight" size="sm" />
      </Link>
    );
  }
  if (action.kind === "link" && action.href) {
    return (
      <a href={action.href} target="_blank" rel="noreferrer" className="btn yl-traceAction">
        {action.label}
      </a>
    );
  }
  return <span className="yl-traceAction yl-traceAction--text">{action.label}</span>;
}

export function AgentTracePage() {
  const { id = "" } = useParams();
  const { me } = useAuth();
  const [trace, setTrace] = React.useState<AgentTrace | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const isFamily = me?.user.role === "family";
  const backTo = isFamily ? "/family" : "/elder";

  React.useEffect(() => {
    let alive = true;
    api.agent
      .trace(id)
      .then((res) => {
        if (alive) setTrace(res.trace);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "轨迹加载失败");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="yl-page">
        <div className="yl-errorBar">
          <Icon name="alertCircle" size="sm" />
          <span>{error}</span>
        </div>
        <Link to={backTo} className="btn">
          返回
        </Link>
      </div>
    );
  }

  if (!trace) {
    return <div className="yl-loading">正在展开 AI 的决策轨迹…</div>;
  }

  const decision = trace.decision;
  return (
    <div className="yl-page yl-tracePage">
      <header className="yl-pageHeader">
        <div>
          <p className="yl-kicker">可解释 AI</p>
          <h1>AI 决策轨迹</h1>
          <p>看清楚这次判断用了哪些数据、调了什么工具、为什么给出这个建议。</p>
        </div>
        <Link to={backTo} className="btn">
          <Icon name="chevronLeft" size="sm" />
          返回
        </Link>
      </header>

      <section className="yl-traceMeta" aria-label="任务信息">
        <div>
          <span>Agent</span>
          <strong>{AGENT_LABEL[trace.agent] ?? trace.agent}</strong>
        </div>
        <div>
          <span>触发</span>
          <strong>{TRIGGER_LABEL[trace.trigger] ?? trace.trigger}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>{trace.status === "ok" ? "已完成" : trace.status === "needs_confirmation" ? "待确认" : "失败"}</strong>
        </div>
        <div>
          <span>模型 / 耗时</span>
          <strong>
            {trace.model === "live"
              ? "真实模型"
              : trace.model === "mock" || trace.model === "mock-fallback"
                ? "本地兜底"
                : trace.model}{" "}
            · {trace.latencyMs}ms
          </strong>
        </div>
        <div>
          <span>时间</span>
          <strong>{formatTime(trace.createdAt)}</strong>
        </div>
      </section>

      <section className="yl-traceGoal">
        <span className="yl-kicker">这次要解决什么</span>
        <p>{trace.goal}</p>
      </section>

      <div className="yl-traceGrid">
        <section className="yl-traceSteps" aria-label="执行步骤">
          <h2 className="yl-sectionTitle">执行过程</h2>
          <ol>
            {trace.steps.map((step) => (
              <li key={step.index} className={`yl-traceStep yl-traceStep--${step.type}`}>
                <div className="yl-traceStepDot" aria-hidden="true">
                  {step.type === "decision" ? (
                    <Icon name="check" size="sm" />
                  ) : step.type === "error" ? (
                    <Icon name="alertTriangle" size="sm" />
                  ) : step.type === "tool_call" ? (
                    <Icon name="sparkles" size="sm" />
                  ) : (
                    <Icon name="arrowRight" size="sm" />
                  )}
                </div>
                <div className="yl-traceStepBody">
                  <div className="yl-traceStepHead">
                    <span className="yl-traceStepKind">{STEP_LABEL[step.type]}</span>
                    <strong>{step.label}</strong>
                    {typeof step.latencyMs === "number" && step.latencyMs > 0 && (
                      <span className="yl-traceLatency">{step.latencyMs}ms</span>
                    )}
                  </div>
                  {step.detail && <p>{step.detail}</p>}
                  {Boolean(step.args) &&
                    Object.keys(step.args as Record<string, unknown>).length > 0 && (
                    <code className="yl-traceArgs">
                      {JSON.stringify(step.args).slice(0, 300)}
                    </code>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="yl-traceDecision" aria-label="AI 决策">
          <span className="yl-kicker">AI 的判断</span>
          {decision ? (
            <>
              <div className={`yl-traceRisk yl-traceRisk--${decision.riskLevel}`}>
                {RISK_LABEL[decision.riskLevel]} · 置信度 {Math.round(decision.confidence * 100)}%
              </div>
              <h2>{decision.summary}</h2>
              <p className="yl-traceExplain">{decision.explanation}</p>

              {decision.briefItems && decision.briefItems.length > 0 && (
                <div className="yl-traceBrief">
                  {decision.briefItems.map((item) => (
                    <div key={item.title} className="yl-traceBriefItem">
                      <span>{item.priority === "now" ? "现在" : item.priority === "today" ? "今天" : "有空时"}</span>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {decision.facts.length > 0 && (
                <div className="yl-traceFacts">
                  <h3>依据</h3>
                  <ul>
                    {decision.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>
              )}

              {decision.actions.length > 0 && (
                <div className="yl-traceActions">
                  {decision.actions.map((action) => (
                    <ActionLink
                      key={`${action.label}_${action.href ?? action.tool ?? ""}`}
                      action={action}
                      isFamily={isFamily}
                    />
                  ))}
                </div>
              )}

              {decision.citations.length > 0 && (
                <div className="yl-traceCitations">
                  <h3>来源</h3>
                  {decision.citations.map((citation) =>
                    citation.type === "memory" && !isFamily ? (
                      <Link key={citation.id ?? citation.title} to="/elder/story" className="yl-citationChip">
                        <Icon name="bookOpen" size="sm" />
                        {citation.title}
                      </Link>
                    ) : (
                      <span key={citation.id ?? citation.title} className="yl-citationChip">
                        <Icon name={citation.type === "memory" ? "bookOpen" : "link"} size="sm" />
                        {citation.title}
                      </span>
                    )
                  )}
                </div>
              )}
              <p className="yl-traceDisclaimer">
                轨迹展示的是系统生成的结构化依据，不是模型的原始思维过程；医疗、金融与安全判断仅供参考。
              </p>
            </>
          ) : (
            <p>这次任务没有生成结构化决策。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
