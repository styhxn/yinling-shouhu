import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { HelpHomeCard } from "../../lib/types.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";
import { useToast } from "../state/toast.js";
import "./care.css";

const DIRECTIONS: Record<string, number> = {
  北: 0,
  东北: 45,
  东: 90,
  东南: 135,
  南: 180,
  西南: 225,
  西: 270,
  西北: 315
};

function formatTime(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
}

function sourceLabel(source: string | null) {
  if (source === "browser") return "手机实时定位";
  if (source === "wearable") return "手环定位";
  if (source === "demo") return "演示位置，非实时";
  return "位置记录";
}

export function HelpHomePage() {
  const toast = useToast();
  const [card, setCard] = React.useState<HelpHomeCard | null>(null);
  const [alertSent, setAlertSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => () => stopSpeaking(), []);

  async function requestHelp(point?: { lat: number; lng: number; accuracy?: number }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.safety.helpHome(point ? point : {});
      setCard(res.card);
      setAlertSent(true);
      speakNow(res.card.spoken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "暂时没联系上家人，请直接拨打电话");
    } finally {
      setBusy(false);
    }
  }

  function notifyFamily() {
    if (busy || locating) return;
    if (!("geolocation" in navigator)) {
      toast.push({
        kind: "normal",
        title: "这个设备不能定位",
        detail: "先按最后一次记录的位置通知家人。"
      });
      void requestHelp();
      return;
    }
    if (!window.isSecureContext) {
      toast.push({
        kind: "normal",
        title: "当前页面不能获取实时位置",
        detail: "浏览器只允许 HTTPS 页面定位，先按最后一次记录通知家人。"
      });
      void requestHelp();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void requestHelp({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.min(5000, Math.round(position.coords.accuracy || 0))
        });
      },
      () => {
        setLocating(false);
        toast.push({
          kind: "normal",
          title: "没拿到当前位置",
          detail: "先按最后一次记录的位置通知家人，请保持电话畅通。"
        });
        void requestHelp();
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 }
    );
  }

  const rotation = card?.direction ? (DIRECTIONS[card.direction] ?? 0) - 90 : 0;
  const currentTitle =
    card?.currentAddress ?? (card?.lastLocation ? "已定位到您的位置" : "暂未拿到位置");
  const currentDetail = card
    ? card.currentAddress
      ? `${sourceLabel(card.locationSource)} · ${card.lastLocation ? formatTime(card.lastLocation.ts) : "暂无时间"}`
      : card.lastLocation
        ? `坐标 ${card.lastLocation.lat.toFixed(5)}, ${card.lastLocation.lng.toFixed(5)} · ${formatTime(card.lastLocation.ts)}`
        : "先站在安全的地方，给家人打电话"
    : "";
  const accuracyText =
    card?.lastLocation && card.lastLocation.accuracy !== null
      ? `定位精度约 ±${card.lastLocation.accuracy} 米`
      : "";
  const distanceDisplay =
    card && card.distanceMeters !== null
      ? card.distanceMeters >= 1000
        ? { value: (card.distanceMeters / 1000).toFixed(1), unit: "公里" }
        : { value: String(card.distanceMeters), unit: "米" }
      : { value: "—", unit: "米" };

  return (
    <div className="yl-page ys-helpPage">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">安心守护 · 一键回家</p>
          <h1>我找不到家了</h1>
          <p>别着急，先站在安全、明亮的地方。按一下，家人就能看到您的位置。</p>
        </div>
        <Link to="/elder/safety" className="btn">返回守护</Link>
      </section>

      {!card ? (
        <section className="ys-helpStart">
          <div className="ys-helpStartIcon">
            <Icon name="mapPin" size="xl" />
          </div>
          <h2>先别走动，按下面的大按钮</h2>
          <p>系统会先获取您现在的位置；拿不到定位时，再用最后一次记录通知家人。</p>
          {!window.isSecureContext ? (
            <p className="ys-helpWarn">
              当前页面不是 HTTPS，浏览器不会返回实时位置；会先用最后一次记录通知家人。
            </p>
          ) : null}
          <button
            type="button"
            className="ys-helpBigBtn"
            disabled={busy || locating}
            onClick={notifyFamily}
          >
            <Icon name="shieldCheck" size="lg" />
            {locating ? "正在获取当前位置…" : busy ? "正在通知家人…" : "通知家人，带我回家"}
          </button>
          <div className="ys-helpFallback">
            <span>电话打不通？</span>
            <a href="tel:110" className="btn btnDanger">
              <Icon name="phone" size="sm" />
              拨打 110
            </a>
          </div>
          {error && <p className="ys-helpError">{error}</p>}
        </section>
      ) : (
        <>
          <section className="ys-helpCard">
            <div className="ys-helpCardTop">
              <span className="ys-helpNotified">
                <Icon name="circleCheck" size="sm" />
                已通知家人
              </span>
              <span className="ys-helpTime">
                位置时间：{card.lastLocation ? formatTime(card.lastLocation.ts) : "暂无"}
                {card.lastLocation && card.locationLive ? " · 刚刚定位" : ""}
              </span>
            </div>
            <div className="ys-helpAddress">
              <span className="ys-kicker">您现在的位置</span>
              <h2>{currentTitle}</h2>
              <p>{currentDetail}</p>
              {accuracyText ? <p className="ys-helpFinePrint">{accuracyText}</p> : null}
            </div>
            {!card.locationLive ? (
              <p className="ys-helpWarn">
                {card.locationSource === "demo"
                  ? "当前没有实时定位，下面是演示位置，不能代表您现在站的地方。"
                  : "这不是实时定位，可能和您现在的位置不一致，请同时给家人打电话确认。"}
              </p>
            ) : null}
            <p className="ys-helpHomeLine">
              <span>您的家</span>
              <strong>{card.homeAddress ?? "家庭地址还没登记"}</strong>
            </p>
            <div className="ys-helpCompassRow">
              <div className="ys-helpCompass">
                <span className="ys-helpCompassNorth">北</span>
                <span
                  className="ys-helpCompassArrow"
                  style={{ transform: `rotate(${rotation}deg)` }}
                  aria-hidden="true"
                >
                  <Icon name="arrowRight" size="xl" />
                </span>
                <span className="ys-helpCompassLabel">
                  {card.direction ? `家在${card.direction}方向` : "方向未知"}
                </span>
              </div>
              <div className="ys-helpDistance">
                <strong>{distanceDisplay.value}</strong>
                <span>{distanceDisplay.unit}</span>
                <small>
                  {card.walkMinutes === null
                    ? "等待家人确认位置"
                    : card.distanceMeters !== null && card.distanceMeters > 2000
                      ? "距离较远，建议等家人来接"
                      : `步行约 ${card.walkMinutes} 分钟`}
                </small>
              </div>
            </div>
            <div className="ys-helpActions">
              {card.familyPhone ? (
                <a href={`tel:${card.familyPhone}`} className="ys-helpCallBtn">
                  <Icon name="phone" size="lg" />
                  给{card.familyRelation ?? "家人"}打电话
                </a>
              ) : (
                <span className="ys-helpNoPhone">家人电话还没登记</span>
              )}
              <a href="tel:110" className="btn btnDanger">
                <Icon name="phone" size="sm" />
                拨打 110
              </a>
              <button
                type="button"
                className="btn"
                disabled={busy || locating}
                onClick={notifyFamily}
              >
                <Icon name="refresh" size="sm" />
                {locating ? "正在定位…" : busy ? "通知中…" : "用当前位置再通知一次"}
              </button>
            </div>
          </section>

          <section className="ys-helpSteps">
            <span className="ys-kicker">一步一步来</span>
            <h2>先做这几件事</h2>
            <ol>
              {card.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="ys-finePrint">{card.disclaimer}</p>
            {alertSent && (
              <p className="ys-finePrint">
                家人端已收到一条高优先级求助提醒，请保持电话畅通，站在安全、明亮的地方等候。
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
