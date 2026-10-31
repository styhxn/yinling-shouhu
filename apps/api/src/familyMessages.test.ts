import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;
let elderCookie = "";
let familyCookie = "";

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
  const elder = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
  elderCookie = cookieFrom(elder.headers);
  const family = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "family" }
  });
  familyCookie = cookieFrom(family.headers);
});

afterAll(async () => {
  await server.close();
});

describe("elder family messages", () => {
  it("previews unread messages without marking them read", async () => {
    const sent = await server.inject({
      method: "POST",
      url: "/api/family/elder/message",
      headers: { cookie: familyCookie },
      payload: { elderId: "e_li", content: "妈，记得晚上六点吃药。", kind: "care" }
    });
    expect(sent.statusCode).toBe(200);

    const peek = await server.inject({
      method: "GET",
      url: "/api/family/elder/messages?peek=1",
      headers: { cookie: elderCookie }
    });
    expect(peek.statusCode).toBe(200);
    const peekBody = peek.json() as any;
    expect(peekBody.unreadCount).toBeGreaterThanOrEqual(1);
    expect(peekBody.items.some((item: any) => item.read === false)).toBe(true);

    const again = await server.inject({
      method: "GET",
      url: "/api/family/elder/messages?peek=1",
      headers: { cookie: elderCookie }
    });
    expect((again.json() as any).unreadCount).toBe(peekBody.unreadCount);

    const read = await server.inject({
      method: "GET",
      url: "/api/family/elder/messages",
      headers: { cookie: elderCookie }
    });
    expect(read.statusCode).toBe(200);
    expect((read.json() as any).unreadCount).toBe(peekBody.unreadCount);

    const cleared = await server.inject({
      method: "GET",
      url: "/api/family/elder/messages?peek=1",
      headers: { cookie: elderCookie }
    });
    expect((cleared.json() as any).unreadCount).toBe(0);
  });

  it("seeds a realistic weekly medication adherence", async () => {
    const report = await server.inject({
      method: "GET",
      url: "/api/family/report/weekly",
      headers: { cookie: familyCookie }
    });
    expect(report.statusCode).toBe(200);
    const body = report.json() as any;
    expect(body.report.adherencePct).toBeGreaterThanOrEqual(70);
    expect(body.report.adherencePct).toBeLessThanOrEqual(95);
  });
});
