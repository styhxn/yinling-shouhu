import React from "react";
import {
  announce as announceTts,
  isTtsSupported,
  setTtsEnabled,
  setTtsRate,
  speakNow,
  stopSpeaking,
  unlockTtsInGesture
} from "../voice/tts.js";

/**
 * 无障碍（长辈友好）设置
 * -----------------------------------------------------------------------------
 * 两项能力：
 *  1. 字体放大：整页等比缩放（CSS zoom），不仅放大文字，按钮、行高、触控区同步放大，
 *     适合视力下降的长辈；浏览器不支持 zoom 时退回根字号放大。
 *  2. 语音播报：全局开关 + 语速，配合无工具条使用；自动播报走 announce()，
 *     手动朗读走 speakNow()，互不影响。
 *
 * 设置落在 localStorage（纯前端、无需后端改动），刷新与换页后保持。
 */

/** 字号档位：100% / 115% / 130% / 150% */
export const FONT_STEPS = [1, 1.15, 1.3, 1.5] as const;

/** 语速档位 */
export const RATE_STEPS = [
  { label: "慢", value: 0.8 },
  { label: "正常", value: 0.95 },
  { label: "快", value: 1.15 }
] as const;

const STORAGE_KEY = "yl.a11y.v1";

type Persisted = {
  fontStep: number;
  voiceEnabled: boolean;
  rate: number;
};

const DEFAULT_PERSISTED: Persisted = {
  fontStep: 0,
  voiceEnabled: true,
  rate: 0.95
};

function readPersisted(): Persisted {
  if (typeof window === "undefined") return { ...DEFAULT_PERSISTED };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERSISTED };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const fontStep =
      typeof parsed.fontStep === "number" &&
      parsed.fontStep >= 0 &&
      parsed.fontStep < FONT_STEPS.length
        ? parsed.fontStep
        : DEFAULT_PERSISTED.fontStep;
    return {
      fontStep,
      voiceEnabled:
        typeof parsed.voiceEnabled === "boolean" ? parsed.voiceEnabled : DEFAULT_PERSISTED.voiceEnabled,
      rate: typeof parsed.rate === "number" ? parsed.rate : DEFAULT_PERSISTED.rate
    };
  } catch {
    return { ...DEFAULT_PERSISTED };
  }
}

function writePersisted(next: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    undefined;
  }
}

/** 当前浏览器是否支持 CSS zoom（Firefox < 126 不支持） */
function supportsZoom(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof CSS !== "undefined" && typeof CSS.supports === "function"
      ? CSS.supports("zoom", "1.3")
      : false;
  } catch {
    return false;
  }
}

type A11yState = {
  /** 当前缩放倍率，1 为原始大小 */
  fontScale: number;
  /** 当前档位下标 */
  fontStep: number;
  canEnlarge: boolean;
  canShrink: boolean;
  enlarge: () => void;
  shrink: () => void;
  resetFont: () => void;
  /** 自动播报开关 */
  voiceEnabled: boolean;
  toggleVoice: () => void;
  /** 语速 */
  rate: number;
  setRate: (rate: number) => void;
  /** 手动朗读（无视开关） */
  say: (text: string) => void;
  /** 自动播报（受开关控制） */
  announce: (text: string) => void;
  /** 朗读当前页面正文 */
  readPage: () => void;
  /** 正在播报 / 停止 */
  stop: () => void;
  ttsSupported: boolean;
};

const Ctx = React.createContext<A11yState | null>(null);

/** 取当前页面正文（优先 main，其次整页），压成一段可朗读文本 */
function collectPageText(limit = 800): string {
  if (typeof document === "undefined") return "";
  const main = document.querySelector("main") ?? document.body;
  const raw = (main as HTMLElement).innerText ?? "";
  return raw.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const initial = React.useMemo<Persisted>(() => readPersisted(), []);

  const [fontStep, setFontStep] = React.useState<number>(initial.fontStep);
  const [voiceEnabled, setVoiceEnabled] = React.useState<boolean>(initial.voiceEnabled);
  const [rate, setRateState] = React.useState<number>(initial.rate);
  const ttsSupported = React.useMemo(() => isTtsSupported(), []);

  const fontScale = FONT_STEPS[fontStep] ?? 1;

  /* ------------------------------------------------ 应用整页缩放 */
  React.useEffect(() => {
    const root = document.documentElement;
    if (supportsZoom()) {
      root.style.setProperty("zoom", String(fontScale));
      root.style.removeProperty("font-size");
    } else if (fontScale === 1) {
      root.style.removeProperty("font-size");
    } else {
      // 兜底：放大根字号（只对 rem / 继承字号生效）
      root.style.setProperty("font-size", `${16 * fontScale}px`);
    }
    root.dataset.a11yZoom = fontScale === 1 ? "off" : "on";
    return () => {
      root.style.removeProperty("zoom");
      root.style.removeProperty("font-size");
      delete root.dataset.a11yZoom;
    };
  }, [fontScale]);

  /* ------------------------------------------------ 同步语音引擎 + 持久化 */
  React.useEffect(() => {
    setTtsEnabled(voiceEnabled);
  }, [voiceEnabled]);

  React.useEffect(() => {
    setTtsRate(rate);
  }, [rate]);

  React.useEffect(() => {
    writePersisted({ fontStep, voiceEnabled, rate });
  }, [fontStep, voiceEnabled, rate]);

  /* ------------------------------------------------ 操作 */
  const enlarge = React.useCallback(() => {
    setFontStep((prev) => Math.min(FONT_STEPS.length - 1, prev + 1));
  }, []);

  const shrink = React.useCallback(() => {
    setFontStep((prev) => Math.max(0, prev - 1));
  }, []);

  const resetFont = React.useCallback(() => {
    setFontStep(0);
  }, []);

  const toggleVoice = React.useCallback(() => {
    // 必须在用户手势内预热，否则 iOS 后续自动播报会被静音策略拦掉
    unlockTtsInGesture();
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (next) {
      // 先打开引擎再播报，避免 announce 仍读到旧的 enabled=false
      setTtsEnabled(true);
      announceTts("语音播报已打开。");
    } else {
      stopSpeaking();
    }
  }, [voiceEnabled]);

  const say = React.useCallback((text: string) => {
    unlockTtsInGesture();
    speakNow(text);
  }, []);

  const announce = React.useCallback((text: string) => {
    announceTts(text);
  }, []);

  const readPage = React.useCallback(() => {
    unlockTtsInGesture();
    const text = collectPageText();
    if (text === "") {
      speakNow("这一页没有可以朗读的文字。");
      return;
    }
    speakNow(text);
  }, []);

  const stop = React.useCallback(() => {
    stopSpeaking();
  }, []);

  const value = React.useMemo<A11yState>(
    () => ({
      fontScale,
      fontStep,
      canEnlarge: fontStep < FONT_STEPS.length - 1,
      canShrink: fontStep > 0,
      enlarge,
      shrink,
      resetFont,
      voiceEnabled,
      toggleVoice,
      rate,
      setRate: setRateState,
      say,
      announce,
      readPage,
      stop,
      ttsSupported
    }),
    [
      fontScale,
      fontStep,
      enlarge,
      shrink,
      resetFont,
      voiceEnabled,
      toggleVoice,
      rate,
      say,
      announce,
      readPage,
      stop,
      ttsSupported
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useA11y(): A11yState {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("A11yProvider missing");
  return ctx;
}
