import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { createMaintenance } from "./services/maintenance.js";
import { testConfig } from "./testUtils.js";

const rateLimit = {
  enabled: true,
  windowMs: 60_000,
  max: 2,
  authMax: 1,
  aiMax: 1,
  uploadMax: 1,
  locationMax: 1
};

function login(server: Awaited<ReturnType<typeof createServer>>) {
  return server.inject({
    method: "POST",
    url: "/api/auth/demo-login",
    payload: { role: "elder" }
  });
}

describe("hardening", () => {
  it("rejects cross-origin requests not in the whitelist", async () => {
    const server = await createServer({ config: testConfig() });
    const allowed = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-frame-options"]).toBe("DENY");

    const denied = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example" }
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await server.close();
  });

  it("marks the session cookie secure when configured", async () => {
    const server = await createServer({ config: testConfig({ cookieSecure: true }) });
    const res = await login(server);
    const raw = res.headers["set-cookie"];
    const cookie = Array.isArray(raw) ? raw[0] : raw;
    expect(String(cookie)).toContain("Secure");
    await server.close();
  });

  it("rate limits auth attempts and can be disabled", async () => {
    const limited = await createServer({ config: testConfig({ rateLimit }) });
    expect((await login(limited)).statusCode).toBe(200);
    const blocked = await login(limited);
    expect(blocked.statusCode).toBe(429);
    expect((blocked.json() as { error: string }).error).toBe("rate_limited");
    expect(blocked.headers["retry-after"]).toBeTruthy();
    await limited.close();

    const unlimited = await createServer({
      config: testConfig({ rateLimit: { ...rateLimit, enabled: false } })
    });
    expect((await login(unlimited)).statusCode).toBe(200);
    expect((await login(unlimited)).statusCode).toBe(200);
    await unlimited.close();
  });

  it("prunes location history older than the retention window", async () => {
    const server = await createServer({ config: testConfig() });
    const oldTs = Date.now() - 200 * 24 * 60 * 60 * 1000;
    server.db.locations.insert({
      elderId: "e_li",
      lat: 31.1,
      lng: 120.1,
      accuracy: null,
      source: "demo",
      ts: oldTs
    });

    const result = createMaintenance(server.db, server.config).prune();
    expect(result.locations).toBeGreaterThanOrEqual(1);
    expect(server.db.locations.history("e_li", oldTs - 1, oldTs + 1)).toHaveLength(0);
    await server.close();
  });
});
