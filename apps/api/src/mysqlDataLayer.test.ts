import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type AppDb } from "./store/db.js";
import { seedDemo } from "./store/seed.js";
import { createMysqlClient, type SqlClient } from "./store/sql.js";

const testUrl = process.env.MYSQL_TEST_URL;
const maybeDescribe = testUrl ? describe : describe.skip;

let sql: SqlClient;
let db: AppDb;
const masterKey = crypto.randomBytes(32);

async function resetDatabase(client: SqlClient) {
  const rows = await client.prepare("SHOW TABLES").all<Record<string, unknown>>();
  for (const row of rows) {
    const table = String(Object.values(row)[0] ?? "");
    if (!table) continue;
    await client.exec(`DROP TABLE IF EXISTS \`${table.replace(/`/g, "``")}\``);
  }
}

maybeDescribe("MySQL 8 data layer", () => {
  beforeAll(async () => {
    sql = createMysqlClient({ connectionString: testUrl!, max: 5 });
    await resetDatabase(sql);
    db = await createDb(sql, { masterKey, seed: true });
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("runs the MySQL migration and seeds demo data idempotently", async () => {
    const elder = await db.users.findDemo("elder");
    expect(elder?.displayName).toBe("李奶奶");

    await seedDemo(db.sql, masterKey);
    const memories = await db.memories.listByElder("e_li");
    expect(memories.length).toBe(3);
    expect(memories.some((item) => item.transcript.includes("苏州河边"))).toBe(true);
  });

  it("supports core CRUD, upserts and trigger_type mapping", async () => {
    const memory = await db.memories.create({
      elderId: "e_li",
      title: "MySQL 迁移测试",
      transcript: "这是一段测试记忆，用来验证 MySQL 方言。",
      tags: ["测试"],
      consent: true
    });
    expect((await db.memories.getById(memory.id))?.title).toBe("MySQL 迁移测试");
    expect(await db.memories.countByElder("e_li")).toBe(4);

    await db.sessions.upsert({
      id: "s_mysql_test",
      userId: "u_elder",
      elderId: "e_li",
      messages: [{ role: "user", content: "你好" }]
    });
    await db.sessions.upsert({
      id: "s_mysql_test",
      userId: "u_elder",
      elderId: "e_li",
      messages: [{ role: "user", content: "更新" }],
      summary: "测试摘要"
    });
    const session = await db.sessions.get("s_mysql_test");
    expect(session?.messages[0]).toMatchObject({ content: "更新" });
    expect(session?.summary).toBe("测试摘要");

    const alert = await db.safetyAlerts.create({
      elderId: "e_li",
      type: "geofence.exit",
      level: "critical",
      payload: { distanceMeters: 1200 }
    });
    await db.safetyAlerts.ack(alert.id, "ack");
    expect((await db.safetyAlerts.getById(alert.id))?.status).toBe("ack");

    const trace = await db.agentTraces.create({
      elderId: "e_li",
      userId: "u_elder",
      agent: "guardian",
      trigger: "event",
      goal: "mysql trace",
      status: "ok",
      decision: null,
      steps: [],
      citations: [],
      model: "mock",
      latencyMs: 1
    });
    expect((await db.agentTraces.getById(trace.id))?.trigger).toBe("event");

    await db.evalCases.upsert({
      id: "mysql_case",
      module: "agent",
      question: '{"updated":true}',
      expected: { ok: true }
    });
    await db.evalCases.upsert({
      id: "mysql_case",
      module: "agent",
      question: '{"updated":true}',
      expected: { ok: true }
    });
    expect((await db.evalCases.list("agent")).find((item) => item.id === "mysql_case")?.question).toBe(
      '{"updated":true}'
    );

    await db.agentBriefs.upsert({
      elderId: "e_li",
      briefDate: "2026-10-28",
      content: {
        greeting: "李奶奶，早上好",
        summary: "MySQL 简报",
        items: [],
        encouragement: "慢慢来",
        riskLevel: "low",
        confidence: 0.8,
        engine: "rules",
        model: "mock"
      }
    });
    expect((await db.agentBriefs.getByDate("e_li", "2026-10-28"))?.content.summary).toBe(
      "MySQL 简报"
    );

    await db.memoryProfiles.upsert({
      elderId: "e_li",
      profile: {
        summary: "测试画像",
        people: [],
        places: [],
        routines: [],
        preferences: [],
        sensitivities: [],
        engine: "rules",
        model: "mock",
        updatedAt: Date.now()
      },
      sourceCount: 4
    });
    expect((await db.memoryProfiles.getByElder("e_li"))?.sourceCount).toBe(4);
  });
});
