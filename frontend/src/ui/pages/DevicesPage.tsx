import React from "react";
import type { WearablesStatus } from "@eha/shared";
import { useToast } from "../state/toast.js";
import watchSvg from "../assets/watch.svg";

export function DevicesPage() {
  const toast = useToast();
  const [status, setStatus] = React.useState<WearablesStatus>(() => {
    try {
      const raw = localStorage.getItem("wearables.status.v1");
      if (raw) {
        const parsed = JSON.parse(raw) as WearablesStatus;
        if (parsed?.connected?.huawei || parsed?.connected?.generic || parsed?.connected?.xiaomi) return parsed;
      }
    } catch {
      undefined;
    }
    return {
      connected: { huawei: true, xiaomi: false, generic: false },
      lastImport: { vendor: "huawei", ts: Date.now() - 18 * 60 * 1000 }
    };
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem("wearables.status.v1", JSON.stringify(status));
    } catch {
      undefined;
    }
  }, [status]);

  function mulberry32(seed: number) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toDaySeed(d: Date) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function pad2(v: number) {
    return String(v).padStart(2, "0");
  }

  function hex2(v: number) {
    return Math.max(0, Math.min(255, v)).toString(16).toUpperCase().padStart(2, "0");
  }

  function minutesToHm(minutesFromMidnight: number) {
    const m = ((minutesFromMidnight % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function formatDuration(mins: number) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}小时${pad2(m)}分`;
  }

  function deriveDailyMetrics(now: Date) {
    const seed = toDaySeed(now);
    const rand = mulberry32(seed);

    const plannedSteps = Math.floor(6200 + rand() * 7800);
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const progress = Math.min(1, Math.max(0.06, minutesSinceMidnight / (20 * 60)));
    const stepsToday = Math.max(280, Math.round(plannedSteps * progress));

    const sleepDurationMin = Math.floor(380 + rand() * 140);
    const startMin = Math.floor(22 * 60 + 10 + rand() * 90);
    const endMin = startMin + sleepDurationMin;

    return {
      stepsToday,
      sleep: {
        durationMin: sleepDurationMin,
        durationText: formatDuration(sleepDurationMin),
        rangeText: `${minutesToHm(startMin)} - ${minutesToHm(endMin)}`
      }
    };
  }

  const deviceInfo = React.useMemo(() => {
    const now = new Date();
    const rand = mulberry32(119203);
    const suffix = Math.floor(100000 + rand() * 899999);
    return {
      name: "HUAWEI WATCH",
      model: "GT 4",
      serial: `HW${now.getFullYear()}${suffix}`,
      firmware: "3.1.0.168",
      mac: `F4:${hex2(Math.floor(rand() * 256))}:${hex2(Math.floor(rand() * 256))}:${hex2(
        Math.floor(rand() * 256)
      )}:${hex2(Math.floor(rand() * 256))}:${hex2(Math.floor(rand() * 256))}`,
      batteryPct: 78,
      boundAt: Date.now() - 12 * 24 * 60 * 60 * 1000
    };
  }, []);

  const [daily, setDaily] = React.useState(() => deriveDailyMetrics(new Date()));

  async function addDevice(vendor: "generic" | "huawei") {
    setBusy(true);
    try {
      setStatus((prev) => ({
        ...prev,
        connected: { ...prev.connected, [vendor]: true },
        lastImport: { vendor, ts: Date.now() }
      }));
      toast.push({ kind: "ok", title: vendor === "huawei" ? "手表已连接" : "来源已添加" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">数据导入与连接</h1>
        <div className="muted">
          支持将步数、睡眠、活动等生活数据统一接入并汇总到活力记录簿中，可随时管理来源与同步频率。
        </div>
      </div>

      <div className="grid">
        <div className="card dashSmall">
          <div className="cardHeader">
            <div className="cardTitle">数据来源</div>
          </div>
          <div className="cardDesc">统一入口：添加或管理可提供步数、睡眠、活动等生活数据的来源。</div>
          <div className="row" style={{ marginTop: 8 }}>
            <div className="pill">
              <div className="pillLabel">通用来源</div>
              <div className="pillValue">{status.connected.generic ? "已连接" : "未连接"}</div>
            </div>
            <button className="btn btnPrimary" disabled={busy} onClick={() => addDevice("generic")}>
              添加来源
            </button>
          </div>

          <div className="row" style={{ marginTop: 12, borderTop: "1px solid var(--panel-border)", paddingTop: 12 }}>
            <div className="pill">
              <div className="pillLabel">华为手表</div>
              <div className="pillValue">{status.connected.huawei ? "已连接" : "未连接"}</div>
            </div>
            {!status.connected.huawei && (
              <button className="btn btnPrimary" disabled={busy} onClick={() => addDevice("huawei")}>
                连接设备
              </button>
            )}
            {status.connected.huawei && (
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setStatus((prev) => ({ ...prev, lastImport: { vendor: "huawei", ts: Date.now() } }));
                    setDaily(deriveDailyMetrics(new Date()));
                    toast.push({ kind: "ok", title: "同步完成" });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                重新同步
              </button>
            )}
          </div>

          <div className="muted" style={{ marginTop: 8 }}>
            最近同步：{status.lastImport ? new Date(status.lastImport.ts).toLocaleString() : "暂无"}
          </div>
        </div>

        <div className="card dashMain">
          <div className="cardHeader">
            <div className="cardTitle">已接入设备</div>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div className="row" style={{ alignItems: "center", gap: 14 }}>
                <div
                  className="panel"
                  style={{
                    padding: 10,
                    width: 112,
                    height: 112,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 18
                  }}
                >
                  <img src={watchSvg} alt="手表" style={{ width: 96, height: 96, objectFit: "contain" }} />
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {deviceInfo.name} {deviceInfo.model}
                  </div>
                  <div className="muted">
                    连接状态：{status.connected.huawei ? "已连接" : "未连接"}　电量：{deviceInfo.batteryPct}%
                  </div>
                  <div className="muted">绑定时间：{new Date(deviceInfo.boundAt).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="pill">
                <div className="pillLabel">固件版本</div>
                <div className="pillValue">{deviceInfo.firmware}</div>
              </div>
            </div>

            <div className="grid" style={{ gap: 12 }}>
              <div className="pill" style={{ gridColumn: "span 6", justifyContent: "space-between", width: "100%" }}>
                <div className="pillLabel">设备序列号</div>
                <div className="pillValue">{deviceInfo.serial}</div>
              </div>
              <div className="pill" style={{ gridColumn: "span 6", justifyContent: "space-between", width: "100%" }}>
                <div className="pillLabel">蓝牙地址</div>
                <div className="pillValue">{deviceInfo.mac}</div>
              </div>
            </div>

            <div className="panel" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>健康数据</div>
                <div className="muted">来源：华为手表</div>
              </div>
              <div className="grid" style={{ gap: 12, marginTop: 10 }}>
                <div className="pill" style={{ gridColumn: "span 6", justifyContent: "space-between", width: "100%" }}>
                  <div className="pillLabel">今日步数</div>
                  <div className="pillValue">{new Intl.NumberFormat("zh-CN").format(daily.stepsToday)} 步</div>
                </div>
                <div className="pill" style={{ gridColumn: "span 6", justifyContent: "space-between", width: "100%" }}>
                  <div className="pillLabel">昨夜睡眠</div>
                  <div className="pillValue">{daily.sleep.durationText}</div>
                </div>
                <div className="pill" style={{ gridColumn: "span 12", justifyContent: "space-between", width: "100%" }}>
                  <div className="pillLabel">睡眠区间</div>
                  <div className="pillValue">{daily.sleep.rangeText}</div>
                </div>
              </div>
            </div>

            <div className="cardDesc">
              数据默认保存在本地。可根据需要扩展：授权范围（步数/睡眠/活动等）、撤销授权、同步频率、云端开关与脱敏导出。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
