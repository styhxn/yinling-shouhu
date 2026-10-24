import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;
let cookie: string;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
  const login = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
  cookie = cookieFrom(login.headers);
});

afterAll(async () => {
  await server.close();
});

describe("anti-fraud roleplay", () => {
  it("lists scenarios", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/safety/roleplay/scenarios",
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as any).items.length).toBe(3);
  });

  it("runs a scenario and produces a six-dimension report", async () => {
    const start = await server.inject({
      method: "POST",
      url: "/api/safety/roleplay/start",
      headers: { cookie },
      payload: { scenarioId: "fake_police" }
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as any;
    expect(started.message).toContain("洗钱");
    const sessionId = started.sessionId as string;

    const answers = [
      "我不会转账，我要挂断电话并打 110 核实。",
      "我不会告诉你验证码，也不会共享屏幕。",
      "我先给女儿打电话，让她帮我判断。",
      "你说是警察，那我打 96110 核实。",
      "我不会保密，也不会按你说的做。"
    ];

    let report: any = null;
    for (const text of answers) {
      const res = await server.inject({
        method: "POST",
        url: `/api/safety/roleplay/${sessionId}/turn`,
        headers: { cookie },
        payload: { text }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      if (body.done) report = body.report;
    }

    expect(report).toBeTruthy();
    expect(report.dimensions.length).toBe(6);
    expect(report.total).toBeGreaterThan(60);
    expect(report.redFlags.length).toBeGreaterThan(0);
    expect(report.disclaimer).toContain("模拟演练");
  });

  it("can end a scenario early", async () => {
    const start = await server.inject({
      method: "POST",
      url: "/api/safety/roleplay/start",
      headers: { cookie },
      payload: { scenarioId: "fake_health" }
    });
    const sessionId = (start.json() as any).sessionId as string;
    const end = await server.inject({
      method: "POST",
      url: `/api/safety/roleplay/${sessionId}/end`,
      headers: { cookie },
      payload: {}
    });
    expect(end.statusCode).toBe(200);
    expect((end.json() as any).report.dimensions.length).toBe(6);
  });
});
