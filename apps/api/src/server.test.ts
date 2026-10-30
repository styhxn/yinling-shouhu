import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, testConfig } from "./testUtils.js";

describe("api", () => {
  it("exposes /health", async () => {
    const server = await createServer({ config: testConfig() });
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await server.close();
  });

  it("publishes events via /mock/emit only for signed-in demo users", async () => {
    const server = await createServer({ config: testConfig() });
    const events: string[] = [];
    const unsub = server.eventBus.subscribe((e) => events.push(e.type));

    const anonymous = await server.inject({
      method: "POST",
      url: "/mock/emit",
      payload: { type: "fall.detected", payload: { confidence: 0.9 } }
    });
    expect(anonymous.statusCode).toBe(401);

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/demo-login",
      payload: { role: "family" }
    });
    const res = await server.inject({
      method: "POST",
      url: "/mock/emit",
      headers: { cookie: cookieFrom(login.headers) },
      payload: { type: "fall.detected", payload: { confidence: 0.9 } }
    });

    unsub();
    expect(res.statusCode).toBe(200);
    expect(events).toContain("fall.detected");
    await server.close();
  });

  it("hides /mock/emit when demo mode is off", async () => {
    const server = await createServer({ config: testConfig() });
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/demo-login",
      payload: { role: "family" }
    });
    const cookie = cookieFrom(login.headers);
    (server.config as { demoMode: boolean }).demoMode = false;

    const res = await server.inject({
      method: "POST",
      url: "/mock/emit",
      headers: { cookie },
      payload: { type: "fall.detected", payload: { confidence: 0.9 } }
    });
    expect(res.statusCode).toBe(404);
    await server.close();
  });
});
