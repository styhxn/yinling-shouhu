import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptJson } from "../services/crypto.js";
import { migrate } from "./migrations.js";
import { seedDemo } from "./seed.js";
import { createSqliteClient } from "./sql.js";

describe("demo seed location", () => {
  it("does not let the demo point override a real location after restart", async () => {
    const db = createSqliteClient(":memory:");
    const masterKey = crypto.randomBytes(32);
    try {
      await migrate(db);
      await seedDemo(db, masterKey);
      const demoBefore = await db
        .prepare("SELECT ts FROM location_points WHERE id = 'loc_seed'")
        .get<{ ts: number }>();
      expect(demoBefore?.ts).toBeTruthy();

      await db
        .prepare(
          `INSERT INTO location_points (id, elder_id, lat_enc, lng_enc, accuracy, source, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "loc_real",
          "e_li",
          encryptJson(masterKey, 31.2304),
          encryptJson(masterKey, 121.4737),
          20,
          "browser",
          Date.now()
        );

      await seedDemo(db, masterKey);
      const latest = await db
        .prepare(
          "SELECT id, source FROM location_points WHERE elder_id = 'e_li' ORDER BY ts DESC LIMIT 1"
        )
        .get<{ id: string; source: string }>();
      expect(latest?.id).toBe("loc_real");
      expect(latest?.source).toBe("browser");

      const demoAfter = await db
        .prepare("SELECT ts FROM location_points WHERE id = 'loc_seed'")
        .get<{ ts: number }>();
      expect(demoAfter?.ts).toBe(demoBefore?.ts);
    } finally {
      await db.close();
    }
  });
});
