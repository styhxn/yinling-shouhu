type SpeechRecognition = any;
type SpeechRecognitionConstructor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export async function recognizeOnceZh(): Promise<string> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) throw new Error("speech_recognition_unavailable");

  return await new Promise<string>((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      const first = event.results?.[0]?.[0]?.transcript;
      if (first && first.trim()) resolve(first.trim());
      else reject(new Error("empty_result"));
      rec.stop();
    };

    rec.onerror = () => {
      reject(new Error("asr_error"));
      rec.stop();
    };

    rec.onnomatch = () => {
      reject(new Error("no_match"));
      rec.stop();
    };

    try {
      rec.start();
    } catch (e) {
      reject(e instanceof Error ? e : new Error("start_failed"));
    }
  });
}

export type AsrStatus = "idle" | "starting" | "listening" | "stopped" | "error";

export function asrStatusZh(status: AsrStatus | null) {
  if (status === "starting") return "启动中";
  if (status === "listening") return "聆听中";
  if (status === "stopped") return "已结束";
  if (status === "error") return "异常";
  return "待命";
}

export function asrErrorZh(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (message.includes("speech_recognition_unavailable")) return "当前浏览器不支持语音识别";
  if (message.includes("no_match")) return "未识别到清晰语音";
  if (message.includes("empty_result")) return "识别结果为空";
  if (message.includes("silence_timeout")) return "长时间无输入";
  if (message.includes("timeout")) return "识别超时";
  if (message.includes("start_failed")) return "语音识别启动失败";
  return "语音识别失败";
}

export function startRecognizeZhBuffered(input: {
  timeoutMs?: number;
  silenceMs?: number;
  onPartial?: (text: string) => void;
  onStatus?: (status: AsrStatus) => void;
}) {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) throw new Error("speech_recognition_unavailable");

  let resolved = false;
  const rec = new Ctor();
  rec.lang = "zh-CN";
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let timeoutId: number | undefined;
  let silenceId: number | undefined;

  function clearTimers() {
    if (timeoutId) window.clearTimeout(timeoutId);
    if (silenceId) window.clearTimeout(silenceId);
  }

  function stop() {
    if (resolved) return;
    resolved = true;
    clearTimers();
    try {
      rec.stop();
    } catch {
      undefined;
    }
  }

  const result = new Promise<string>((resolve, reject) => {
    rec.onstart = () => {
      input.onStatus?.("listening");
    };

    rec.onresult = (event: any) => {
      const last = event.results?.[event.results.length - 1]?.[0]?.transcript ?? "";
      if (last) input.onPartial?.(String(last));
      if (event.results?.[event.results.length - 1]?.isFinal) {
        if (resolved) return;
        resolved = true;
        clearTimers();
        resolve(String(last).trim());
        try {
          rec.stop();
        } catch {
          undefined;
        }
        return;
      }
      if (input.silenceMs) {
        if (silenceId) window.clearTimeout(silenceId);
        silenceId = window.setTimeout(() => {
          if (resolved) return;
          resolved = true;
          try {
            rec.stop();
          } catch {
            undefined;
          }
          reject(new Error("silence_timeout"));
        }, input.silenceMs);
      }
    };

    rec.onerror = () => {
      if (resolved) return;
      resolved = true;
      clearTimers();
      input.onStatus?.("error");
      reject(new Error("asr_error"));
    };

    rec.onend = () => {
      if (resolved) return;
      resolved = true;
      clearTimers();
      input.onStatus?.("stopped");
      reject(new Error("asr_ended"));
    };

    try {
      input.onStatus?.("starting");
      rec.start();
    } catch (e) {
      resolved = true;
      clearTimers();
      reject(e instanceof Error ? e : new Error("start_failed"));
    }

    if (input.timeoutMs) {
      timeoutId = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        clearTimers();
        try {
          rec.stop();
        } catch {
          undefined;
        }
        reject(new Error("timeout"));
      }, input.timeoutMs);
    }
  });

  return { result, stop };
}
