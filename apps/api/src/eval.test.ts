import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { runEvaluation } from "./services/eval.js";
import { testConfig } from "./testUtils.js";

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer({ config: testConfig() });
});

afterAll(async () => {
  await server.close();
});

describe("evaluation harness", () => {
  it("runs scam, story and agent suites and persists the run", async () => {
    const report = await runEvaluation({
      db: server.db,
      modelRouter: server.modelRouter
    });

    expect(report.mode).toBe("mock");
    expect(report.overall.total).toBe(15);
    expect(report.overall.passed).toBe(15);
    expect(report.overall.passRate).toBe(100);

    const scam = report.modules.find((item) => item.module === "scam");
    expect(scam?.metrics.quoteFaithfulnessPct).toBe(100);
    const story = report.modules.find((item) => item.module === "story");
    expect(Number(story?.metrics.avgGroundingPct)).toBeGreaterThan(0);
    expect(story?.metrics.fabricatedQuotes).toBe(0);
    const agent = report.modules.find((item) => item.module === "agent");
    expect(agent?.metrics.taskSuccessPct).toBe(100);
    expect(agent?.metrics.traceCompletenessPct).toBe(100);
    expect(agent?.metrics.escalationAccuracyPct).toBe(100);

    const latest = server.db.evalRuns.latest();
    expect(latest?.id).toBe(report.runId);
    expect(latest?.finishedAt).toBeTruthy();
  });

  it("can run a single module", async () => {
    const report = await runEvaluation({
      db: server.db,
      modelRouter: server.modelRouter,
      modules: ["scam"]
    });
    expect(report.modules).toHaveLength(1);
    expect(report.modules[0]?.module).toBe("scam");
  });
});
