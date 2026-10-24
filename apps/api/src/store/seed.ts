import type { DatabaseSync } from "node:sqlite";
import { encryptJson } from "../services/crypto.js";

/** Idempotent demo data: 李奶奶、家属小李、两种药、一个位置点。 */
export function seedDemo(db: DatabaseSync, masterKey: Buffer) {
  const now = Date.now();
  const elder = db.prepare(
    "INSERT OR IGNORE INTO elders (id, display_name, birth_year, gender, cognitive_note_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  elder.run("e_li", "李奶奶", 1948, "female", null, now);

  const user = db.prepare(
    "INSERT OR IGNORE INTO users (id, role, display_name, elder_id, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  user.run("u_elder", "elder", "李奶奶", "e_li", now);
  user.run("u_family", "family", "小李", null, now);
  user.run("u_inst", "institution", "社区养老中心", null, now);
  user.run("u_admin", "admin", "管理员", null, now);

  const link = db.prepare(
    "INSERT OR IGNORE INTO family_links (id, family_user_id, elder_id, relation, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  link.run("fl_1", "u_family", "e_li", "daughter", "active", now);

  const med = db.prepare(
    `INSERT OR IGNORE INTO medications
      (id, elder_id, name, generic_name, spec, dosage, schedule_json, photo_upload_id, notes_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  med.run(
    "med_1",
    "e_li",
    "氨氯地平",
    "苯磺酸氨氯地平",
    "5mg",
    "每日一次，每次 1 片",
    JSON.stringify([{ time: "08:00" }]),
    null,
    null,
    now,
    now
  );
  med.run(
    "med_2",
    "e_li",
    "二甲双胍",
    "盐酸二甲双胍",
    "0.5g",
    "每日两次，每次 1 片",
    JSON.stringify([{ time: "08:00" }, { time: "18:00" }]),
    null,
    null,
    now,
    now
  );

  const loc = db.prepare(
    `INSERT OR IGNORE INTO location_points (id, elder_id, lat_enc, lng_enc, accuracy, source, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  loc.run(
    "loc_seed",
    "e_li",
    encryptJson(masterKey, 32.041),
    encryptJson(masterKey, 118.781),
    25,
    "demo",
    now - 120_000
  );

  const geofence = db.prepare(
    `INSERT OR IGNORE INTO geofences
      (id, elder_id, name, shape_json, schedule_json, notify_on_json, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  geofence.run(
    "gf_home",
    "e_li",
    "家附近",
    JSON.stringify({ type: "circle", center: [118.781, 32.041], radius: 800 }),
    null,
    JSON.stringify(["exit"]),
    now,
    now
  );
}
