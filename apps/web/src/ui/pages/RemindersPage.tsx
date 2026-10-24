import React from "react";
import { useApi } from "../state/api.js";

export function RemindersPage() {
  const api = useApi();
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">智能提醒</h1>
        <div className="muted">当前提供“提醒触发→弹窗/语音→确认”的端到端链路，可用于提醒配置与联动验证。</div>
      </div>

      <div className="panel">
        <div className="row">
          <button
            className="btn btnPrimary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.emitMock("reminder.due", { kind: "medicine", title: "该吃药了：请按医嘱服用" });
              } finally {
                setBusy(false);
              }
            }}
          >
            发送吃药提醒
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.emitMock("reminder.due", { kind: "water", title: "喝水提醒：现在喝几口温水吧" });
              } finally {
                setBusy(false);
              }
            }}
          >
            发送喝水提醒
          </button>
        </div>
      </div>
    </div>
  );
}
