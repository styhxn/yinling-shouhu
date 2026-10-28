import { encryptJson } from "../services/crypto.js";
import type { SqlClient } from "./sql.js";

/** Idempotent demo data: 李奶奶、家属小李、两种药、一个位置点。 */
export async function seedDemo(db: SqlClient, masterKey: Buffer) {
  const now = Date.now();
  const elder = db.prepare(
    `INSERT INTO elders (id, display_name, birth_year, gender, cognitive_note_enc, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  await elder.run("e_li", "李奶奶", 1948, "female", null, now);

  const user = db.prepare(
    `INSERT INTO users (id, role, display_name, elder_id, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  await user.run("u_elder", "elder", "李奶奶", "e_li", now);
  await user.run("u_family", "family", "小李", null, now);
  await user.run("u_inst", "institution", "社区养老中心", null, now);
  await user.run("u_admin", "admin", "管理员", null, now);

  const link = db.prepare(
    `INSERT INTO family_links (id, family_user_id, elder_id, relation, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  await link.run("fl_1", "u_family", "e_li", "daughter", "active", now);

  const med = db.prepare(
    `INSERT INTO medications
      (id, elder_id, name, generic_name, spec, dosage, schedule_json, photo_upload_id, notes_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  await med.run(
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
  await med.run(
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
    `INSERT INTO location_points (id, elder_id, lat_enc, lng_enc, accuracy, source, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  await loc.run(
    "loc_seed",
    "e_li",
    encryptJson(masterKey, 32.041),
    encryptJson(masterKey, 118.781),
    25,
    "demo",
    now - 120_000
  );

  const geofence = db.prepare(
    `INSERT INTO geofences
      (id, elder_id, name, shape_json, schedule_json, notify_on_json, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  await geofence.run(
    "gf_home",
    "e_li",
    "家附近",
    JSON.stringify({ type: "circle", center: [118.781, 32.041], radius: 800 }),
    null,
    JSON.stringify(["exit"]),
    now,
    now
  );

  const memory = db.prepare(
    `INSERT INTO memories
      (id, elder_id, title, time_range, place, people_json, tags_json, photo_ids_json,
       transcript_enc, summary, visibility, consent, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'family', 1, 'active', ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );
  const demoMemories = [
    {
      id: "m_seed_river",
      title: "河边捉鱼的夏天",
      timeRange: "小时候",
      place: "苏州河边",
      people: ["母亲", "邻居"],
      tags: ["童年", "苏州"],
      transcript:
        "问：小时候住在哪里？\n答：我小时候住在苏州河边，夏天常和邻居下河捉鱼，回家晚了母亲会在岸上喊我。\n\n问：最难忘的是什么？\n答：母亲总在岸上喊我回家吃饭，我假装没听见。",
      summary: "小时候住在苏州河边，夏天常和邻居下河捉鱼，母亲总在岸上喊我回家吃饭。",
      createdAt: now - 3 * 24 * 60 * 60 * 1000
    },
    {
      id: "m_seed_workshop",
      title: "纺织厂的第一天",
      timeRange: "十八岁",
      place: "无锡国棉厂",
      people: ["师傅"],
      tags: ["工作", "青春"],
      transcript:
        "问：第一份工作是什么？\n答：我十八岁进无锡国棉厂当挡车工，第一天师傅教我看纱线，手把手教了三遍。\n\n问：最自豪的事？\n答：后来我带的徒弟比我还多。",
      summary: "十八岁进无锡国棉厂当挡车工，师傅手把手教看纱线，后来带出的徒弟比师傅还多。",
      createdAt: now - 2 * 24 * 60 * 60 * 1000
    },
    {
      id: "m_seed_newyear",
      title: "一家人的年夜饭",
      timeRange: "每年除夕",
      place: "南京老房子",
      people: ["老伴", "女儿"],
      tags: ["家庭", "春节"],
      transcript:
        "问：家里的年夜饭是谁做？\n答：每年除夕都是老伴负责烧菜，我负责包春卷，女儿贴春联。\n\n问：最喜欢哪道菜？\n答：最喜欢老伴做的红烧肉，孩子们也爱吃。",
      summary: "每年除夕老伴烧菜，我包春卷，女儿贴春联，一家人最喜欢红烧肉。",
      createdAt: now - 1 * 24 * 60 * 60 * 1000
    }
  ];
  for (const item of demoMemories) {
    await memory.run(
      item.id,
      "e_li",
      item.title,
      item.timeRange,
      item.place,
      JSON.stringify(item.people),
      JSON.stringify(item.tags),
      JSON.stringify([]),
      encryptJson(masterKey, item.transcript),
      item.summary,
      item.createdAt,
      item.createdAt
    );
  }
}
