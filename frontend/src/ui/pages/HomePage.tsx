import React from "react";
import { Link } from "react-router-dom";
import { useWs } from "../state/ws.js";
import { useApi } from "../state/api.js";
import type { Mode, WeatherToday } from "@eha/shared";
import { Icon } from "../components/Icon.js";

export function HomePage({ audience }: { audience?: Mode }) {
  const { connected, recentEvents } = useWs();
  const api = useApi();
  const [weather, setWeather] = React.useState<WeatherToday | null>(null);
  const [adviceBusy, setAdviceBusy] = React.useState(false);
  const [adviceText, setAdviceText] = React.useState<string>("");
  const [adviceError, setAdviceError] = React.useState<string>("");
  const [addr, setAddr] = React.useState("");
  const [weatherError, setWeatherError] = React.useState<string>("");

  React.useEffect(() => {
    api
      .getProfile()
      .then((p) => {
        const addresses = p?.addresses ?? [];
        const id = p?.defaultAddressId ?? "";
        const pick = (id ? addresses.find((a) => a.id === id) : null) ?? addresses[0] ?? null;
        const text = pick?.fullText || [pick?.province, pick?.city, pick?.district, pick?.detail].filter((x) => x).join("");
        setAddr(text ?? "");
        if (text && text.trim()) {
          setWeatherError("");
          api
            .getWeatherToday(text)
            .then((w) => setWeather(w))
            .catch((err) => {
              setWeather(null);
              setWeatherError(err instanceof Error ? err.message : "天气查询失败");
            });
        }
      })
      .catch(() => undefined);
  }, [api]);

  return (
    <div className="stack">
      <div className="panel overviewPanel">
        <div className="overviewHeader">
          <div className="overviewTitleWrap">
            <h1 className="h1">总览</h1>
            <div className="muted">
              后端连接：{connected ? "已连接" : "未连接"}
            </div>
          </div>
          <div className="overviewStatus">
            <div className={`statusDot ${connected ? "statusDot--ok" : "statusDot--error"}`} />
            <span>{connected ? "系统正常" : "连接中断"}</span>
          </div>
        </div>
      </div>

      <div className="panel weatherPanel">
        <div className="weatherHeader">
          <div className="weatherTitle">
            <Icon name="sun" className="weatherIcon" />
            今日天气
          </div>
        </div>
        <div className="weatherSearch">
          <input
            className="input"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="输入地址查询，例如：深圳市南山区科技园"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              (e.currentTarget.nextSibling as any)?.click?.();
            }}
          />
          <button
            className="btn btnPrimary"
            onClick={() => {
              const q = addr.trim();
              if (!q) {
                setWeatherError("请先输入地址");
                setWeather(null);
                return;
              }
              setAdviceError("");
              setWeatherError("");
              api
                .getWeatherToday(q)
                .then((w) => setWeather(w))
                .catch((err) => {
                  setWeather(null);
                  setWeatherError(err instanceof Error ? err.message : "天气查询失败");
                });
            }}
          >
            查询
          </button>
        </div>
        <div className="weatherContent">
          <div className="weatherMain">
            <div className="weatherCity">{weather?.city ?? "—"}</div>
            <div className="weatherSummary">{weather?.summary ?? "—"}</div>
            <div className="weatherRange">
              {typeof weather?.loC === "number" && typeof weather?.hiC === "number"
                ? `${weather.loC}°C ~ ${weather.hiC}°C`
                : typeof weather?.loC === "number"
                  ? `最低 ${weather.loC}°C`
                  : typeof weather?.hiC === "number"
                    ? `最高 ${weather.hiC}°C`
                    : ""}
              {typeof weather?.updatedAt === "number" ? ` · ${new Date(weather.updatedAt).toLocaleTimeString("zh-CN")}` : ""}
            </div>
          </div>
          <div className="weatherTemp">
            {typeof weather?.tempC === "number" ? `${weather.tempC}°C` : "—"}
          </div>
        </div>
        <div className="weatherActions">
          <button
            className="btn btnPrimary"
            disabled={adviceBusy}
            onClick={async () => {
              const q = addr.trim();
              if (!q) {
                setAdviceError("请先输入地址");
                setAdviceText("");
                return;
              }
              setAdviceBusy(true);
              setAdviceError("");
              try {
                const res = await api.getWeatherAdvice("今天出行和穿衣有什么建议？", q);
                setAdviceText(res.raw ?? "");
              } catch (err) {
                setAdviceText("");
                setAdviceError(err instanceof Error ? err.message : "获取AI建议失败");
              } finally {
                setAdviceBusy(false);
              }
            }}
          >
            {adviceBusy ? (
              <>
                <Icon name="spinner" className="btnSpinner" />
                生成中…
              </>
            ) : (
              <>
                <Icon name="sparkles" className="btnIcon" />
                AI建议
              </>
            )}
          </button>
          {(adviceText || adviceError) && (
            <button
              className="btn"
              onClick={() => {
                setAdviceText("");
                setAdviceError("");
              }}
            >
              清空
            </button>
          )}
        </div>
        {adviceError ? (
            <div className="weatherAdvice weatherAdvice--error">
              <Icon name="alertCircle" />
              {adviceError}
            </div>
        ) : adviceText ? (
          <div className="weatherAdvice">{adviceText}</div>
        ) : null}
        {weatherError && (
          <div className="weatherError">{weatherError}</div>
        )}
      </div>

      <div className="grid">
        <div className="card heroCard featureCard">
          <div className="featureCard__icon featureCard__icon--primary">
            <Icon name="message" />
          </div>
          <div className="cardHeader">
            <div className="cardTitle">智能陪伴</div>
            <Link to="/smart-companion?view=mini" className="btn btnPrimary">
              进入对话
            </Link>
          </div>
          <div className="cardDesc">数字人驱动的陪伴式对话入口，支持连续提问与对话历史。</div>
        </div>

        <div className="card heroCard featureCard">
          <div className="featureCard__icon featureCard__icon--accent">
            <Icon name="mic" />
          </div>
          <div className="cardHeader">
            <div className="cardTitle">语音问答</div>
            <Link to="/qa" className="btn btnPrimary">
              立即提问
            </Link>
          </div>
          <div className="cardDesc">
            支持语音与文字提问，适合询问饮食与生活方式问题。
          </div>
        </div>

        <div className="card dashSide statusCard">
          <div className="cardHeader">
            <div className="cardTitle">实时状态</div>
            <Link to="/monitor" className="btn">
              详情
            </Link>
          </div>
          <div className="statusList">
            <div className="statusItem">
              <div className="statusItem__label">连接状态</div>
              <div className={`statusItem__value ${connected ? "statusItem__value--ok" : "statusItem__value--error"}`}>
                <span className={`statusDot statusDot--sm ${connected ? "statusDot--ok" : "statusDot--error"}`} />
                {connected ? "已连接" : "未连接"}
              </div>
            </div>
            <div className="statusItem">
              <div className="statusItem__label">久坐提醒</div>
              <div className="statusItem__value statusItem__value--ok">
                <span className="statusDot statusDot--sm statusDot--ok" />
                已启用
              </div>
            </div>
            <div className="statusItem">
              <div className="statusItem__label">跌倒检测</div>
              <div className="statusItem__value statusItem__value--ok">
                <span className="statusDot statusDot--sm statusDot--ok" />
                已启用
              </div>
            </div>
            <div className="statusItem">
              <div className="statusItem__label">最近事件</div>
              <div className="statusItem__value">{recentEvents[0]?.type ?? "暂无"}</div>
            </div>
          </div>
          {recentEvents.length > 0 && (
            <div className="recentEvents">
              <div className="recentEvents__title">最近事件</div>
              <div className="recentEvents__list">
                {recentEvents.slice(0, 4).map((e, idx) => (
                  <div key={`${e.type}_${e.ts}_${idx}`} className="recentEvent">
                    <span className="recentEvent__type">{e.type}</span>
                    <span className="recentEvent__time">{new Date(e.ts).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <SmallCard 
          title="智能医嘱" 
          desc="风险分级与日常建议生成" 
          to="/advice"
          icon={<Icon name="activity" />}
        />
        <SmallCard 
          title="智能提醒" 
          desc="吃药/喝水/运动/自测" 
          to="/reminders"
          icon={<Icon name="bell" />}
        />
        <SmallCard 
          title="设备接入" 
          desc="华为/小米等设备数据同步" 
          to="/devices"
          icon={<Icon name="smartphone" />}
        />
      </div>
    </div>
  );
}

function SmallCard({ title, desc, to, icon }: { title: string; desc: string; to: string; icon: React.ReactNode }) {
  return (
    <Link to={to} className="card dashSmall smallCard">
      <div className="smallCard__icon">{icon}</div>
      <div className="smallCard__content">
        <div className="cardTitle">{title}</div>
        <div className="cardDesc">{desc}</div>
      </div>
      <div className="smallCard__arrow">
        <Icon name="arrowRight" />
      </div>
    </Link>
  );
}
