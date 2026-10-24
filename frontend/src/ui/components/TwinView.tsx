import React from "react";

type VitalityHistoryEntry = { ts: number; score: number; factors?: string[] };

export function TwinView({
  score,
  history,
  suggestions
}: {
  score: number | null;
  history: VitalityHistoryEntry[];
  suggestions: string[];
}) {
  const level =
    score === null
      ? "unknown"
      : score >= 70
      ? "high"
      : score >= 40
      ? "medium"
      : "low";

  const displayScore = score === null ? "—" : `${score}`;

  const levelLabel =
    level === "high" ? "活力充足" : level === "medium" ? "活力适中" : level === "low" ? "活力偏低" : "暂无数据";

  const recent = history.slice(-7);

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div className="row" style={{ alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 600,
            background:
              level === "high"
                ? "linear-gradient(135deg, #34c759, #4cd964)"
                : level === "medium"
                ? "linear-gradient(135deg, #ffcc00, #ffdd55)"
                : level === "low"
                ? "linear-gradient(135deg, #ff3b30, #ff6b6b)"
                : "var(--panel2)",
            color: "#fff"
          }}
        >
          {displayScore}
        </div>
        <div className="stack" style={{ flex: 1, minWidth: 200, gap: 6 }}>
          <div className="cardTitle">今日活力指数</div>
          <div className="pillLabel">{levelLabel}</div>
          {suggestions.length > 0 ? (
            <div className="pillValue" style={{ whiteSpace: "pre-wrap" }}>
              {suggestions[0]}
            </div>
          ) : (
            <div className="muted">可通过语音描述今天的生活，让系统为你计算活力指数。</div>
          )}
        </div>
      </div>

      {recent.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="pillLabel">近 7 天走势</div>
          <div
            className="row"
            style={{
              marginTop: 8,
              gap: 4,
              alignItems: "flex-end",
              minHeight: 60
            }}
          >
            {recent.map((h, idx) => {
              const s = Math.max(0, Math.min(100, h.score));
              const height = 20 + (s / 100) * 40;
              return (
                <div key={h.ts ?? idx} style={{ flex: 1, minWidth: 10 }}>
                  <div
                    style={{
                      height,
                      borderRadius: 4,
                      background:
                        s >= 70 ? "#34c759" : s >= 40 ? "#ffcc00" : "#ff3b30"
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

