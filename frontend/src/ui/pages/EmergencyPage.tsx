import React from "react";
import { useApi } from "../state/api.js";

export function EmergencyPage() {
  const api = useApi();
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">一键呼救</h1>
        <div className="muted">
          默认触发本地事件（可替换短信/IM/电话网关）。跌倒未确认可联动自动求助。
        </div>
      </div>

      <div className="panel">
        <button
          className="btn btnDanger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.emitMock("emergency.triggered", { reason: "用户点击紧急呼救按钮" });
            } finally {
              setBusy(false);
            }
          }}
        >
          立即呼救
        </button>
      </div>
    </div>
  );
}
