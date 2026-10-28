import React from "react";
import type { AppEvent, SafetyAlertSnapshot } from "@eha/shared";
import { useAuth } from "./auth.js";
import { useToast } from "./toast.js";

type ConnectionState = "idle" | "connecting" | "online" | "offline";

type RealtimeApi = {
  state: ConnectionState;
  connected: boolean;
  lastEvent: AppEvent | null;
  recentEvents: AppEvent[];
  reconnect: () => void;
};

const Ctx = React.createContext<RealtimeApi | null>(null);

function resolveUrl() {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function alertDetail(alert: SafetyAlertSnapshot) {
  const payload =
    alert.payload && typeof alert.payload === "object"
      ? (alert.payload as Record<string, unknown>)
      : {};
  if (alert.type === "geofence.exit") {
    const name = typeof payload.geofenceName === "string" ? payload.geofenceName : "安全区域";
    const distance =
      typeof payload.distanceMeters === "number" ? `，约 ${payload.distanceMeters} 米外` : "";
    return `已离开${name}${distance}。请尽快电话确认。`;
  }
  if (alert.type === "scam.high") {
    return "检测到高风险诈骗信息，请先停止转账。";
  }
  if (alert.type === "cooling_off") {
    return "有一笔转账正在冷静期，请尽快确认。";
  }
  return "有一条新的安全提醒，请及时查看。";
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const toast = useToast();
  const [state, setState] = React.useState<ConnectionState>("idle");
  const [lastEvent, setLastEvent] = React.useState<AppEvent | null>(null);
  const [recentEvents, setRecentEvents] = React.useState<AppEvent[]>([]);

  const socketRef = React.useRef<WebSocket | null>(null);
  const retryTimerRef = React.useRef<number | null>(null);
  const pingTimerRef = React.useRef<number | null>(null);
  const attemptRef = React.useRef(0);
  const lastMessageRef = React.useRef(0);
  const connectRef = React.useRef<() => void>(() => undefined);
  const role = me?.user.role ?? null;
  const userId = me?.user.id ?? null;

  const notify = React.useCallback(
    (event: AppEvent) => {
      switch (event.type) {
        case "safety.alert":
          if (role === "family" && event.payload.alert.type === "cooling_off") break;
          toast.push({
            kind: "danger",
            title: "安全提醒",
            detail: alertDetail(event.payload.alert)
          });
          break;
        case "safety.alert.updated":
          if (event.payload.alert.status !== "open") {
            toast.push({ kind: "ok", title: "安全提醒已处理" });
          }
          break;
        case "family.confirm.requested":
          if (role === "family") {
            toast.push({
              kind: "danger",
              title: "家人发起转账确认",
              detail: "请先电话核实，再决定是否同意。"
            });
          }
          break;
        case "family.confirm.responded":
          if (role === "elder") {
            toast.push({
              kind: "normal",
              title: "家属已处理确认",
              detail: "请查看结果，先不要急着转账。"
            });
          }
          break;
        case "emergency.triggered":
          toast.push({
            kind: "danger",
            title: "紧急呼救已触发",
            detail: event.payload.reason
          });
          break;
        default:
          break;
      }
    },
    [role, toast]
  );

  const scheduleReconnect = React.useCallback(() => {
    if (!userId) return;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    const attempt = attemptRef.current;
    attemptRef.current = Math.min(attempt + 1, 8);
    const delay = Math.min(15_000, 1_000 * 1.8 ** attempt) + Math.random() * 400;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      connectRef.current();
    }, delay);
  }, [userId]);

  const connect = React.useCallback(() => {
    if (!userId) return;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const previous = socketRef.current;
    socketRef.current = null;
    if (previous) {
      previous.onclose = null;
      previous.close();
    }
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    setState("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(resolveUrl());
    } catch {
      setState("offline");
      scheduleReconnect();
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      attemptRef.current = 0;
      lastMessageRef.current = Date.now();
      setState("online");
      pingTimerRef.current = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastMessageRef.current > 65_000) {
          socket.close();
          return;
        }
        socket.send("ping");
      }, 25_000);
    };

    socket.onmessage = (message) => {
      lastMessageRef.current = Date.now();
      if (message.data === "pong") return;
      try {
        const event = JSON.parse(String(message.data)) as AppEvent;
        setLastEvent(event);
        setRecentEvents((prev) => [event, ...prev].slice(0, 20));
        notify(event);
      } catch {
        undefined;
      }
    };

    socket.onclose = (event) => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      setState("offline");
      if (event.code === 4401) return;
      scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }, [notify, scheduleReconnect, userId]);

  connectRef.current = connect;

  React.useEffect(() => {
    if (!userId) {
      setState("idle");
      setLastEvent(null);
      setRecentEvents([]);
      return;
    }
    attemptRef.current = 0;
    connect();
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [connect, userId]);

  React.useEffect(() => {
    const onOnline = () => {
      if (!userId || socketRef.current) return;
      attemptRef.current = 0;
      connectRef.current();
    };
    const onOffline = () => setState("offline");
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !userId || socketRef.current) return;
      attemptRef.current = 0;
      connectRef.current();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  const reconnect = React.useCallback(() => {
    attemptRef.current = 0;
    connectRef.current();
  }, []);

  const value = React.useMemo<RealtimeApi>(
    () => ({
      state,
      connected: state === "online",
      lastEvent,
      recentEvents,
      reconnect
    }),
    [state, lastEvent, recentEvents, reconnect]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("RealtimeProvider missing");
  return ctx;
}

export function RealtimeBadge() {
  const { state, reconnect } = useRealtime();
  if (state === "idle") return null;
  const label =
    state === "online" ? "实时连接" : state === "connecting" ? "连接中" : "已断开";
  return (
    <button
      type="button"
      className={`ys-liveBadge ys-liveBadge--${state}`}
      onClick={state === "online" ? undefined : reconnect}
      title={state === "online" ? "位置与告警实时同步中" : "点击重新连接"}
    >
      <span className="ys-liveDot" />
      {label}
    </button>
  );
}
