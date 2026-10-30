import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

function stubFetch(payload: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("family ↔ elder message API paths", () => {
  it("sends family messages through /family/elder/message", async () => {
    const calls = stubFetch({ ok: true, messageId: "msg_1" });
    const res = await api.family.sendToElder({
      elderId: "e_li",
      content: "记得吃药"
    });
    expect(res.messageId).toBe("msg_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/family/elder/message");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("loads the elder inbox through /family/elder/messages", async () => {
    const calls = stubFetch({ ok: true, items: [] });
    await api.elderMessages.list();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/family/elder/messages");
  });
});
