import React from "react";
import { useApi } from "../state/api.js";
import type { TrendMetric } from "@eha/shared";

export function RecordsPage() {
  const api = useApi();
  const [metrics, setMetrics] = React.useState<TrendMetric[]>([]);
  const [insights, setInsights] = React.useState<string | null>(null);
  const [analysisBusy, setAnalysisBusy] = React.useState(false);
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const disclaimer = "内容由AI生成，请仔细甄别";
  const [formDate, setFormDate] = React.useState<string>("");
  const [formSteps, setFormSteps] = React.useState<string>("");
  const [formSleepHours, setFormSleepHours] = React.useState<string>("");
  const [formActiveMinutes, setFormActiveMinutes] = React.useState<string>("");
  const [formOutdoorMinutes, setFormOutdoorMinutes] = React.useState<string>("");
  const [formMoodScore, setFormMoodScore] = React.useState<string>("");

  async function loadTrends() {
    setError(null);
    try {
      const trends = await api.getTrends();
      setMetrics(trends.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取本地趋势数据");
    }
  }

  React.useEffect(() => {
    loadTrends().catch(() => undefined);
  }, [api]);

  const byType = groupByType(metrics);
  const sleepHours = (byType.get("sleepHours") ?? []).slice().sort((a, b) => a.ts - b.ts);
  const steps = (byType.get("steps") ?? []).slice().sort((a, b) => a.ts - b.ts);
  const activeMinutes = (byType.get("activeMinutes") ?? []).slice().sort((a, b) => a.ts - b.ts);
  const outdoorMinutes = (byType.get("outdoorMinutes") ?? []).slice().sort((a, b) => a.ts - b.ts);
  const moodScore = (byType.get("moodScore") ?? []).slice().sort((a, b) => a.ts - b.ts);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">活力记录簿</h1>
        <div className="muted">在这里手动记录每天的步数、睡眠、活动与心情，系统会按日期整理成趋势。</div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="pill">
            <div className="pillLabel">手动记录</div>
            <div className="pillValue">输入当天的步数、睡眠、活动等并保存。</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
          <input
            className="input"
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            style={{ maxWidth: 180 }}
          />
          <input
            className="input"
            placeholder="步数"
            value={formSteps}
            onChange={(e) => setFormSteps(e.target.value)}
            style={{ maxWidth: 120 }}
          />
          <input
            className="input"
            placeholder="睡眠时长(小时)"
            value={formSleepHours}
            onChange={(e) => setFormSleepHours(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <input
            className="input"
            placeholder="活动时长(分钟)"
            value={formActiveMinutes}
            onChange={(e) => setFormActiveMinutes(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <input
            className="input"
            placeholder="户外时长(分钟)"
            value={formOutdoorMinutes}
            onChange={(e) => setFormOutdoorMinutes(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <input
            className="input"
            placeholder="心情评分(0-100)"
            value={formMoodScore}
            onChange={(e) => setFormMoodScore(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <button
            className="btn btnPrimary"
            disabled={uploadBusy}
            onClick={async () => {
              setUploadBusy(true);
              setError(null);
              try {
                const payload: any = {};
                if (formDate.trim()) payload.date = formDate.trim();
                if (formSteps.trim()) payload.steps = Number(formSteps);
                if (formSleepHours.trim()) payload.sleepHours = Number(formSleepHours);
                if (formActiveMinutes.trim()) payload.activeMinutes = Number(formActiveMinutes);
                if (formOutdoorMinutes.trim()) payload.outdoorMinutes = Number(formOutdoorMinutes);
                if (formMoodScore.trim()) payload.moodScore = Number(formMoodScore);
                await api.addManualRecord(payload);
                setFormSteps("");
                setFormSleepHours("");
                setFormActiveMinutes("");
                setFormOutdoorMinutes("");
                setFormMoodScore("");
                await loadTrends();
              } catch (err) {
                setError(err instanceof Error ? err.message : "保存失败");
              } finally {
                setUploadBusy(false);
              }
            }}
          >
            保存记录
          </button>
        </div>
      </div>

      <div className="panel">
        {error ? <div className="muted">{error}</div> : null}
        <div className="panel" style={{ padding: 12, background: "var(--panel2)" }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="cardTitle">智能分析</div>
              <div className="muted" style={{ marginTop: 6 }}>
                由你手动触发分析，避免一进入页面就消耗模型。
              </div>
            </div>
            <button
              className="btn btnPrimary"
              disabled={analysisBusy || metrics.length === 0}
              onClick={async () => {
                setAnalysisBusy(true);
                setInsights("生成中…");
                try {
                  const analysis = await api.getHealthAnalysis();
                  setInsights(analysis.raw);
                } catch (err) {
                  setInsights(`失败：${err instanceof Error ? err.message : "无法生成分析"}`);
                } finally {
                  setAnalysisBusy(false);
                }
              }}
            >
              {analysisBusy ? "分析中…" : "AI 分析"}
            </button>
          </div>
          {insights ? (
            <>
              <div style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{insights}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                {disclaimer}
              </div>
            </>
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>
              暂未生成分析。
            </div>
          )}
        </div>
        {metrics.length === 0 ? (
          <div className="muted">暂无数据，可通过语音记录或导入生活记录后查看趋势。</div>
        ) : (
          <div className="stack">
            {sleepHours.length > 1 ? (
              <ChartCard title="睡眠时长（折线）" subtitle="小时" metrics={sleepHours} kind="line" />
            ) : null}
            {steps.length > 0 ? <ChartCard title="步数（柱状）" subtitle="步" metrics={steps} kind="bar" /> : null}
            {activeMinutes.length > 1 ? (
              <ChartCard title="活动时长（折线）" subtitle="分钟" metrics={activeMinutes} kind="line" />
            ) : null}
            {outdoorMinutes.length > 1 ? (
              <ChartCard title="户外时长（折线）" subtitle="分钟" metrics={outdoorMinutes} kind="line" />
            ) : null}
            {moodScore.length > 1 ? (
              <ChartCard title="心情评分（折线）" subtitle="分" metrics={moodScore} kind="line" />
            ) : null}
            <div className="panel" style={{ padding: 12, background: "var(--panel2)" }}>
              <div className="cardTitle">原始记录（最近）</div>
              <div className="stack" style={{ marginTop: 10 }}>
                {metrics.slice(0, 12).map((m, idx) => (
                  <div key={`${m.type}_${m.ts}_${idx}`} className="pill">
                    <div className="pillLabel">{metricTypeZh(m.type)}</div>
                    <div className="pillValue">{m.value}</div>
                    <div className="pillLabel">{new Date(m.ts).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function metricTypeZh(type: string) {
  if (type === "sleepHours") return "睡眠时长";
  if (type === "steps") return "步数";
  if (type === "activeMinutes") return "活动时长";
  if (type === "outdoorMinutes") return "户外时长";
  if (type === "moodScore") return "心情评分";
  return "指标";
}

function groupByType(metrics: TrendMetric[]) {
  const map = new Map<string, TrendMetric[]>();
  for (const m of metrics) {
    const list = map.get(m.type) ?? [];
    list.push(m);
    map.set(m.type, list);
  }
  return map;
}

function normalizeUploadedMetrics(input: unknown): Array<{ type: string; value: number; ts?: number }> {
  if (!input || typeof input !== "object") return [];
  const obj = input as any;

  const directPoints = Array.isArray(obj.points) ? obj.points : null;
  if (directPoints) {
    return directPoints
      .map((p: any) => ({
        type: typeof p?.type === "string" ? p.type : "",
        value: typeof p?.value === "number" ? p.value : NaN,
        ts: typeof p?.ts === "number" ? p.ts : undefined
      }))
      .filter((p: { type: string; value: number }) => p.type && Number.isFinite(p.value));
  }

  const now = Date.now();
  const seriesKeys = ["steps", "sleepHours", "activeMinutes", "outdoorMinutes", "moodScore"] as const;
  const out: Array<{ type: string; value: number; ts?: number }> = [];
  for (const key of seriesKeys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ type: key, value: v, ts: now });
      continue;
    }
    if (Array.isArray(v) && v.every((n: any) => typeof n === "number" && Number.isFinite(n))) {
      const step = 5 * 60 * 1000;
      const start = now - step * v.length;
      v.forEach((n: number, i: number) => out.push({ type: key, value: n, ts: start + i * step }));
    }
  }
  return out;
}

function ChartCard({
  title,
  subtitle,
  metrics,
  kind
}: {
  title: string;
  subtitle: string;
  metrics: TrendMetric[];
  kind: "line" | "bar";
}) {
  return (
    <div className="panel" style={{ padding: 12, background: "var(--panel2)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="cardTitle">{title}</div>
        <div className="pillLabel">{subtitle}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        {kind === "line" ? <LineChart metrics={metrics} /> : <BarChart metrics={metrics} />}
      </div>
    </div>
  );
}

function LineChart({ metrics }: { metrics: TrendMetric[] }) {
  const height = 180;
  const width = 640;
  const sorted = metrics.slice().sort((a, b) => a.ts - b.ts).slice(-120);
  const ys = sorted.map((m) => m.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;

  const points = sorted.map((m, i) => {
    const x = (i / Math.max(1, sorted.length - 1)) * (width - 20) + 10;
    const y = height - 10 - ((m.value - minY) / range) * (height - 20);
    return { x, y, ts: m.ts, value: m.value };
  });

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const [hover, setHover] = React.useState<number | null>(null);

  function nearestIndex(clientX: number, rect: DOMRect) {
    const x = ((clientX - rect.left) / rect.width) * width;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
      const pt = points[i]!;
      const dist = Math.abs(pt.x - x);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  const hp = hover !== null ? points[hover] ?? null : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as any).getBoundingClientRect() as DOMRect;
          setHover(nearestIndex(e.clientX, rect));
        }}
        style={{ display: "block" }}
      >
        <path d={d} fill="none" stroke="rgba(78, 161, 255, 0.9)" strokeWidth="2" />
        {hp ? (
          <>
            <line x1={hp.x} y1={10} x2={hp.x} y2={height - 10} stroke="rgba(255,255,255,0.18)" />
            <circle cx={hp.x} cy={hp.y} r="4" fill="rgba(78,161,255,1)" />
          </>
        ) : null}
      </svg>
      {hp ? (
        <div className="pill" style={{ position: "absolute", right: 12, top: 12 }}>
          <div className="pillLabel">{new Date(hp.ts).toLocaleString()}</div>
          <div className="pillValue">{hp.value}</div>
        </div>
      ) : null}
    </div>
  );
}

function BarChart({ metrics }: { metrics: TrendMetric[] }) {
  const height = 180;
  const width = 640;
  const sorted = metrics.slice().sort((a, b) => a.ts - b.ts).slice(-60);
  const values = sorted.map((m) => m.value);
  const maxY = Math.max(...values, 1);

  const bars = sorted.map((m, i) => {
    const x = (i / Math.max(1, sorted.length)) * (width - 20) + 10;
    const w = (width - 20) / Math.max(1, sorted.length) - 2;
    const h = ((m.value / maxY) * (height - 20));
    return { x, y: height - 10 - h, w, h, ts: m.ts, value: m.value };
  });

  const [hover, setHover] = React.useState<number | null>(null);

  function nearestIndex(clientX: number, rect: DOMRect) {
    const x = ((clientX - rect.left) / rect.width) * width;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < bars.length; i += 1) {
      const b = bars[i]!;
      const cx = b.x + b.w / 2;
      const dist = Math.abs(cx - x);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  const hb = hover !== null ? bars[hover] ?? null : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as any).getBoundingClientRect() as DOMRect;
          setHover(nearestIndex(e.clientX, rect));
        }}
        style={{ display: "block" }}
      >
        {bars.map((b, idx) => (
          <rect
            key={`${b.ts}_${idx}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={hover === idx ? "rgba(48, 209, 88, 0.85)" : "rgba(48, 209, 88, 0.45)"}
            rx="3"
          />
        ))}
      </svg>
      {hb ? (
        <div className="pill" style={{ position: "absolute", right: 12, top: 12 }}>
          <div className="pillLabel">{new Date(hb.ts).toLocaleString()}</div>
          <div className="pillValue">{hb.value}</div>
        </div>
      ) : null}
    </div>
  );
}
