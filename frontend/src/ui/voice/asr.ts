/**
 * 浏览器语音识别封装（Web Speech API）
 * 重点处理三件事：手动结束要能拿到最终文本、长句结果要完整累积、失败原因要能说清。
 */

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onnomatch: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type AsrStatus = "idle" | "starting" | "listening" | "stopped" | "error";

export type AsrErrorCode =
  | "unsupported"
  | "insecure"
  | "permission"
  | "no_microphone"
  | "network"
  | "no_speech"
  | "no_match"
  | "aborted"
  | "timeout"
  | "language"
  | "start_failed"
  | "unknown";

export class AsrError extends Error {
  code: AsrErrorCode;
  detail?: string;

  constructor(code: AsrErrorCode, detail?: string) {
    super(code);
    this.name = "AsrError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export type AsrSession = {
  result: Promise<string>;
  stop: () => void;
};

export type AsrSupportIssue = "unsupported" | "insecure" | null;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isAsrSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/** 返回当前环境无法使用语音识别的原因；可用时返回 null */
export function asrSupportIssue(): AsrSupportIssue {
  if (!getSpeechRecognitionCtor()) return "unsupported";
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure";
  return null;
}

function mapRecognitionError(raw: string | undefined): AsrErrorCode {
  switch (raw) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission";
    case "audio-capture":
      return "no_microphone";
    case "network":
      return "network";
    case "no-speech":
      return "no_speech";
    case "aborted":
      return "aborted";
    case "language-not-supported":
      return "language";
    default:
      return "unknown";
  }
}

/** 长辈高频词：多候选中优先选择带这些词的识别结果 */
const DOMAIN_TERMS = [
  "高血压",
  "血压",
  "血糖",
  "糖尿病",
  "吃药",
  "用药",
  "头晕",
  "晕",
  "心慌",
  "胸闷",
  "医院",
  "医生",
  "女儿",
  "儿子",
  "家人",
  "老伴",
  "转账",
  "骗子",
  "诈骗",
  "银行卡",
  "验证码",
  "买菜",
  "做饭",
  "吃饭",
  "红烧肉",
  "青菜",
  "面条",
  "米饭",
  "水果",
  "天气",
  "下雨",
  "散步",
  "睡觉",
  "失眠",
  "回家",
  "迷路",
  "找不到",
  "南京",
  "鼓楼",
  "玄武",
  "秦淮",
  "苏州",
  "江苏",
  "医保",
  "挂号"
];

function scoreTranscript(text: string, confidence: number | undefined): number {
  const trimmed = text.trim();
  if (trimmed === "") return Number.NEGATIVE_INFINITY;
  const conf = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0;
  let score = conf * 12;
  for (const term of DOMAIN_TERMS) {
    if (trimmed.includes(term)) score += 2;
  }
  return score + Math.min(trimmed.length / 40, 0.5);
}

function pickAlternative(item: SpeechRecognitionResultLike): string {
  let best = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < item.length; i += 1) {
    const alternative = item[i];
    if (!alternative || typeof alternative.transcript !== "string") continue;
    const text = alternative.transcript;
    const score = scoreTranscript(text, alternative.confidence);
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
  }
  return best;
}

export function asrStatusZh(status: AsrStatus | null) {
  if (status === "starting") return "启动中";
  if (status === "listening") return "聆听中";
  if (status === "stopped") return "已结束";
  if (status === "error") return "异常";
  return "待命";
}

export function asrErrorZh(err: unknown) {
  if (err instanceof AsrError) {
    switch (err.code) {
      case "unsupported":
        return "当前浏览器不支持语音识别，请用 Edge 或 Chrome，也可以直接打字。";
      case "insecure":
        return "语音输入需要 HTTPS 或 localhost。当前地址是 HTTP，浏览器会禁用麦克风；请改用 https 地址，或直接打字。";
      case "permission":
        return "麦克风权限被拒绝。请点地址栏的麦克风图标允许访问；微信/QQ 等内置浏览器请改用系统浏览器。";
      case "no_microphone":
        return "没有找到可用的麦克风，请检查设备连接。";
      case "network":
        return "浏览器的语音服务连接失败。Chrome 在国内常无法连接语音服务，建议改用 Edge，或直接打字。";
      case "no_speech":
        return "没有听到声音，请靠近麦克风再说一次。";
      case "no_match":
        return "没有听清，请再说一遍。";
      case "aborted":
        return "语音识别已中断，请再说一次。";
      case "timeout":
        return "等太久没有听到声音，请再说一次。";
      case "language":
        return "当前浏览器不支持中文语音识别，请用 Edge 或 Chrome。";
      case "start_failed":
        return "语音识别启动失败，请刷新页面后再试。";
      default:
        return "语音识别失败，请改用文字或换用 Edge 浏览器。";
    }
  }

  const message = err instanceof Error ? err.message : String(err ?? "");
  if (message.includes("speech_recognition_unavailable")) {
    return "当前浏览器不支持语音识别，请用 Edge 或 Chrome。";
  }
  if (message.includes("no_match")) return "没有听清，请再说一遍。";
  if (message.includes("empty_result")) return "没有听到声音，请再说一次。";
  if (message.includes("silence_timeout")) return "没有听到声音，请再说一次。";
  if (message.includes("timeout")) return "等太久没有听到声音，请再说一次。";
  if (message.includes("start_failed")) return "语音识别启动失败，请刷新页面后再试。";
  return "语音识别失败，请改用文字或换用 Edge 浏览器。";
}

/** 保留旧的单次识别入口 */
export async function recognizeOnceZh(): Promise<string> {
  return startRecognizeZhBuffered({
    timeoutMs: 15_000,
    silenceMs: 1_200,
    stopGraceMs: 350,
    stopOnFinal: true
  }).result;
}

/**
 * 持续识别。松开/停止时返回已累积的文本，而不是让 Promise 永远挂起。
 * 多段 final 结果会完整拼接，避免只拿到最后一小句。
 */
export function startRecognizeZhBuffered(input: {
  timeoutMs?: number;
  silenceMs?: number;
  /** 手动 stop 后等待最终结果的宽限，默认 450ms */
  stopGraceMs?: number;
  /** 收到第一段 final 就结束，默认 false */
  stopOnFinal?: boolean;
  onPartial?: (text: string) => void;
  onStatus?: (status: AsrStatus) => void;
}): AsrSession {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) throw new AsrError("unsupported");
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new AsrError("insecure");
  }

  let settled = false;
  let manualStop = false;
  let finalText = "";
  let liveText = "";
  let lastError: AsrError | null = null;

  let timeoutId: number | undefined;
  let silenceId: number | undefined;
  let stopId: number | undefined;

  let resolveResult!: (text: string) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const rec = new Ctor();
  rec.lang = "zh-CN";
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 5;

  function currentText(): string {
    return `${finalText}${liveText}`.trim();
  }

  function clearTimers() {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    if (silenceId !== undefined) window.clearTimeout(silenceId);
    if (stopId !== undefined) window.clearTimeout(stopId);
    timeoutId = undefined;
    silenceId = undefined;
    stopId = undefined;
  }

  function stopRecognition() {
    try {
      rec.stop();
    } catch {
      undefined;
    }
  }

  function resetSilence() {
    if (silenceId !== undefined) window.clearTimeout(silenceId);
    silenceId = undefined;
    if (input.silenceMs && input.silenceMs > 0) {
      silenceId = window.setTimeout(() => finish("silence"), input.silenceMs);
    }
  }

  function finish(reason: "final" | "silence" | "timeout" | "end" | "error" | "manual" | "nomatch") {
    if (settled) return;
    settled = true;
    clearTimers();
    stopRecognition();

    const text = currentText();
    if (text !== "") {
      input.onStatus?.("stopped");
      resolveResult(text);
      return;
    }

    input.onStatus?.(lastError ? "error" : "stopped");
    rejectResult(
      lastError ??
        new AsrError(
          reason === "timeout" ? "timeout" : reason === "nomatch" ? "no_match" : "no_speech"
        )
    );
  }

  rec.onstart = () => {
    input.onStatus?.("listening");
  };

  rec.onresult = (event) => {
    let finals = "";
    let interim = "";
    for (let i = 0; i < event.results.length; i += 1) {
      const item = event.results[i];
      if (!item) continue;
      const text = pickAlternative(item);
      if (item.isFinal) finals += text;
      else interim += text;
    }
    finalText = finals;
    liveText = interim;

    const text = currentText();
    if (text !== "") {
      input.onPartial?.(text);
      resetSilence();
    }

    if (input.stopOnFinal && finals.trim() !== "" && interim.trim() === "") {
      finish("final");
      return;
    }
    if (manualStop && finals.trim() !== "") {
      finish("manual");
    }
  };

  rec.onerror = (event) => {
    const code = mapRecognitionError(event.error);
    lastError = new AsrError(code, event.message);
    console.warn("[asr] recognition error", code, event.error ?? "", event.message ?? "");
    if (code === "aborted" && manualStop) {
      finish("manual");
      return;
    }
    finish("error");
  };

  rec.onnomatch = () => {
    lastError = new AsrError("no_match");
    finish("nomatch");
  };

  rec.onend = () => {
    if (settled) return;
    finish("end");
  };

  try {
    input.onStatus?.("starting");
    rec.start();
  } catch (err) {
    if (!settled) {
      settled = true;
      clearTimers();
      input.onStatus?.("error");
      const name = err instanceof DOMException ? err.name : "";
      const code: AsrErrorCode =
        name === "NotAllowedError" || name === "SecurityError"
          ? "permission"
          : name === "InvalidStateError"
            ? "start_failed"
            : "start_failed";
      rejectResult(new AsrError(code, err instanceof Error ? err.message : undefined));
    }
  }

  if (!settled && input.timeoutMs && input.timeoutMs > 0) {
    timeoutId = window.setTimeout(() => finish("timeout"), input.timeoutMs);
  }

  function stop() {
    if (settled) return;
    manualStop = true;
    stopRecognition();
    // 部分浏览器 stop() 后不会再触发 onresult/onend，给一个短宽限再结算。
    if (stopId === undefined) {
      stopId = window.setTimeout(() => finish("manual"), input.stopGraceMs ?? 450);
    }
  }

  return { result, stop };
}
