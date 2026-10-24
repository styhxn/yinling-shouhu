import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { testConfig } from "./testUtils.js";

describe("api", () => {
  it("exposes /health", async () => {
    const server = await createServer({ config: testConfig() });
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await server.close();
  });

  it("publishes events via /mock/emit", async () => {
    const server = await createServer({ config: testConfig() });
    const events: string[] = [];
    const unsub = server.eventBus.subscribe((e) => events.push(e.type));

    const res = await server.inject({
      method: "POST",
      url: "/mock/emit",
      payload: { type: "fall.detected", payload: { confidence: 0.9 } }
    });

    unsub();
    expect(res.statusCode).toBe(200);
    expect(events).toContain("fall.detected");
    await server.close();
  });
});
