/**
 * 语音播报（TTS）封装：浏览器原生 speechSynthesis，不依赖网络与外部服务。
 * 处理长文本分句、中文音色优选、Chrome 长播报中断、自动播报被浏览器拦截等问题。
 */

export type TtsOptions = {
  /** 语速，0.6 ~ 1.4；面向长辈建议 0.85 ~ 0.95 */
  rate: number;
  pitch: number;
  volume: number;
  /** 自动播报总开关，只影响 announce() */
  enabled: boolean;
};

export type TtsErrorCode =
  | "unsupported"
  | "not_allowed"
  | "synthesis_failed"
  | "audio_busy"
  | "unknown";

const DEFAULT_OPTIONS: TtsOptions = {
  rate: 0.95,
  pitch: 1,
  volume: 1,
  enabled: true
};

/** 单段最大字符数：Chrome 对长 utterance 有 ~15 秒截断缺陷，控制在 60 字更稳 */
const MAX_CHUNK = 60;
const VOICE_KEY = "yl.tts.voice.v1";

let options: TtsOptions = { ...DEFAULT_OPTIONS };
let voices: SpeechSynthesisVoice[] = [];
let preferredVoice: SpeechSynthesisVoice | null = null;
let selectedVoiceName: string | null = null;

if (typeof window !== "undefined") {
  try {
    selectedVoiceName = window.localStorage.getItem(VOICE_KEY);
  } catch {
    undefined;
  }
}

/** 播放代次：每次 stop / 重新 speak 递增，用于丢弃过期回调 */
let generation = 0;
let queue: string[] = [];
let watchdogId: number | undefined;

const errorListeners = new Set<(code: TtsErrorCode) => void>();
let pendingAnnouncement: string | null = null;
let gestureBound = false;

/* ------------------------------------------------------------------ 基础 */

export function isTtsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function onTtsError(listener: (code: TtsErrorCode) => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function ttsErrorZh(code: TtsErrorCode): string {
  if (code === "unsupported") return "当前浏览器不支持语音播报，建议使用 Edge 或 Chrome。";
  if (code === "not_allowed") {
    return "浏览器拦截了自动语音。请点一下页面，或点“朗读本页”按钮再试。";
  }
  if (code === "audio_busy") return "语音设备正被其他程序占用，请关闭后重试。";
  if (code === "synthesis_failed") return "语音播报失败，可以在系统设置里换一个中文语音后再试。";
  return "语音播报失败，请稍后再试。";
}

function reportError(code: TtsErrorCode) {
  for (const listener of errorListeners) {
    try {
      listener(code);
    } catch {
      undefined;
    }
  }
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_OPTIONS.rate;
  return Math.min(1.4, Math.max(0.6, rate));
}

/* ---------------------------------------------------------------- 音色管理 */

function refreshVoices(): void {
  if (!isTtsSupported()) return;
  try {
    const list = window.speechSynthesis.getVoices();
    if (list.length > 0) {
      voices = list;
      preferredVoice = null;
    }
  } catch {
    undefined;
  }
}

if (isTtsSupported()) {
  refreshVoices();
  const synth = window.speechSynthesis;
  try {
    synth.addEventListener("voiceschanged", refreshVoices);
  } catch {
    undefined;
  }
  try {
    (synth as SpeechSynthesis & { onvoiceschanged?: (() => void) | null }).onvoiceschanged =
      refreshVoices;
  } catch {
    undefined;
  }
}

/** 评分挑选最适合读中文的音色 */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  if (/^zh[-_]?(CN|Hans)/i.test(voice.lang)) score += 6;
  else if (/^zh/i.test(voice.lang)) score += 3;
  if (voice.localService) score += 2;
  if (/xiaoxiao|xiaoyi|huihui|tingting|yaoyao|yunjian|female|女/i.test(voice.name)) score += 1;
  return score;
}

/** 可在设置里选择的中文音色 */
export function listTtsVoices(): SpeechSynthesisVoice[] {
  if (!isTtsSupported()) return [];
  if (voices.length === 0) refreshVoices();
  return voices
    .filter((voice) => /^zh/i.test(voice.lang) || /chinese|mandarin|中文|普通话/i.test(voice.name))
    .slice()
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
}

export function getTtsVoiceName(): string | null {
  return selectedVoiceName;
}

/** name 传 null 表示回到系统默认音色 */
export function setTtsVoice(name: string | null): void {
  selectedVoiceName = name && name.trim() !== "" ? name.trim() : null;
  preferredVoice = null;
  if (typeof window === "undefined") return;
  try {
    if (selectedVoiceName) window.localStorage.setItem(VOICE_KEY, selectedVoiceName);
    else window.localStorage.removeItem(VOICE_KEY);
  } catch {
    undefined;
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (voices.length === 0) refreshVoices();
  if (selectedVoiceName) {
    const chosen = voices.find((voice) => voice.name === selectedVoiceName);
    if (chosen) return chosen;
  }
  if (preferredVoice && voices.includes(preferredVoice)) return preferredVoice;
  preferredVoice = null;
  if (voices.length === 0) return null;

  const zhVoices = voices.filter(
    (v) => /^zh/i.test(v.lang) || /chinese|mandarin|中文|普通话/i.test(v.name)
  );
  const pool = zhVoices.length > 0 ? zhVoices : voices;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const voice of pool) {
    const score = scoreVoice(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  preferredVoice = best;
  return preferredVoice;
}

/* ---------------------------------------------------------------- 文本清洗 */

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " 代码 ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "链接")
    .replace(/[*_#>`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 按句号/问号/逗号把长文本切成适合单条播报的片段 */
export function splitForSpeech(text: string): string[] {
  const clean = cleanForSpeech(text);
  if (clean === "") return [];

  const sentences = clean.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [];
  const source = sentences.length > 0 ? sentences : [clean];
  const chunks: string[] = [];

  for (const raw of source) {
    let rest = raw.trim();
    while (rest.length > MAX_CHUNK) {
      let cut = -1;
      for (let i = Math.min(MAX_CHUNK, rest.length - 1); i > 20; i -= 1) {
        const ch = rest.charAt(i);
        if ("，,、：:）)".includes(ch)) {
          cut = i + 1;
          break;
        }
      }
      if (cut <= 0) cut = MAX_CHUNK;
      const head = rest.slice(0, cut).trim();
      if (head !== "") chunks.push(head);
      rest = rest.slice(cut).trim();
    }
    if (rest !== "") chunks.push(rest);
  }
  return chunks;
}

/* ---------------------------------------------------------------- 播放队列 */

function startWatchdog() {
  if (!isTtsSupported() || watchdogId !== undefined) return;
  // Chrome / Edge 长播报 15 秒左右会静默停止，定时 pause+resume 可续命。
  watchdogId = window.setInterval(() => {
    const synth = window.speechSynthesis;
    if (!synth.speaking && !synth.pending) {
      stopWatchdog();
      return;
    }
    try {
      synth.pause();
      synth.resume();
    } catch {
      undefined;
    }
  }, 8000);
}

function stopWatchdog() {
  if (watchdogId !== undefined) {
    window.clearInterval(watchdogId);
    watchdogId = undefined;
  }
}

function cancelAll(): void {
  generation += 1;
  queue = [];
  stopWatchdog();
  if (!isTtsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    undefined;
  }
}

function playNext(myGeneration: number): void {
  if (myGeneration !== generation || !isTtsSupported()) return;
  const next = queue.shift();
  if (typeof next === "undefined") {
    stopWatchdog();
    return;
  }

  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(next);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = "zh-CN";
  utterance.rate = options.rate;
  utterance.pitch = options.pitch;
  utterance.volume = options.volume;

  utterance.onend = () => {
    if (myGeneration !== generation) return;
    // 句间留一点空隙，听感更自然
    window.setTimeout(() => playNext(myGeneration), 40);
  };
  utterance.onerror = (event) => {
    if (myGeneration !== generation) return;
    const error = (event as SpeechSynthesisErrorEvent).error;
    if (error === "interrupted" || error === "canceled") {
      playNext(myGeneration);
      return;
    }
    queue = [];
    stopWatchdog();
    reportError(
      error === "not-allowed"
        ? "not_allowed"
        : error === "audio-busy" || error === "audio-hardware"
          ? "audio_busy"
          : "synthesis_failed"
    );
  };

  try {
    if (synth.paused) synth.resume();
    synth.speak(utterance);
    startWatchdog();
  } catch {
    queue = [];
    stopWatchdog();
    reportError("synthesis_failed");
  }
}

/* ---------------------------------------------------------------- 手势解锁 */

function flushPendingAnnouncement() {
  window.removeEventListener("pointerdown", flushPendingAnnouncement, true);
  window.removeEventListener("keydown", flushPendingAnnouncement, true);
  gestureBound = false;
  unlockTtsInGesture();
  const text = pendingAnnouncement;
  pendingAnnouncement = null;
  if (text) {
    window.setTimeout(() => speakNow(text), 80);
  }
}

function bindGestureFlush() {
  if (gestureBound || typeof window === "undefined") return;
  gestureBound = true;
  window.addEventListener("pointerdown", flushPendingAnnouncement, {
    once: true,
    passive: true,
    capture: true
  });
  window.addEventListener("keydown", flushPendingAnnouncement, {
    once: true,
    capture: true
  });
}

/* ---------------------------------------------------------------- 对外 API */

/** 停止当前播报并清空队列 */
export function stopSpeaking(): void {
  cancelAll();
}

/** 立即朗读（无视“语音播报”开关），用于用户主动点击的“朗读”按钮 */
export function speakNow(text: string): void {
  if (!isTtsSupported()) {
    reportError("unsupported");
    return;
  }
  const chunks = splitForSpeech(text);
  if (chunks.length === 0) return;

  const synth = window.speechSynthesis;
  const busy = synth.speaking || synth.pending;
  cancelAll();
  const myGeneration = generation;
  queue = chunks.slice();

  // Chrome 在 cancel() 之后立刻 speak 有概率吞掉第一条；忙时留一点间隔。
  if (busy) {
    window.setTimeout(() => playNext(myGeneration), 90);
  } else {
    playNext(myGeneration);
  }
}

/** 兼容旧调用方式 */
export const speak = speakNow;

/**
 * 自动播报：受“语音播报”总开关控制。
 * 浏览器尚未发生用户手势时先排队，等第一次点击/按键后自动补播。
 */
export function announce(text: string): void {
  if (!options.enabled) return;
  const activation = (
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
      : undefined
  );
  if (activation && !activation.hasBeenActive) {
    pendingAnnouncement = text;
    bindGestureFlush();
    return;
  }
  speakNow(text);
}

/** 开关自动播报；关闭时立即打断正在播放的内容 */
export function setTtsEnabled(enabled: boolean): void {
  options = { ...options, enabled };
  if (!enabled) {
    pendingAnnouncement = null;
    stopSpeaking();
  }
}

export function isTtsEnabled(): boolean {
  return options.enabled;
}

/** 设置语速（0.6 ~ 1.4） */
export function setTtsRate(rate: number): void {
  options = { ...options, rate: clampRate(rate) };
}

export function getTtsRate(): number {
  return options.rate;
}

/**
 * 在用户手势中预热语音引擎。
 * iOS Safari 只有“用户点击后”的第一次 speak 才被允许，进页面时先打个空转。
 */
export function unlockTtsInGesture(): void {
  if (!isTtsSupported()) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
    const utterance = new window.SpeechSynthesisUtterance(" ");
    utterance.lang = "zh-CN";
    utterance.rate = options.rate;
    utterance.volume = 0;
    synth.speak(utterance);
  } catch {
    undefined;
  }
}
