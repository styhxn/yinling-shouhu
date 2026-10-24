import { describe, expect, it } from "vitest";
import { createMockQaEngine } from "./mocks.js";

describe("adapters", () => {
  it("mock qa returns answer", async () => {
    const qa = createMockQaEngine();
    const answer = await qa.ask({ question: "炸鸡健康吗？", profile: null });
    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(0);
  });
});

