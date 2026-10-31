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

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function formatMeters(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(1)} 公里`;
}

function locationSourceLabel(source: string) {
  if (source === "browser") return "手机定位";
  if (source === "wearable") return "手环定位";
  if (source === "demo") return "演示位置，非真实";
  return "位置记录";
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
      typeof payload.distanceMeters === "number"
        ? `，距离约 ${formatMeters(payload.distanceMeters)}`
        : "";
    const address =
      typeof payload.address === "string" && payload.address ? `，位置在${payload.address}附近` : "";
    return `已离开${name}${distance}${address}`;
  }
  if (alert.type === "scam.high") return "检测到高风险信息，请先停止转账";
  if (alert.type === "cooling_off") return "转账已进入冷静期，等待家人确认";
  if (alert.type === "help_home") {
    const currentAddress =
      typeof payload.currentAddress === "string" ? payload.currentAddress : null;
    if (currentAddress) {
      return `长辈发起了回家求助，位置在${currentAddress}附近，请立即联系。`;
    }
    const last = payload.lastLocation as { lat?: unknown; lng?: unknown } | null;
    if (typeof last?.lat === "number" && typeof last.lng === "number") {
      return `长辈发起了回家求助，最后位置 ${last.lat.toFixed(5)}, ${last.lng.toFixed(5)}，请立即联系。`;
    }
    return "长辈发起了回家求助，请立即联系。";
  }
  return "";
}

export function SafetyHomePage() {
  const toast = useToast();
  const [geofences, setGeofences] = React.useState<Geofence[]>([]);
  const [latest, setLatest] = React.useState<LocationPoint | null>(null);
  const [address, setAddress] = React.useState<string | null>(null);
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
  const addressRef = React.useRef<{ lat: number; lng: number; at: number } | null>(null);

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
    api.family
      .members()
      .then((membersRes) => {
        if (!alive) return;
        const phone = membersRes.members.find((member) => member.phone)?.phone;
        if (phone) setContact((prev) => (prev.trim() ? prev : phone));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!latest || latest.source === "demo") return;
    const label = address ?? `坐标 ${latest.lat.toFixed(5)}, ${latest.lng.toFixed(5)}`;
    setLastSeenText((prev) => (prev.trim() ? prev : label));
  }, [address, latest]);

  React.useEffect(() => {
    if (!latest || latest.source === "demo") {
      setAddress(null);
      addressRef.current = null;
      return;
    }
    const previous = addressRef.current;
    const moved =
      !previous ||
      Math.abs(previous.lat - latest.lat) > 0.0015 ||
      Math.abs(previous.lng - latest.lng) > 0.0015;
    const aged = !previous || Date.now() - previous.at > 10 * 60 * 1000;
    if (!moved && !aged) return;
    let cancelled = false;
    api.safety
      .reverseGeocode(latest.lat, latest.lng)
      .then((res) => {
        if (cancelled) return;
        setAddress(res.address);
        addressRef.current = { lat: latest.lat, lng: latest.lng, at: Date.now() };
      })
      .catch(() => {
        if (cancelled) return;
        setAddress(null);
        addressRef.current = { lat: latest.lat, lng: latest.lng, at: Date.now() };
      });
    return () => {
      cancelled = true;
    };
  }, [latest]);

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
    try {
      const result = await api.safety.reportLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Math.min(5000, Math.round(position.coords.accuracy || 0)),
        source: "browser"
      });
      lastSentRef.current = {
        ts: now,
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
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
      lastSentRef.current = null;
      setShareError(err instanceof Error ? err.message : "位置上报失败，正在重试");
    }
  }

  function startSharing() {
    if (!("geolocation" in navigator)) {
      setShareError("当前浏览器不支持定位，请换用手机浏览器。");
      return;
    }
    if (!window.isSecureContext) {
      setShareError("浏览器只允许 HTTPS 页面获取定位，请用 HTTPS 地址打开后再共享位置。");
      return;
    }
    if (watchIdRef.current !== null) return;
    setShareError(null);
    setSharing(true);
    const handleError = (geoError: GeolocationPositionError) => {
      if (geoError.code === geoError.PERMISSION_DENIED) {
        stopSharing();
        setShareError("定位权限被拒绝。请在浏览器里允许定位后重试。");
        return;
      }
      setShareError("暂时无法获取位置，正在重试…");
    };
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void reportBrowserLocation(position);
      },
      handleError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void reportBrowserLocation(position);
      },
      handleError,
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

  const activeFence = geofences.find((geofence) => geofence.active) ?? geofences[0];
  const fenceCenter = activeFence
    ? { lat: activeFence.shape.center[1], lng: activeFence.shape.center[0] }
    : null;
  const distanceFromCenter =
    latest && fenceCenter
      ? distanceMeters(latest.lat, latest.lng, fenceCenter.lat, fenceCenter.lng)
      : null;
  const inside =
    latest && activeFence && distanceFromCenter !== null
      ? distanceFromCenter <= activeFence.shape.radius
      : null;
  const mapCenter = fenceCenter ?? (latest ? { lat: latest.lat, lng: latest.lng } : null);
  const mapRadius = activeFence?.shape.radius ?? 800;
  const pxPerMeter = 74 / mapRadius;
  let marker = { x: 210, y: 132, clamped: false };
  if (latest && mapCenter) {
    const metersPerDegLat = 111_320;
    const metersPerDegLng = 111_320 * Math.cos((mapCenter.lat * Math.PI) / 180);
    const x = 210 + (latest.lng - mapCenter.lng) * metersPerDegLng * pxPerMeter;
    const y = 132 - (latest.lat - mapCenter.lat) * metersPerDegLat * pxPerMeter;
    const clamped = x < 18 || x > 402 || y < 18 || y > 242;
    marker = {
      x: Math.min(402, Math.max(18, x)),
      y: Math.min(242, Math.max(18, y)),
      clamped
    };
  }
  const statusText =
    !latest
      ? "等待位置"
      : !activeFence || inside === null
        ? "未设置安全区域"
        : inside
          ? "在安全区域内"
          : "已离开安全区域";
  const statusWarn = Boolean(latest && activeFence && inside === false);
  const addressText = latest
    ? latest.source === "demo"
      ? `坐标 ${latest.lat.toFixed(5)}, ${latest.lng.toFixed(5)}`
      : address ?? `坐标 ${latest.lat.toFixed(5)}, ${latest.lng.toFixed(5)}`
    : "还没有位置记录";
  const distanceText =
    latest && activeFence && distanceFromCenter !== null
      ? inside
        ? `距安全区域中心约 ${formatMeters(distanceFromCenter)}`
        : `已离开安全区域约 ${formatMeters(distanceFromCenter - activeFence.shape.radius)}`
      : !latest
        ? "等待位置更新"
        : "还没有安全区域";
  const accuracyText =
    latest && latest.accuracy !== null ? `精度约 ±${Math.round(latest.accuracy)} 米` : "";
  const realMapUrl =
    latest && latest.source !== "demo"
      ? "https://uri.amap.com/marker" +
        `?position=${latest.lng.toFixed(6)},${latest.lat.toFixed(6)}` +
        `&name=${encodeURIComponent("长辈当前位置")}` +
        "&coordinate=wgs84&callnative=1&src=yinling-shouhu"
      : null;
  const secureContext = typeof window === "undefined" ? true : window.isSecureContext;
  const shareStatusText = shareError
    ? shareError
    : sharing
      ? lastShareAt
        ? `正在共享位置 · 最近上报 ${formatTime(lastShareAt)}`
        : "正在获取定位…"
      : !secureContext
        ? "当前页面不是 HTTPS，浏览器不会返回手机定位。"
        : latest?.source === "browser"
          ? "上次位置由手机定位上报"
          : latest?.source === "demo"
            ? "当前显示演示位置，开启共享后会上报真实位置"
            : "未开启实时位置共享";

  async function createHomeGeofence() {
    if (!latest || latest.source === "demo" || Date.now() - latest.ts > 10 * 60 * 1000) {
      toast.push({
        kind: "danger",
        title: "先拿到当前位置",
        detail:
          latest?.source === "demo"
            ? "当前是演示位置，请先开启位置共享，拿到手机定位后再设置安全区域。"
            : "请先开启位置共享，确认拿到当前位置后再设置安全区域。"
      });
      return;
    }
    setBusy(true);
    try {
      await api.safety.createGeofence({
        name: "家附近",
        shape: { type: "circle", center: [latest.lng, latest.lat], radius: 800 }
      });
      toast.push({
        kind: "ok",
        title: "已设置安全区域",
        detail: "以最后定位为中心，家附近 800 米"
      });
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
      if (!activeFence) {
        toast.push({
          kind: "normal",
          title: "还没有安全区域",
          detail: "请先设置安全区域，再模拟越界。"
        });
        return;
      }
      const [centerLng, centerLat] = activeFence.shape.center;
      const offsetMeters = activeFence.shape.radius + 300;
      const lat = centerLat + offsetMeters / 111_320;
      const lng =
        centerLng + offsetMeters / (111_320 * Math.cos((centerLat * Math.PI) / 180));
      const result = await api.safety.reportLocation({
        lat,
        lng,
        source: "demo"
      });
      if (!result.alerts.length) {
        toast.push({
          kind: "ok",
          title: "演示位置已写入",
          detail: "当前仍在安全区域内。"
        });
      } else if (!connected) {
        toast.push({
          kind: "danger",
          title: "已生成越界提醒",
          detail: "这是演示数据，家人端会看到一条越界提醒。"
        });
      } else {
        toast.push({
          kind: "normal",
          title: "已生成越界提醒",
          detail: "这是演示数据，不是手机实时定位。"
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
              <h2>{activeFence ? activeFence.name : "还没有设置"}</h2>
            </div>
            <span className={`ys-stateMark ${statusWarn ? "ys-stateMark--warn" : ""}`}>
              {statusText}
            </span>
          </div>

          <svg
            className="ys-mapSvg"
            viewBox="0 0 420 260"
            role="img"
            aria-label={`安全区域示意图，${statusText}`}
          >
            <rect width="420" height="260" fill="#F7F8F3" />
            <path d="M-20 78 C 70 54, 122 96, 206 72 S 348 56, 440 88" stroke="#D6E0D8" strokeWidth="24" fill="none" opacity="0.55" />
            <path d="M-20 112 C 82 88, 132 128, 214 104 S 352 90, 440 120" stroke="#E4EBE5" strokeWidth="10" fill="none" opacity="0.8" />
            <path d="M48 260 C 68 190, 110 158, 154 142" stroke="#D6E0D8" strokeWidth="14" fill="none" opacity="0.5" />
            <path d="M330 260 C 310 204, 276 176, 244 152" stroke="#D6E0D8" strokeWidth="14" fill="none" opacity="0.5" />
            {activeFence && (
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
            {latest && activeFence && (
              <line
                x1="210"
                y1="132"
                x2={marker.x}
                y2={marker.y}
                stroke={inside === false ? "#8C3B2E" : "#3F5A50"}
                strokeWidth="1.2"
                strokeDasharray="3 5"
                opacity="0.55"
              />
            )}
            <circle
              cx={marker.x}
              cy={marker.y}
              r="7"
              fill={inside === false ? "#8C3B2E" : "#3F5A50"}
            />
            <circle
              cx={marker.x}
              cy={marker.y}
              r="16"
              fill="none"
              stroke={inside === false ? "#8C3B2E" : "#3F5A50"}
              opacity="0.25"
            />
            <text x="210" y="222" textAnchor="middle" fill="#7A8883" fontSize="12">
              {activeFence
                ? `${activeFence.name} · 半径 ${activeFence.shape.radius} 米`
                : "设置安全区域后显示围栏"}
            </text>
          </svg>

          <div className="ys-mapMeta">
            <span>{addressText}</span>
            <span>
              {latest ? `${locationSourceLabel(latest.source)} · ${formatTime(latest.ts)}` : "等待更新"}
            </span>
          </div>
          <p className="ys-mapDistance">
            {distanceText}
            {accuracyText ? ` · ${accuracyText}` : ""}
            {marker.clamped ? " · 实际位置在更远方向，圆点已贴边显示" : ""}
          </p>
          {latest?.source === "demo" ? (
            <p className="ys-mapDemoNote">
              这是演示数据，不是手机实时定位；开启位置共享后会显示真实位置。
            </p>
          ) : null}

          <div className={`ys-shareStatus ${shareError ? "ys-shareStatus--warn" : ""}`}>
            <Icon name={sharing ? "activity" : "mapPin"} size="sm" />
            <span>{shareStatusText}</span>
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
            {realMapUrl ? (
              <a className="btn" href={realMapUrl} target="_blank" rel="noreferrer">
                <Icon name="mapPin" size="sm" />
                在真实地图中查看
              </a>
            ) : null}
            {activeFence ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void simulateExit()}>
                <Icon name="refresh" size="sm" />
                {busy ? "更新中…" : "演示 · 模拟走出围栏"}
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void createHomeGeofence()}>
                <Icon name="plus" size="sm" />
                以当前位置设置 800m
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
                  placeholder="如：鼓楼区某小区北门（有定位时自动填入）"
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
