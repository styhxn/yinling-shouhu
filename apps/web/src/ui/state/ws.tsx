import React from "react";
import type { AppEvent } from "@eha/shared";
import { useToast } from "./toast.js";
import { usePrivacy } from "./privacy.js";
import { speakNow } from "../voice/tts.js";

type WsApi = {
  connected: boolean;
  lastEvent: AppEvent | null;
  recentEvents: AppEvent[];
};

const Ctx = React.createContext<WsApi | null>(null);

export function WsProvider({ wsUrl, children }: { wsUrl: string; children: React.ReactNode }) {
  const toast = useToast();
  const { settings } = usePrivacy();
  const [connected, setConnected] = React.useState(false);
  const [lastEvent, setLastEvent] = React.useState<AppEvent | null>(null);
  const [recentEvents, setRecentEvents] = React.useState<AppEvent[]>([]);
  const autoSpeakRef = React.useRef<boolean>(settings.autoSpeakEnabled);

  React.useEffect(() => {
    autoSpeakRef.current = settings.autoSpeakEnabled;
  }, [settings.autoSpeakEnabled]);

  React.useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(String(msg.data)) as AppEvent;
        setLastEvent(event);
        setRecentEvents((prev) => [event, ...prev].slice(0, 12));

        if (event.type === "fall.detected") {
          toast.push({ kind: "danger", title: "检测到跌倒风险", detail: "请确认是否需要帮助" });
          if (!(event as any)?.payload?.__silentTts) speakNow("检测到跌倒风险，请确认是否需要帮助。");
        }
        if (event.type === "reminder.due") {
          toast.push({ kind: "ok", title: "智能提醒", detail: event.payload.title });
          if (!(event as any)?.payload?.__silentTts) speakNow(event.payload.title);
        }
        if (event.type === "emergency.triggered") {
          toast.push({ kind: "danger", title: "紧急呼救已触发", detail: event.payload.reason });
          speakNow("已触发紧急呼救。");
        }
        if (event.type === "qa.answered") {
          toast.push({ kind: "normal", title: "问答已生成", detail: "可前往问答页查看" });
        }
        if (event.type === "vitality.alert") {
          const scores = Array.isArray((event as any).payload?.scores)
            ? (event as any).payload.scores
            : [];
          const title = "活力指数持续偏低";
          const detail =
            scores.length === 3
              ? `最近三次活力指数约为 ${scores.join(" / ")}，建议多关注与陪伴。`
              : "最近活力指数持续偏低，建议多关注与陪伴。";
          toast.push({ kind: "danger", title, detail });
        }
        if (event.type === "companion.command") {
          const p = (event as any).payload ?? {};
          const content = typeof p.content === "string" ? p.content : "";
          if (!content) return;
          toast.push({ kind: "ok", title: "收到陪伴消息", detail: content });
          if (!(event as any)?.payload?.__silentTts && autoSpeakRef.current) speakNow(content);
        }
      } catch {
        undefined;
      }
    };
    return () => ws.close();
  }, [toast, wsUrl]);

  return <Ctx.Provider value={{ connected, lastEvent, recentEvents }}>{children}</Ctx.Provider>;
}

export function useWs() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("WsProvider missing");
  return ctx;
}
