import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;
let familyCookie: string;
let elderCookie: string;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
  const family = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "family" }
  });
  familyCookie = cookieFrom(family.headers);
  const elder = await server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
  elderCookie = cookieFrom(elder.headers);
  const sent = await server.inject({
    method: "POST",
    url: "/api/family/elder/message",
    headers: { cookie: familyCookie },
    payload: { elderId: "e_li", content: "重置前的一条留言" }
  });
  expect(sent.statusCode).toBe(200);
});

afterAll(async () => {
  await server.close();
});

describe("demo reset", () => {
  it("rejects a wrong token", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/admin/reset-demo",
      headers: { "x-demo-reset-token": "wrong-token" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("clears demo business data, reseeds, and invalidates sessions", async () => {
    const inboxBefore = await server.inject({
      method: "GET",
      url: "/api/family/elder/messages",
      headers: { cookie: elderCookie }
    });
    expect(inboxBefore.statusCode).toBe(200);
    expect((inboxBefore.json() as any).items).toHaveLength(1);

    const reset = await server.inject({
      method: "POST",
      url: "/api/admin/reset-demo",
      headers: { "x-demo-reset-token": "test-reset" }
    });
    expect(reset.statusCode).toBe(200);
    expect((reset.json() as any).ok).toBe(true);

    // 登录态是无状态签名 Cookie，重置后仍可继续使用；数据已换成新种子。
    const me = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: elderCookie }
    });
    expect(me.statusCode).toBe(200);

    const inboxAfter = await server.inject({
      method: "GET",
      url: "/api/family/elder/messages",
      headers: { cookie: elderCookie }
    });
    expect((inboxAfter.json() as any).items).toHaveLength(0);

    const memories = await server.inject({
      method: "GET",
      url: "/api/memory/items",
      headers: { cookie: elderCookie }
    });
    expect(memories.statusCode).toBe(200);
    expect((memories.json() as any).items.length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("refuses to run when the reset token is left at the default", async () => {
    const guarded = await createServer({ config: testConfig({ demoResetToken: "change-me" }) });
    const res = await guarded.inject({
      method: "POST",
      url: "/api/admin/reset-demo",
      headers: { "x-demo-reset-token": "change-me" }
    });
    expect(res.statusCode).toBe(503);
    await guarded.close();
  });

  it("hides the reset endpoint outside demo mode", async () => {
    const hidden = await createServer({ config: testConfig() });
    (hidden.config as { demoMode: boolean }).demoMode = false;
    const res = await hidden.inject({
      method: "POST",
      url: "/api/admin/reset-demo",
      headers: { "x-demo-reset-token": "test-reset" }
    });
    expect(res.statusCode).toBe(404);
    await hidden.close();
  });
});
