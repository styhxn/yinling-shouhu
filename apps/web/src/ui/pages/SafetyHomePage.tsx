import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { Geofence, LocationPoint, SafetyAlert } from "../../lib/types.js";
import { useToast } from "../state/toast.js";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function alertLabel(type: string) {
  if (type === "geofence.exit") return "离开安全区域";
  if (type === "scam.high") return "高风险信息";
  if (type === "cooling_off") return "转账冷静期";
  return "安全提醒";
}

export function SafetyHomePage() {
  const toast = useToast();
  const [geofences, setGeofences] = React.useState<Geofence[]>([]);
  const [latest, setLatest] = React.useState<LocationPoint | null>(null);
  const [alerts, setAlerts] = React.useState<SafetyAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [lastSeenText, setLastSeenText] = React.useState("南京市鼓楼区某小区北门");
  const [clothing, setClothing] = React.useState("蓝色外套、深色裤子");
  const [contact, setContact] = React.useState("138****8888");
  const [posterUrl, setPosterUrl] = React.useState<string | null>(null);
  const [posterBusy, setPosterBusy] = React.useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [fences, point, list] = await Promise.all([
        api.safety.geofences(),
        api.safety.latestLocation(),
        api.safety.alerts(undefined, "open")
      ]);
      setGeofences(fences.items);
      setLatest(point.point);
      setAlerts(list.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function createHomeGeofence() {
    setBusy(true);
    try {
      const center: [number, number] = latest ? [latest.lng, latest.lat] : [118.781, 32.041];
      await api.safety.createGeofence({
        name: "家附近",
        shape: { type: "circle", center, radius: 800 }
      });
      toast.push({ kind: "ok", title: "已设置安全区域", detail: "家附近 800 米" });
      await load();
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "设置失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusy(false);
    }
  }

  async function simulateExit() {
    setBusy(true);
    try {
      const result = await api.safety.reportLocation({
        lat: 32.12,
        lng: 118.88,
        source: "demo"
      });
      toast.push({
        kind: result.alerts.length ? "normal" : "ok",
        title: result.alerts.length ? "已离开安全区域" : "位置已更新",
        detail: result.alerts.length ? "已生成越界提醒，家属端可以看到。" : "当前仍在安全区域内。"
      });
      await load();
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "模拟失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusy(false);
    }
  }

  async function createPoster() {
    if (!lastSeenText.trim() || !contact.trim()) {
      toast.push({ kind: "danger", title: "请填写最后位置和联系人" });
      return;
    }
    setPosterBusy(true);
    setPosterUrl(null);
    try {
      const result = await api.safety.createMissingPoster({
        lastSeenText: lastSeenText.trim(),
        contact: contact.trim(),
        ...(clothing.trim() ? { clothing: clothing.trim() } : {})
      });
      setPosterUrl(result.poster.shareUrl);
      toast.push({ kind: "ok", title: "寻人海报已生成", detail: "链接 24 小时内有效。" });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "生成失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setPosterBusy(false);
    }
  }

  const homeFence = geofences[0];
  const outside = alerts.some((alert) => alert.type === "geofence.exit");

  return (
    <div className="yl-page ys-safetyPage">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">安心守护</p>
          <h1>位置、围栏与寻人</h1>
          <p>先看老人最后在哪里。需要时，一键生成寻人海报，家属和社区都能看到。</p>
        </div>
        <Link to="/elder/safety/scam" className="btn">
          可疑信息鉴定
        </Link>
      </section>

      <div className="ys-locationLayout">
        <section className="ys-mapCard">
          <div className="ys-mapHead">
            <div>
              <span className="ys-kicker">安全区域</span>
              <h2>{homeFence ? homeFence.name : "还没有设置"}</h2>
            </div>
            <span className={`ys-stateMark ${outside ? "ys-stateMark--warn" : ""}`}>
              {outside ? "已离开安全区域" : "在安全区域内"}
            </span>
          </div>

          <svg className="ys-mapSvg" viewBox="0 0 420 260" role="img" aria-label="安全区域示意图">
            <rect width="420" height="260" fill="#F7F8F3" />
            <path d="M-20 78 C 70 54, 122 96, 206 72 S 348 56, 440 88" stroke="#D6E0D8" strokeWidth="24" fill="none" opacity="0.55" />
            <path d="M-20 112 C 82 88, 132 128, 214 104 S 352 90, 440 120" stroke="#E4EBE5" strokeWidth="10" fill="none" opacity="0.8" />
            <path d="M48 260 C 68 190, 110 158, 154 142" stroke="#D6E0D8" strokeWidth="14" fill="none" opacity="0.5" />
            <path d="M330 260 C 310 204, 276 176, 244 152" stroke="#D6E0D8" strokeWidth="14" fill="none" opacity="0.5" />
            {homeFence && (
              <circle
                cx="210"
                cy="132"
                r="74"
                fill="rgba(94,127,113,0.08)"
                stroke="#5E7F71"
                strokeWidth="1.5"
                strokeDasharray="5 6"
              />
            )}
            <circle cx={outside ? 336 : 210} cy={outside ? 76 : 132} r="7" fill={outside ? "#8C3B2E" : "#3F5A50"} />
            <circle cx={outside ? 336 : 210} cy={outside ? 76 : 132} r="16" fill="none" stroke={outside ? "#8C3B2E" : "#3F5A50"} opacity="0.25" />
            <text x="210" y="222" textAnchor="middle" fill="#7A8883" fontSize="12">
              {homeFence ? `${homeFence.name} · ${homeFence.shape.radius}m` : "设置安全区域后显示围栏"}
            </text>
          </svg>

          <div className="ys-mapMeta">
            <span>{latest ? `最后位置 ${latest.lat.toFixed(3)}, ${latest.lng.toFixed(3)}` : "还没有位置记录"}</span>
            <span>{latest ? formatTime(latest.ts) : "等待更新"}</span>
          </div>

          <div className="ys-inlineActions">
            {homeFence ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void simulateExit()}>
                <Icon name="refresh" size="sm" />
                {busy ? "更新中…" : "模拟走出围栏"}
              </button>
            ) : (
              <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void createHomeGeofence()}>
                <Icon name="plus" size="sm" />
                设置家附近 800m
              </button>
            )}
            <a className="btn" href="tel:110">
              <Icon name="phone" size="sm" />
              拨打 110
            </a>
          </div>
        </section>

        <section className="ys-safetySide">
          <div className="ys-sideBlock">
            <span className="ys-kicker">安全提醒</span>
            {loading ? (
              <p className="ys-mutedText">正在读取…</p>
            ) : alerts.length === 0 ? (
              <p className="ys-mutedText">暂时没有新的提醒。</p>
            ) : (
              <div className="ys-alertList">
                {alerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="ys-alertItem">
                    <span className="ys-alertDot" />
                    <div>
                      <strong>{alertLabel(alert.type)}</strong>
                      <small>{formatTime(alert.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ys-sideBlock">
            <span className="ys-kicker">一键寻人</span>
            <p className="ys-mutedText">信息会脱敏处理，海报链接 24 小时内有效。</p>
            <div className="ys-posterForm">
              <label>
                <span>最后位置</span>
                <input className="input" value={lastSeenText} onChange={(e) => setLastSeenText(e.target.value)} />
              </label>
              <label>
                <span>衣着特征</span>
                <input className="input" value={clothing} onChange={(e) => setClothing(e.target.value)} />
              </label>
              <label>
                <span>联系人</span>
                <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
              </label>
              <button type="button" className="btn btnPrimary" disabled={posterBusy} onClick={() => void createPoster()}>
                <Icon name="fileText" size="sm" />
                {posterBusy ? "生成中…" : "生成寻人海报"}
              </button>
            </div>
            {posterUrl && (
              <div className="ys-shareResult">
                <span>海报已生成</span>
                <div className="ys-inlineActions">
                  <a className="btn" href={posterUrl} target="_blank" rel="noreferrer">打开海报</a>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${window.location.origin}${posterUrl}`);
                        toast.push({ kind: "ok", title: "链接已复制" });
                      } catch {
                        toast.push({ kind: "normal", title: "复制失败", detail: "请长按链接复制。" });
                      }
                    }}
                  >
                    复制链接
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {error ? <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div> : null}
    </div>
  );
}
