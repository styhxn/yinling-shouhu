import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { Geofence, LocationPoint, SafetyAlert } from "../../lib/types.js";
import { useRealtime } from "../state/realtime.js";
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
  if (type === "help_home") return "找不到家求助";
  return "安全提醒";
}

function alertDetail(alert: SafetyAlert) {
  const payload = alert.payload ?? {};
  if (alert.type === "geofence.exit") {
    const name = typeof payload.geofenceName === "string" ? payload.geofenceName : "安全区域";
    const distance =
      typeof payload.distanceMeters === "number" ? `，距离约 ${payload.distanceMeters} 米` : "";
    return `已离开${name}${distance}`;
  }
  if (alert.type === "scam.high") return "检测到高风险信息，请先停止转账";
  if (alert.type === "cooling_off") return "转账已进入冷静期，等待家人确认";
  if (alert.type === "help_home") {
    const address = typeof payload.address === "string" ? payload.address : "家附近";
    return `长辈发起了回家求助，位置在${address}附近，请立即联系。`;
  }
  return "";
}

export function SafetyHomePage() {
  const toast = useToast();
  const [geofences, setGeofences] = React.useState<Geofence[]>([]);
  const [latest, setLatest] = React.useState<LocationPoint | null>(null);
  const [alerts, setAlerts] = React.useState<SafetyAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [lastSeenText, setLastSeenText] = React.useState("");
  const [clothing, setClothing] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [posterUrl, setPosterUrl] = React.useState<string | null>(null);
  const [posterBusy, setPosterBusy] = React.useState(false);

  const { lastEvent, connected } = useRealtime();
  const [sharing, setSharing] = React.useState(false);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const [lastShareAt, setLastShareAt] = React.useState<number | null>(null);
  const [ackId, setAckId] = React.useState<string | null>(null);
  const watchIdRef = React.useRef<number | null>(null);
  const lastSentRef = React.useRef<{ ts: number; lat: number; lng: number } | null>(null);

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

  React.useEffect(() => {
    let alive = true;
    Promise.allSettled([api.healthProfile.get(), api.family.members()]).then(
      ([profileRes, membersRes]) => {
        if (!alive) return;
        if (profileRes.status === "fulfilled") {
          const address = profileRes.value.profile.homeAddress?.trim();
          if (address) setLastSeenText((prev) => (prev.trim() ? prev : address));
        }
        if (membersRes.status === "fulfilled") {
          const phone = membersRes.value.members.find((member) => member.phone)?.phone;
          if (phone) setContact((prev) => (prev.trim() ? prev : phone));
        }
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const event = lastEvent;
    if (!event) return;
    if (event.type === "location.updated") {
      setLatest(event.payload.point as LocationPoint);
      return;
    }
    if (event.type === "safety.alert" || event.type === "safety.alert.updated") {
      const alert = event.payload.alert as SafetyAlert;
      setAlerts((prev) => {
        if (alert.status !== "open") return prev.filter((item) => item.id !== alert.id);
        if (prev.some((item) => item.id === alert.id)) {
          return prev.map((item) => (item.id === alert.id ? alert : item));
        }
        return [alert, ...prev];
      });
    }
  }, [lastEvent]);

  React.useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function stopSharing() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
  }

  async function reportBrowserLocation(position: GeolocationPosition) {
    const now = Date.now();
    const last = lastSentRef.current;
    const moved =
      !last ||
      Math.abs(last.lat - position.coords.latitude) > 0.0002 ||
      Math.abs(last.lng - position.coords.longitude) > 0.0002;
    if (last && now - last.ts < 20_000 && !moved) return;
    lastSentRef.current = {
      ts: now,
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    try {
      const result = await api.safety.reportLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Math.min(5000, Math.round(position.coords.accuracy || 0)),
        source: "browser"
      });
      setLatest(result.point);
      setLastShareAt(Date.now());
      setShareError(null);
      if (result.alerts.length > 0) {
        setAlerts((prev) => [
          ...result.alerts.filter((alert) => !prev.some((item) => item.id === alert.id)),
          ...prev
        ]);
        if (!connected) {
          toast.push({
            kind: "danger",
            title: "已离开安全区域",
            detail: "位置已记录，请尽快联系家人。"
          });
        }
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "位置上报失败，正在重试");
    }
  }

  function startSharing() {
    if (!("geolocation" in navigator)) {
      setShareError("当前浏览器不支持定位，请换用手机浏览器。");
      return;
    }
    if (watchIdRef.current !== null) return;
    setShareError(null);
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void reportBrowserLocation(position);
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          stopSharing();
          setShareError("定位权限被拒绝。请在浏览器里允许定位后重试。");
          return;
        }
        setShareError("暂时无法获取位置，正在重试…");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
  }

  async function acknowledge(alertId: string) {
    setAckId(alertId);
    try {
      await api.safety.ackAlert(alertId, "ack");
      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "处理失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setAckId(null);
    }
  }

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
      if (!result.alerts.length) {
        toast.push({
          kind: "ok",
          title: "位置已更新",
          detail: "当前仍在安全区域内。"
        });
      } else if (!connected) {
        toast.push({
          kind: "danger",
          title: "已离开安全区域",
          detail: "已生成越界提醒，家人端可以看到。"
        });
      }
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
          <p>先看长辈最后在哪里。需要时，一键生成寻人海报，家人和社区都能看到。</p>
        </div>
        <div className="ys-inlineActions">
          <Link to="/elder/safety/help" className="btn btnDanger">
            <Icon name="mapPin" size="sm" />
            我找不到家了
          </Link>
          <Link to="/elder/safety/roleplay" className="btn">反诈演练</Link>
          <Link to="/elder/safety/scam" className="btn">可疑信息鉴定</Link>
        </div>
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

          <div className={`ys-shareStatus ${shareError ? "ys-shareStatus--warn" : ""}`}>
            <Icon name={sharing ? "activity" : "mapPin"} size="sm" />
            <span>
              {shareError
                ? shareError
                : sharing
                  ? lastShareAt
                    ? `正在共享位置 · 最近上报 ${formatTime(lastShareAt)}`
                    : "正在获取定位…"
                  : latest?.source === "browser"
                    ? "上次位置由手机定位上报"
                    : "未开启实时位置共享"}
            </span>
          </div>

          <div className="ys-inlineActions">
            {sharing ? (
              <button type="button" className="btn" onClick={stopSharing}>
                <Icon name="stop" size="sm" />
                停止共享位置
              </button>
            ) : (
              <button type="button" className="btn btnPrimary" onClick={startSharing}>
                <Icon name="mapPin" size="sm" />
                开始共享位置
              </button>
            )}
            {homeFence ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void simulateExit()}>
                <Icon name="refresh" size="sm" />
                {busy ? "更新中…" : "模拟走出围栏"}
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void createHomeGeofence()}>
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
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="ys-alertItem">
                    <span className="ys-alertDot" />
                    <div className="ys-alertBody">
                      <strong>{alertLabel(alert.type)}</strong>
                      <small>{formatTime(alert.createdAt)}</small>
                      {alertDetail(alert) ? <p>{alertDetail(alert)}</p> : null}
                      {alert.payload.assessment ? (
                        <div className="ys-alertAssessment">
                          <span className={`ys-aiPriority ys-aiPriority--${alert.payload.assessment.riskLevel === "high" ? "now" : "today"}`}>
                            守护 Agent · {alert.payload.assessment.riskLevel === "high" ? "高风险" : "已研判"}
                          </span>
                          <p>{alert.payload.assessment.summary}</p>
                          <Link
                            to={`/elder/trace/${alert.payload.assessment.traceId}`}
                            className="yl-traceLink"
                          >
                            <Icon name="sparkles" size="sm" />
                            查看 AI 决策依据
                          </Link>
                        </div>
                      ) : (
                        <small className="ys-alertPending">守护 Agent 正在研判这条提醒…</small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={ackId === alert.id}
                      onClick={() => void acknowledge(alert.id)}
                    >
                      {ackId === alert.id ? "处理中…" : "已处理"}
                    </button>
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
                <input
                  className="input"
                  value={lastSeenText}
                  placeholder="如：鼓楼区某小区北门（可从健康档案读取）"
                  onChange={(e) => setLastSeenText(e.target.value)}
                />
              </label>
              <label>
                <span>衣着特征</span>
                <input
                  className="input"
                  value={clothing}
                  placeholder="如：蓝色外套、深色裤子"
                  onChange={(e) => setClothing(e.target.value)}
                />
              </label>
              <label>
                <span>联系人</span>
                <input
                  className="input"
                  value={contact}
                  placeholder="家人手机号"
                  onChange={(e) => setContact(e.target.value)}
                />
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
