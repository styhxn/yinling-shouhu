import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { cookieFrom, testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
});

afterAll(async () => {
  await server.close();
});

describe("family and elder accounts", () => {
  it("registers a family by phone, creates elders and binds an elder device", async () => {
    const phone = "13800009999";
    const sent = await server.inject({
      method: "POST",
      url: "/api/auth/family/request-code",
      payload: { phone }
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().demoCode).toBe("123456");

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/family/login",
      payload: { phone, code: "123456", displayName: "小王" }
    });
    expect(login.statusCode).toBe(200);
    const familyCookie = cookieFrom(login.headers);
    const loggedIn = login.json() as any;
    expect(loggedIn.user.role).toBe("family");
    expect(loggedIn.user.displayName).toBe("小王");
    expect(loggedIn.familyLinks).toHaveLength(0);

    const created = await server.inject({
      method: "POST",
      url: "/api/auth/family/elders",
      headers: { cookie: familyCookie },
      payload: { displayName: "王奶奶", relation: "daughter", birthYear: 1945 }
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as any;
    expect(createdBody.elder.displayName).toBe("王奶奶");
    expect(createdBody.invite.code).toMatch(/^\d{6}$/);

    const me = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: familyCookie }
    });
    const meBody = me.json() as any;
    expect(meBody.familyLinks).toHaveLength(1);
    expect(meBody.familyLinks[0].elderId).toBe(createdBody.elder.id);
    expect(meBody.user.elderId).toBe(createdBody.elder.id);

    const bound = await server.inject({
      method: "POST",
      url: "/api/auth/elder/bind",
      payload: { code: createdBody.invite.code }
    });
    expect(bound.statusCode).toBe(200);
    const elderCookie = cookieFrom(bound.headers);
    const boundBody = bound.json() as any;
    expect(boundBody.user.role).toBe("elder");
    expect(boundBody.elder.id).toBe(createdBody.elder.id);
    expect(boundBody.elder.displayName).toBe("王奶奶");

    const elderMe = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: elderCookie }
    });
    expect((elderMe.json() as any).user.elderId).toBe(createdBody.elder.id);

    const reused = await server.inject({
      method: "POST",
      url: "/api/auth/elder/bind",
      payload: { code: createdBody.invite.code }
    });
    expect(reused.statusCode).toBe(401);

    const second = await server.inject({
      method: "POST",
      url: "/api/auth/family/elders",
      headers: { cookie: familyCookie },
      payload: { displayName: "王爷爷", relation: "spouse" }
    });
    expect(second.statusCode).toBe(200);
    const secondId = (second.json() as any).elder.id;

    const switched = await server.inject({
      method: "POST",
      url: "/api/auth/switch-elder",
      headers: { cookie: familyCookie },
      payload: { elderId: secondId }
    });
    expect(switched.statusCode).toBe(200);
    const switchedCookie = cookieFrom(switched.headers);
    expect((switched.json() as any).user.elderId).toBe(secondId);

    const switchedMe = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: switchedCookie }
    });
    const switchedBody = switchedMe.json() as any;
    expect(switchedBody.user.elderId).toBe(secondId);
    expect(switchedBody.familyLinks).toHaveLength(2);

    const summary = await server.inject({
      method: "GET",
      url: "/api/family/summary",
      headers: { cookie: switchedCookie }
    });
    expect(summary.statusCode).toBe(200);
    expect((summary.json() as any).summary.elder.id).toBe(secondId);
  });

  it("rejects an expired or wrong family code", async () => {
    const phone = "13800008888";
    await server.inject({
      method: "POST",
      url: "/api/auth/family/request-code",
      payload: { phone }
    });
    const wrong = await server.inject({
      method: "POST",
      url: "/api/auth/family/login",
      payload: { phone, code: "000000" }
    });
    expect(wrong.statusCode).toBe(401);
  });
});
