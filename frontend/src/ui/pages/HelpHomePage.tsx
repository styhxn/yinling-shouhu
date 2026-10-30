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

function isStale(ts: number) {
  return Date.now() - ts > 10 * 60 * 1000;
}

export function HelpHomePage() {
  const toast = useToast();
  const [card, setCard] = React.useState<HelpHomeCard | null>(null);
  const [alertSent, setAlertSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => () => stopSpeaking(), []);

  async function requestHelp(point?: { lat: number; lng: number }) {
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

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.push({ kind: "normal", title: "这个设备不能定位", detail: "先用最后一次位置通知家人。" });
      void requestHelp();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void requestHelp({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => {
        setLocating(false);
        toast.push({
          kind: "normal",
          title: "没拿到当前位置",
          detail: "先用最后一次记录的位置通知家人。"
        });
        void requestHelp();
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 }
    );
  }

  const rotation = card?.direction ? (DIRECTIONS[card.direction] ?? 0) - 90 : 0;

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
          <p>系统会把最后一次位置发给家人，并告诉您家大概在哪个方向。</p>
          <button
            type="button"
            className="ys-helpBigBtn"
            disabled={busy || locating}
            onClick={() => void requestHelp()}
          >
            <Icon name="shieldCheck" size="lg" />
            {busy ? "正在通知家人…" : "通知家人，带我回家"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || locating}
            onClick={useCurrentLocation}
          >
            <Icon name="mapPin" size="sm" />
            {locating ? "正在定位…" : "用我现在的位置通知"}
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
                {card.lastLocation && isStale(card.lastLocation.ts) ? " · 位置较旧，建议同时打电话确认" : ""}
              </span>
            </div>
            <div className="ys-helpAddress">
              <span className="ys-kicker">您的家</span>
              <h2>{card.address}</h2>
              <p>{card.homeName}</p>
            </div>
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
                <strong>{card.distanceMeters === null ? "—" : card.distanceMeters}</strong>
                <span>米</span>
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
                disabled={busy}
                onClick={() => void requestHelp()}
              >
                <Icon name="refresh" size="sm" />
                {busy ? "通知中…" : "再通知一次"}
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
