import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { MockModelProvider } from "./services/llm/mock.js";
import { analyzeScamImage } from "./services/safety/scamImage.js";
import { cookieFrom, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;
let elderCookie: string;
let familyCookie: string;

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

describe("safety", () => {
  it("flags a high-risk text and returns related anti-fraud cases", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/scam/check",
      headers: { cookie: elderCookie },
      payload: {
        inputType: "text",
        text: "我是警察，你涉嫌洗钱，把钱转到安全账户，不要告诉家里人。"
      }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.result.riskLevel).toBe("high");
    expect(body.result.redFlags.length).toBeGreaterThan(0);
    expect(body.related.length).toBeGreaterThan(0);
  });

  it("creates a cooling-off and lets the family deny it", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/safety/cooling-off",
      headers: { cookie: elderCookie },
      payload: { amount: 50000, counterparty: "某投资平台", reason: "提现要先充值" }
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as any;
    expect(body.coolingOff.riskLevel).toBe("high");
    expect(body.familyConfirm.status).toBe("pending");

    const pending = await server.inject({
      method: "GET",
      url: "/api/safety/confirm/pending?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(pending.statusCode).toBe(200);
    expect(
      (pending.json() as any).items.some((item: any) => item.id === body.familyConfirm.id)
    ).toBe(true);

    const respond = await server.inject({
      method: "POST",
      url: `/api/safety/confirm/${body.familyConfirm.id}/respond`,
      headers: { cookie: familyCookie },
      payload: { decision: "denied", note: "这是诈骗，别转" }
    });
    expect(respond.statusCode).toBe(200);
    expect((respond.json() as any).confirm.status).toBe("denied");

    const after = await server.inject({
      method: "GET",
      url: "/api/safety/confirm/pending?elderId=e_li",
      headers: { cookie: familyCookie }
    });
    expect(
      (after.json() as any).items.some((item: any) => item.id === body.familyConfirm.id)
    ).toBe(false);
  });

  it("searches the anti-fraud knowledge base", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/anti-fraud/search",
      headers: { cookie: elderCookie },
      payload: { query: "安全账户 转账 不要告诉家人" }
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as any).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title.length).toBeGreaterThan(0);
  });

  it("does not let an elder respond to family confirmations", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/safety/confirm/fc_missing/respond",
      headers: { cookie: elderCookie },
      payload: { decision: "approved" }
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("scam image analysis", () => {
  it("returns a high-risk fixture in mock mode", async () => {
    const result = await analyzeScamImage({
      buffer: Buffer.from("not-a-real-image"),
      mime: "image/webp",
      modelRouter: new MockModelProvider()
    });
    expect(result.riskLevel).toBe("high");
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.extractedText?.length).toBeGreaterThan(0);
  });
});
