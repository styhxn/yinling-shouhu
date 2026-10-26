/**
 * 语音播报（TTS）封装
 * -----------------------------------------------------------------------------
 * 基于浏览器原生 Web Speech API（speechSynthesis），不依赖网络与外部服务，
 * 面向长者场景做了以下加固：
 *
 *  1. 分句队列：Chrome 对单条 utterance 有 ~15 秒 / 长文本截断的已知缺陷，
 *     这里按标点把长文本切成 ≤90 字的小段顺序播报，保证整段读完。
 *  2. 中文音色优选：自动挑选 zh-CN 且本地（localService）的普通话音色，
 *     避免落到英文音色读中文的"机翻腔"。
 *  3. 总开关：announce() 受"语音播报"开关控制（自动播报用）；
 *     speakNow() 无视开关（用户主动点"朗读"按钮用）。
 *  4. 取消安全：用 generation 计数丢弃 cancel() 之后残留的 onend 回调，
 *     避免"点了停止又冒出下一句"。
 *  5. 手势解锁：iOS / Safari 要求首次播报发生在用户手势内，
 *     提供 unlockTtsInGesture() 在点击时预热。
 */

export type TtsOptions = {
  /** 语速，0.6 ~ 1.4；面向长者建议 0.85 ~ 0.95 */
  rate: number;
  pitch: number;
  volume: number;
  /** 自动播报总开关，只影响 announce() */
  enabled: boolean;
};

const DEFAULT_OPTIONS: TtsOptions = {
  rate: 0.95,
  pitch: 1,
  volume: 1,
  enabled: true
};

/** 单段最大字符数，过长会被部分浏览器截断 */
const MAX_CHUNK = 90;

let options: TtsOptions = { ...DEFAULT_OPTIONS };
let voices: SpeechSynthesisVoice[] = [];
let preferredVoice: SpeechSynthesisVoice | null = null;

/** 播放代次：每次 stop / 重新 speak 递增，用于丢弃过期回调 */
let generation = 0;
let queue: string[] = [];

/* ------------------------------------------------------------------ 基础 */

export function isTtsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
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
  try {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
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

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferredVoice) return preferredVoice;
  if (voices.length === 0) refreshVoices();
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

/* ---------------------------------------------------------------- 分句切分 */

/** 按句号/问号/逗号把长文本切成适合单条播报的片段 */
export function splitForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
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

function cancelAll(): void {
  generation += 1;
  queue = [];
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
  if (typeof next === "undefined") return;

  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(next);
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
  utterance.onerror = () => {
    if (myGeneration !== generation) return;
    playNext(myGeneration);
  };

  try {
    synth.speak(utterance);
  } catch {
    queue = [];
  }
}

/* ---------------------------------------------------------------- 对外 API */

/** 停止当前播报并清空队列 */
export function stopSpeaking(): void {
  cancelAll();
}

/**
 * 立即朗读（无视"语音播报"开关）。
 * 用于用户主动点击的"朗读"按钮。
 */
export function speakNow(text: string): void {
  if (!isTtsSupported()) return;
  const chunks = splitForSpeech(text);
  if (chunks.length === 0) return;

  const synth = window.speechSynthesis;
  const busy = synth.speaking || synth.pending;
  cancelAll();
  const myGeneration = generation;
  queue = chunks.slice();

  // 正在播报时先 cancel 再 speak，Chrome 需要一点间隔才不会被吞掉；
  // 空闲时同步调用，保证仍处于用户手势上下文（iOS 自动播放策略）。
  if (busy) {
    window.setTimeout(() => playNext(myGeneration), 90);
  } else {
    playNext(myGeneration);
  }
}

/** 兼容旧调用方式 */
export const speak = speakNow;

/**
 * 自动播报：受"语音播报"总开关控制。
 * 用于提醒、陪伴消息等被动触发的场景。
 */
export function announce(text: string): void {
  if (!options.enabled) return;
  speakNow(text);
}

/** 开关自动播报；关闭时立即打断正在播放的内容 */
export function setTtsEnabled(enabled: boolean): void {
  options = { ...options, enabled };
  if (!enabled) stopSpeaking();
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
 * iOS Safari 只有"用户点击后"的第一次 speak 才被允许，进页面时先打个空转。
 */
export function unlockTtsInGesture(): void {
  if (!isTtsSupported()) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.lang = "zh-CN";
    utterance.rate = options.rate;
    utterance.volume = 0;
    synth.speak(utterance);
  } catch {
    undefined;
  }
}
