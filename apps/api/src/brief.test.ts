import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBriefService } from "./services/agent/brief.js";
import { todayKey } from "./services/agent/runtime.js";
import { createServer } from "./server.js";
import { testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
});

afterAll(async () => {
  await server.close();
});

describe("brief location freshness", () => {
  it("regenerates a cached brief when the elder is outside the safe area", async () => {
    await server.db.agentBriefs.upsert({
      elderId: "e_li",
      briefDate: todayKey(),
      content: {
        greeting: "李奶奶，早上好",
        summary: "您在鼓楼区附近很安全。",
        items: [],
        encouragement: "慢慢来。",
        riskLevel: "low",
        confidence: 0.8,
        engine: "rules",
        model: "stub"
      }
    });
    await server.db.locations.insert({
      elderId: "e_li",
      lat: 31.2304,
      lng: 121.4737,
      accuracy: 20,
      source: "browser",
      ts: Date.now()
    });

    let calls = 0;
    const service = createBriefService({
      db: server.db,
      runtime: {
        async runTask() {
          calls += 1;
          return {
            decision: {
              summary: "您在鼓楼区附近很安全。",
              riskLevel: "low",
              confidence: 0.9,
              engine: "rules",
              model: "stub",
              briefItems: []
            },
            traceId: "tr_brief_test"
          };
        }
      } as any,
      memoryProfile: {
        get: async () => undefined
      } as any
    });

    const first = await service.generate({
      elderId: "e_li",
      userId: "u_family",
      requestId: "req-1"
    });
    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(first.brief.summary).toContain("离开");
    expect(first.brief.summary).toContain("公里");
    expect(first.brief.riskLevel).not.toBe("low");

    const second = await service.generate({
      elderId: "e_li",
      userId: "u_family",
      requestId: "req-2"
    });
    expect(calls).toBe(1);
    expect(second.cached).toBe(true);
  });
});
