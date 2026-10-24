import React from "react";
import { useApi } from "../state/api.js";
import { useWs } from "../state/ws.js";

export function MonitorPage() {
  const api = useApi();
  const { connected } = useWs();
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">监测</h1>
        <div className="muted">
          支持与摄像头/识别算法硬件联动；也可手动触发跌倒/久坐事件，用于测试弹窗与语音播报联动。后端连接：
          {connected ? "已连接" : "未连接"}
        </div>
      </div>

      <div className="panel">
        <div className="row">
          <button
            className="btn btnDanger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.emitMock("fall.detected", { confidence: 0.92 });
              } finally {
                setBusy(false);
              }
            }}
          >
            触发跌倒事件
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.emitMock("sedentary.detected", { minutes: 65 });
              } finally {
                setBusy(false);
              }
            }}
          >
            触发久坐事件
          </button>
        </div>
      </div>
    </div>
  );
}
