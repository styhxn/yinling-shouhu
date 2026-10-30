import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onTtsError, setTtsVoice, speakNow, splitForSpeech, stopSpeaking } from "./tts.js";

let spoken: string[] = [];
let spokenVoice: string | null = null;
let forcedError: string | null = null;
let fakeVoices: Array<{ name: string; lang: string; localService: boolean }> = [];

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const fakeSynth = {
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null as (() => void) | null,
  getVoices: () => fakeVoices,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  cancel: () => undefined,
  pause: () => undefined,
  resume: () => undefined,
  speak(utterance: FakeUtterance) {
    spoken.push(utterance.text);
    spokenVoice = (utterance.voice as { name?: string } | null)?.name ?? null;
    utterance.onstart?.();
    if (forcedError) {
      const error = forcedError;
      setTimeout(() => utterance.onerror?.({ error }), 0);
      return;
    }
    setTimeout(() => utterance.onend?.(), 0);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  spoken = [];
  spokenVoice = null;
  forcedError = null;
  fakeVoices = [];
  vi.stubGlobal("window", {
    speechSynthesis: fakeSynth,
    SpeechSynthesisUtterance: FakeUtterance,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval
  });
});

afterEach(() => {
  stopSpeaking();
  setTtsVoice(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("splitForSpeech", () => {
  it("长文本会切成不超过 60 字的片段", () => {
    const text = "今天天气很好，".repeat(20);
    const chunks = splitForSpeech(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 60)).toBe(true);
  });

  it("会去掉 Markdown 符号和链接，避免念出星号", () => {
    const chunks = splitForSpeech("**重点**：请看[这里](https://example.com)。");
    expect(chunks.join("")).toBe("重点：请看这里。");
  });
});

describe("speakNow", () => {
  it("按顺序播放所有分句", async () => {
    speakNow("第一句话。第二句话。第三句话。");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(spoken).toEqual(["第一句话。", "第二句话。", "第三句话。"]);
  });

  it("停止后不再播放剩余分句", async () => {
    speakNow("第一句话。第二句话。第三句话。");
    stopSpeaking();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(spoken).toEqual(["第一句话。"]);
  });

  it("可以选择指定的中文音色", async () => {
    fakeVoices = [
      { name: "Microsoft Huihui", lang: "zh-CN", localService: true },
      { name: "Microsoft Kangkang", lang: "zh-CN", localService: true }
    ];
    setTtsVoice("Microsoft Kangkang");

    speakNow("测试音色。");
    await vi.advanceTimersByTimeAsync(200);

    expect(spokenVoice).toBe("Microsoft Kangkang");
  });

  it("浏览器拦截自动播报时会上报 not_allowed", async () => {
    const errors: string[] = [];
    const off = onTtsError((code) => errors.push(code));
    forcedError = "not-allowed";

    speakNow("测试播报。");
    await vi.advanceTimersByTimeAsync(200);

    expect(errors).toContain("not_allowed");
    off();
  });
});
