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

describe("auth", () => {
  it("rejects /api/me without a session", async () => {
    const res = await server.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });

  it("demo login returns a session and /api/me", async () => {
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/demo-login",
      payload: { role: "elder" }
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieFrom(login.headers);
    expect(cookie).toContain("yl_session=");

    const me = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie }
    });
    expect(me.statusCode).toBe(200);
    const body = me.json() as any;
    expect(body.user.role).toBe("elder");
    expect(body.user.displayName).toBe("李奶奶");
    expect(body.elder.id).toBe("e_li");
  });

  it("family login sees the linked elder", async () => {
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/demo-login",
      payload: { role: "family" }
    });
    expect(login.statusCode).toBe(200);
    const me = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: cookieFrom(login.headers) }
    });
    const body = me.json() as any;
    expect(body.user.role).toBe("family");
    expect(body.familyLinks[0].elderId).toBe("e_li");
  });

  it("logout clears the session", async () => {
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/demo-login",
      payload: { role: "elder" }
    });
    const cookie = cookieFrom(login.headers);
    const logout = await server.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie }
    });
    expect(logout.statusCode).toBe(200);
    const cleared = cookieFrom(logout.headers);
    const me = await server.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: cleared }
    });
    expect(me.statusCode).toBe(401);
  });
});
