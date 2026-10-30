import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsrError, startRecognizeZhBuffered } from "./asr.js";

type FakePart = { text: string; final: boolean };

class FakeRecognition {
  static instances: FakeRecognition[] = [];

  lang = "";
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error?: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onnomatch: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.onstart?.();
  }

  stop() {
    undefined;
  }

  emitResult(parts: FakePart[]) {
    const results = parts.map((part) =>
      Object.assign({ isFinal: part.final, length: 1 }, { 0: { transcript: part.text } })
    );
    (results as unknown as { length: number }).length = parts.length;
    this.onresult?.({ resultIndex: 0, results });
  }

  emitAlternatives(alternatives: Array<{ text: string; confidence: number }>, final = true) {
    const result: Record<string | number, unknown> = {
      isFinal: final,
      length: alternatives.length
    };
    alternatives.forEach((item, index) => {
      result[index] = { transcript: item.text, confidence: item.confidence };
    });
    const results = [result];
    (results as unknown as { length: number }).length = 1;
    this.onresult?.({ resultIndex: 0, results });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.();
  }
}

function stubWindow(secure = true) {
  vi.stubGlobal("window", {
    isSecureContext: secure,
    SpeechRecognition: FakeRecognition,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  FakeRecognition.instances = [];
  stubWindow();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("startRecognizeZhBuffered", () => {
  it("手动结束会返回已经识别到的文本，而不是一直挂起", async () => {
    const session = startRecognizeZhBuffered({ silenceMs: 5_000, stopGraceMs: 400 });
    const rec = FakeRecognition.instances[0]!;
    rec.emitResult([{ text: "我想吃", final: false }]);
    rec.emitResult([{ text: "我想吃红烧肉", final: true }]);

    session.stop();
    await vi.advanceTimersByTimeAsync(500);

    await expect(session.result).resolves.toBe("我想吃红烧肉");
  });

  it("多段 final 结果会完整拼接，不会只保留最后一句", async () => {
    const session = startRecognizeZhBuffered({ silenceMs: 300 });
    const rec = FakeRecognition.instances[0]!;
    rec.emitResult([{ text: "我想", final: true }]);
    rec.emitResult([
      { text: "我想", final: true },
      { text: "吃红烧肉", final: false }
    ]);
    rec.emitResult([
      { text: "我想", final: true },
      { text: "吃红烧肉", final: true }
    ]);

    await vi.advanceTimersByTimeAsync(350);

    await expect(session.result).resolves.toBe("我想吃红烧肉");
  });

  it("多候选结果优先选择带领域词的文本", async () => {
    const session = startRecognizeZhBuffered({ silenceMs: 100 });
    const rec = FakeRecognition.instances[0]!;
    rec.emitAlternatives([
      { text: "我头有点运", confidence: 0.9 },
      { text: "我头有点晕", confidence: 0.8 }
    ]);

    await vi.advanceTimersByTimeAsync(150);

    await expect(session.result).resolves.toBe("我头有点晕");
  });

  it("静音后自动结束并返回文本", async () => {
    const session = startRecognizeZhBuffered({ silenceMs: 200 });
    const rec = FakeRecognition.instances[0]!;
    rec.emitResult([{ text: "今天天气不错", final: true }]);

    await vi.advanceTimersByTimeAsync(250);

    await expect(session.result).resolves.toBe("今天天气不错");
  });

  it("麦克风权限被拒绝时给出 permission 错误", async () => {
    const session = startRecognizeZhBuffered({ silenceMs: 200 });
    const rec = FakeRecognition.instances[0]!;
    rec.emitError("not-allowed");

    await expect(session.result).rejects.toMatchObject({ code: "permission" });
  });

  it("没有识别到文本就结束时给出 no_speech 错误", async () => {
    const session = startRecognizeZhBuffered({ silenceMs: 200 });
    const rec = FakeRecognition.instances[0]!;
    rec.emitEnd();

    await expect(session.result).rejects.toMatchObject({ code: "no_speech" });
  });

  it("HTTP 地址下直接拒绝启动并给出 insecure 错误", () => {
    stubWindow(false);
    try {
      startRecognizeZhBuffered({});
      throw new Error("should_not_start");
    } catch (err) {
      expect(err).toBeInstanceOf(AsrError);
      expect((err as AsrError).code).toBe("insecure");
    }
  });
});
