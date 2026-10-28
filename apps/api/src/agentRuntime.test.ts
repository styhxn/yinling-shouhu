import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
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

describe("agent runtime", () => {
  it("generates and caches an AI brief with a readable trace", async () => {
    const first = await server.inject({
      method: "GET",
      url: "/api/agent/brief",
      headers: { cookie: elderCookie }
    });
    expect(first.statusCode).toBe(200);
    const body = first.json() as any;
    expect(body.ok).toBe(true);
    expect(body.cached).toBe(false);
    expect(body.brief.summary.length).toBeGreaterThan(0);
    expect(body.brief.items.length).toBeGreaterThan(0);
    expect(body.brief.traceId).toMatch(/^tr_/);

    const trace = await server.inject({
      method: "GET",
      url: `/api/agent/traces/${body.brief.traceId}`,
      headers: { cookie: elderCookie }
    });
    expect(trace.statusCode).toBe(200);
    const traceBody = trace.json() as any;
    expect(traceBody.trace.agent).toBe("companion");
    expect(traceBody.trace.trigger).toBe("schedule");
    expect(traceBody.trace.steps.some((step: any) => step.type === "tool_call")).toBe(true);
    expect(traceBody.trace.decision.engine).toBe("rules+llm");

    const second = await server.inject({
      method: "GET",
      url: "/api/agent/brief",
      headers: { cookie: familyCookie }
    });
    expect(second.statusCode).toBe(200);
    const cached = second.json() as any;
    expect(cached.cached).toBe(true);
    expect(cached.brief.traceId).toBe(body.brief.traceId);
  });

  it("assesses a safety alert proactively and writes the assessment back", async () => {
    const alert = await server.db.safetyAlerts.create({
      elderId: "e_li",
      type: "geofence.exit",
      level: "critical",
      payload: { geofenceName: "家附近", distanceMeters: 1200, hasLastPoint: true }
    });

    const assessment = await server.proactive.assess(alert);
    expect(assessment).toBeTruthy();
    expect(assessment?.riskLevel).toBe("high");
    expect(assessment?.needsConfirmation).toBe(true);
    expect(assessment?.traceId).toMatch(/^tr_/);

    const updated = await server.db.safetyAlerts.getById(alert.id);
    const stored = (updated?.payload as any)?.assessment;
    expect(stored.summary.length).toBeGreaterThan(0);
    expect(stored.likelyCause.length).toBeGreaterThan(0);
    expect(updated?.status).toBe("open");

    const trace = await server.db.agentTraces.getById(assessment!.traceId);
    expect(trace?.agent).toBe("guardian");
    expect(trace?.trigger).toBe("event");
    expect(trace?.decision?.riskLevel).toBe("high");
  });

  it("builds a memory profile from the elder's own words", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/memory/profile?refresh=1",
      headers: { cookie: elderCookie }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.profile.summary.length).toBeGreaterThan(5);
    expect(body.profile.people.length).toBeGreaterThan(0);
    expect(body.profile.places.length).toBeGreaterThan(0);
    expect(body.profile.engine).toBe("rules+llm");
    expect(body.sourceCount).toBeGreaterThanOrEqual(3);
  });

  it("scopes traces to the bound elder", async () => {
    const alert = await server.db.safetyAlerts.create({
      elderId: "e_li",
      type: "cooling_off",
      level: "critical",
      payload: { amount: 50000 }
    });
    const assessment = await server.proactive.assess(alert);
    const res = await server.inject({
      method: "GET",
      url: `/api/agent/traces/${assessment!.traceId}`,
      headers: { cookie: familyCookie }
    });
    expect(res.statusCode).toBe(200);

    await server.db.elders.getById("e_li");
    await server.db.sql
      .prepare(
        "INSERT INTO elders (id, display_name, birth_year, gender, cognitive_note_enc, created_at) VALUES (?, ?, ?, ?, NULL, ?) ON CONFLICT (id) DO NOTHING"
      )
      .run("e_other", "张爷爷", 1945, "male", Date.now());
    await server.db.agentTraces.create({
      elderId: "e_other",
      userId: "u_other",
      agent: "guardian",
      trigger: "event",
      goal: "other elder",
      status: "ok",
      decision: null,
      steps: [],
      citations: [],
      model: "mock",
      latencyMs: 1
    });
    const other = (await server.db.agentTraces.listByElder("e_other", 1))[0]!;
    const forbidden = await server.inject({
      method: "GET",
      url: `/api/agent/traces/${other.id}`,
      headers: { cookie: familyCookie }
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
