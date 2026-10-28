import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { createDb, type AppDb } from "./store/db.js";
import { toPostgresPlaceholders, type SqlClient, type SqlStatement } from "./store/sql.js";

function pgliteClient(db: PGlite): SqlClient {
  return {
    driver: "postgres",
    supportsVector: false,
    async exec(sql: string) {
      await db.exec(sql);
    },
    prepare(sql: string): SqlStatement {
      const text = toPostgresPlaceholders(sql);
      return {
        async get<T>(...params: unknown[]) {
          const result = await db.query<T>(text, params.map((value) => value ?? null));
          return result.rows[0];
        },
        async all<T>(...params: unknown[]) {
          const result = await db.query<T>(text, params.map((value) => value ?? null));
          return result.rows;
        },
        async run(...params: unknown[]) {
          const result = await db.query(text, params.map((value) => value ?? null));
          return { changes: result.affectedRows ?? result.rows.length };
        }
      };
    },
    async ping() {
      await db.query("SELECT 1");
    },
    async close() {
      await db.close();
    }
  };
}

let pg: PGlite;
let db: AppDb;

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  db = await createDb(pgliteClient(pg), {
    masterKey: crypto.randomBytes(32),
    seed: true
  });
}, 30_000);

afterAll(async () => {
  await db.close();
});

describe("PostgreSQL data layer", () => {
  it("runs the shared migration and seeds demo data", async () => {
    const elder = await db.users.findDemo("elder");
    expect(elder?.displayName).toBe("李奶奶");
    const family = await db.users.findDemo("family");
    const links = await db.users.listFamilyLinks(family!.id);
    expect(links[0]?.elderId).toBe("e_li");
    const memories = await db.memories.listByElder("e_li");
    expect(memories.length).toBeGreaterThanOrEqual(3);
    expect(memories.some((item) => item.transcript.includes("苏州河边"))).toBe(true);
  });

  it("supports memory CRUD, sessions and alerts with PostgreSQL placeholders", async () => {
    const memory = await db.memories.create({
      elderId: "e_li",
      title: "PostgreSQL 迁移测试",
      transcript: "这是一段测试记忆，用来验证 PostgreSQL 方言。",
      tags: ["测试"],
      consent: true
    });
    const loaded = await db.memories.getById(memory.id);
    expect(loaded?.title).toBe("PostgreSQL 迁移测试");
    expect(await db.memories.countByElder("e_li")).toBeGreaterThanOrEqual(4);

    await db.sessions.upsert({
      id: "s_pg_test",
      userId: "u_elder",
      elderId: "e_li",
      messages: [{ role: "user", content: "你好" }]
    });
    const session = await db.sessions.get("s_pg_test");
    expect(session?.messages).toHaveLength(1);

    const alert = await db.safetyAlerts.create({
      elderId: "e_li",
      type: "geofence.exit",
      level: "critical",
      payload: { distanceMeters: 1200 }
    });
    await db.safetyAlerts.ack(alert.id, "ack");
    const updated = await db.safetyAlerts.getById(alert.id);
    expect(updated?.status).toBe("ack");

    const trace = await db.agentTraces.create({
      elderId: "e_li",
      userId: "u_elder",
      agent: "guardian",
      trigger: "event",
      goal: "postgres trace",
      status: "ok",
      decision: null,
      steps: [],
      citations: [],
      model: "mock",
      latencyMs: 1
    });
    expect((await db.agentTraces.getById(trace.id))?.goal).toBe("postgres trace");
  });

  it("falls back when pgvector is unavailable", async () => {
    const localPg = new PGlite();
    await localPg.waitReady;
    const client = pgliteClient(localPg);
    client.supportsVector = true;
    const exec = client.exec;
    client.exec = async (sql: string) => {
      if (sql.includes("CREATE EXTENSION")) throw new Error("vector extension unavailable");
      return exec(sql);
    };

    const localDb = await createDb(client, {
      masterKey: crypto.randomBytes(32),
      seed: false
    });
    expect(client.supportsVector).toBe(false);
    await localDb.close();
  }, 30_000);

  it("supports upserts used by eval and agent briefs", async () => {
    await db.evalCases.upsert({
      id: "pg_case",
      module: "agent",
      question: "{}",
      expected: { ok: true }
    });
    await db.evalCases.upsert({
      id: "pg_case",
      module: "agent",
      question: '{"updated":true}',
      expected: { ok: true }
    });
    const cases = await db.evalCases.list("agent");
    expect(cases.find((item) => item.id === "pg_case")?.question).toBe('{"updated":true}');

    await db.agentBriefs.upsert({
      elderId: "e_li",
      briefDate: "2026-10-28",
      content: {
        greeting: "李奶奶，早上好",
        summary: "测试简报",
        items: [],
        encouragement: "慢慢来",
        riskLevel: "low",
        confidence: 0.8,
        engine: "rules",
        model: "mock"
      }
    });
    const brief = await db.agentBriefs.getByDate("e_li", "2026-10-28");
    expect(brief?.content.summary).toBe("测试简报");
  });
});
