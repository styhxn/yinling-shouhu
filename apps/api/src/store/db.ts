import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { decryptJson, encryptJson } from "../services/crypto.js";
import { migrate } from "./migrations.js";
import { seedDemo } from "./seed.js";

// Vite/Vitest rewrites `node:` imports in some setups; require the built-in
// directly so tests and production use the same SQLite implementation.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { enableForeignKeyConstraints?: boolean }) => DatabaseSyncType;
};

export type Role = "elder" | "family" | "institution" | "admin";

export type DbUser = {
  id: string;
  role: Role;
  displayName: string;
  elderId: string | null;
  createdAt: number;
};

export type DbElder = {
  id: string;
  displayName: string;
  birthYear: number | null;
  gender: string | null;
};

export type DbFamilyLink = {
  id: string;
  familyUserId: string;
  elderId: string;
  relation: string | null;
  status: string;
};

export type DbSession = {
  id: string;
  userId: string;
  elderId: string | null;
  messages: unknown[];
  summary: string | null;
  createdAt: number;
  updatedAt: number;
};

export type DbConfirmation = {
  id: string;
  sessionId: string;
  userId: string;
  tool: string;
  args: unknown;
  status: "pending" | "approved" | "cancelled" | "expired";
  expiresAt: number;
  createdAt: number;
};

export type DbCoolingOff = {
  id: string;
  elderId: string;
  status: string;
  riskLevel: string;
  questions: string[];
  familyConfirmId: string | null;
  startedAt: number;
  expiresAt: number;
};

export type DbFamilyConfirm = {
  id: string;
  elderId: string;
  type: string;
  payload: unknown;
  status: string;
  createdAt: number;
};

export type DbMedication = {
  id: string;
  elderId: string;
  name: string;
  genericName: string | null;
  spec: string | null;
  dosage: string | null;
  schedule: { time: string }[];
  notes: string | null;
};

export type DbLocation = {
  elderId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  source: string;
  ts: number;
};

export type DbToolLog = {
  sessionId: string | null;
  userId: string;
  tool: string;
  argsRedacted: Record<string, unknown>;
  resultSummary: string;
  ok: boolean;
  latencyMs: number;
  model?: string;
  riskLevel: "read" | "write" | "high";
};

export type DbScamCheck = {
  elderId: string;
  inputType: string;
  inputText: string | null;
  imageUploadId?: string | null;
  url: string | null;
  riskLevel: string;
  scamType: string;
  confidence: number;
  result: unknown;
  model?: string;
};

export type DbUpload = {
  id: string;
  ownerUserId: string;
  elderId: string | null;
  kind: string;
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: number;
};

export type DbMemory = {
  id: string;
  elderId: string;
  title: string;
  timeRange: string | null;
  place: string | null;
  people: string[];
  tags: string[];
  photoIds: string[];
  transcript: string;
  summary: string | null;
  visibility: string;
  consent: boolean;
  status: string;
  createdAt: number;
  updatedAt: number;
};

export type DbStoryBook = {
  id: string;
  elderId: string;
  title: string;
  coverUploadId: string | null;
  shareToken: string | null;
  createdAt: number;
};

export type StoryFidelity = {
  engine: "rules" | "rules+llm";
  model: string;
  groundingPct: number;
  level: "high" | "medium" | "low";
  verifiedQuotes: { text: string; sourceMemoryId: string; sourceTitle: string }[];
  removedQuotes: string[];
  sources: { id: string; title: string }[];
  warnings: string[];
};

export type DbStoryChapter = {
  id: string;
  bookId: string;
  title: string;
  memoryIds: string[];
  content: string;
  audioUrl: string | null;
  orderIndex: number;
  status: string;
  familyNotes: string | null;
  fidelity: StoryFidelity | null;
  createdAt: number;
  updatedAt: number;
};

export type DbEvalCase = {
  id: string;
  module: string;
  question: string;
  expected: unknown;
  createdAt: number;
};

export type DbEvalRun = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  metrics: unknown;
};

export type InterviewQA = {
  question: string;
  answer: string;
};

export type DbInterview = {
  id: string;
  elderId: string;
  topic: string | null;
  photoId: string | null;
  turn: number;
  maxTurns: number;
  status: string;
  transcript: InterviewQA[];
  currentQuestion: string | null;
  createdAt: number;
  updatedAt: number;
};

export type GeofenceShape = {
  type: "circle";
  center: [number, number];
  radius: number;
};

export type DbGeofence = {
  id: string;
  elderId: string;
  name: string;
  shape: GeofenceShape;
  schedule: unknown;
  notifyOn: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type DbSafetyAlert = {
  id: string;
  elderId: string;
  type: string;
  level: string;
  payload: unknown;
  status: string;
  createdAt: number;
};

export type DbMissingPoster = {
  id: string;
  elderId: string;
  elderName: string;
  birthYear: number | null;
  lastSeenText: string;
  lastSeenTs: number | null;
  clothing: string | null;
  contact: string;
  shareToken: string;
  expiresAt: number;
  status: string;
  createdAt: number;
};

export type DbMedicationLog = {
  id: string;
  medicationId: string;
  elderId: string;
  status: "taken" | "skipped" | "late";
  scheduledTime: string | null;
  ts: number;
};

export type RoleplayMessage = {
  role: "scammer" | "elder";
  text: string;
  ts: number;
  tactic?: string;
};

export type DbRoleplaySession = {
  id: string;
  elderId: string;
  scenarioId: string;
  status: string;
  turn: number;
  maxTurns: number;
  messages: RoleplayMessage[];
  report: unknown | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateDbOptions = {
  masterKey: Buffer;
  seed?: boolean;
};

function asUser(row: any): DbUser {
  return {
    id: String(row.id),
    role: row.role as Role,
    displayName: String(row.display_name),
    elderId: row.elder_id ? String(row.elder_id) : null,
    createdAt: Number(row.created_at)
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createDb(dbPath: string, options: CreateDbOptions) {
  const raw = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  raw.exec("PRAGMA busy_timeout = 5000");
  if (dbPath !== ":memory:") {
    raw.exec("PRAGMA journal_mode = WAL");
  }
  migrate(raw);
  if (options.seed) seedDemo(raw, options.masterKey);

  const enc = (value: unknown) => encryptJson(options.masterKey, value);
  const dec = <T>(blob: unknown): T | null => {
    if (typeof blob !== "string" || !blob) return null;
    try {
      return decryptJson<T>(options.masterKey, blob);
    } catch {
      return null;
    }
  };

  const users = {
    getById(id: string): DbUser | null {
      const row = raw.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
      return row ? asUser(row) : null;
    },
    findDemo(role: Role): DbUser | null {
      const row = raw
        .prepare("SELECT * FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1")
        .get(role) as any;
      return row ? asUser(row) : null;
    },
    listFamilyLinks(userId: string): DbFamilyLink[] {
      const rows = raw
        .prepare("SELECT * FROM family_links WHERE family_user_id = ? AND status = 'active'")
        .all(userId) as any[];
      return rows.map((r) => ({
        id: String(r.id),
        familyUserId: String(r.family_user_id),
        elderId: String(r.elder_id),
        relation: r.relation ? String(r.relation) : null,
        status: String(r.status)
      }));
    }
  };

  const elders = {
    getById(id: string): DbElder | null {
      const row = raw.prepare("SELECT * FROM elders WHERE id = ?").get(id) as any;
      if (!row) return null;
      return {
        id: String(row.id),
        displayName: String(row.display_name),
        birthYear: row.birth_year === null ? null : Number(row.birth_year),
        gender: row.gender === null ? null : String(row.gender)
      };
    }
  };

  const sessions = {
    get(id: string): DbSession | null {
      const row = raw.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
      if (!row) return null;
      return {
        id: String(row.id),
        userId: String(row.user_id),
        elderId: row.elder_id ? String(row.elder_id) : null,
        messages: parseJson<unknown[]>(row.messages_json, []),
        summary: row.summary ? String(row.summary) : null,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at)
      };
    },
    upsert(input: {
      id: string;
      userId: string;
      elderId: string | null;
      messages: unknown[];
      summary?: string | null;
    }): void {
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO sessions (id, user_id, elder_id, messages_json, summary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             messages_json = excluded.messages_json,
             summary = excluded.summary,
             updated_at = excluded.updated_at`
        )
        .run(
          input.id,
          input.userId,
          input.elderId,
          JSON.stringify(input.messages),
          input.summary ?? null,
          now,
          now
        );
    },
    create(userId: string, elderId: string | null): DbSession {
      const id = `s_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          "INSERT INTO sessions (id, user_id, elder_id, messages_json, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(id, userId, elderId, "[]", null, now, now);
      return { id, userId, elderId, messages: [], summary: null, createdAt: now, updatedAt: now };
    }
  };

  const confirmations = {
    create(input: {
      sessionId: string;
      userId: string;
      tool: string;
      args: unknown;
      ttlMs?: number;
    }): DbConfirmation {
      const id = `cf_${randomUUID()}`;
      const now = Date.now();
      const expiresAt = now + (input.ttlMs ?? 5 * 60 * 1000);
      raw
        .prepare(
          `INSERT INTO agent_confirmations
            (id, session_id, user_id, tool, args_json, status, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(id, input.sessionId, input.userId, input.tool, JSON.stringify(input.args), expiresAt, now);
      return {
        id,
        sessionId: input.sessionId,
        userId: input.userId,
        tool: input.tool,
        args: input.args,
        status: "pending",
        expiresAt,
        createdAt: now
      };
    },
    get(id: string): DbConfirmation | null {
      const row = raw.prepare("SELECT * FROM agent_confirmations WHERE id = ?").get(id) as any;
      if (!row) return null;
      return {
        id: String(row.id),
        sessionId: String(row.session_id),
        userId: String(row.user_id),
        tool: String(row.tool),
        args: parseJson<unknown>(row.args_json, {}),
        status: row.status,
        expiresAt: Number(row.expires_at),
        createdAt: Number(row.created_at)
      };
    },
    setStatus(id: string, status: DbConfirmation["status"]): void {
      raw
        .prepare("UPDATE agent_confirmations SET status = ?, responded_at = ? WHERE id = ?")
        .run(status, Date.now(), id);
    }
  };

  const coolingOffs = {
    create(input: {
      elderId: string;
      riskLevel: string;
      questions: string[];
      reason?: string;
      counterparty?: string;
      amount?: number;
      familyConfirmId?: string;
    }): DbCoolingOff {
      const id = `co_${randomUUID()}`;
      const now = Date.now();
      const expiresAt = now + 60_000;
      raw
        .prepare(
          `INSERT INTO cooling_offs
            (id, elder_id, status, reason_enc, counterparty_enc, amount, risk_level, questions_json, family_confirm_id, started_at, expires_at)
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.elderId,
          input.reason ? enc(input.reason) : null,
          input.counterparty ? enc(input.counterparty) : null,
          input.amount ?? null,
          input.riskLevel,
          JSON.stringify(input.questions),
          input.familyConfirmId ?? null,
          now,
          expiresAt
        );
      return {
        id,
        elderId: input.elderId,
        status: "pending",
        riskLevel: input.riskLevel,
        questions: input.questions,
        familyConfirmId: input.familyConfirmId ?? null,
        startedAt: now,
        expiresAt
      };
    },
    get(id: string): DbCoolingOff | null {
      const row = raw.prepare("SELECT * FROM cooling_offs WHERE id = ?").get(id) as any;
      if (!row) return null;
      return {
        id: String(row.id),
        elderId: String(row.elder_id),
        status: String(row.status),
        riskLevel: String(row.risk_level),
        questions: parseJson<string[]>(row.questions_json, []),
        familyConfirmId: row.family_confirm_id ? String(row.family_confirm_id) : null,
        startedAt: Number(row.started_at),
        expiresAt: Number(row.expires_at)
      };
    },
    setStatus(id: string, status: string, outcome?: string): void {
      raw
        .prepare("UPDATE cooling_offs SET status = ?, outcome = ? WHERE id = ?")
        .run(status, outcome ?? null, id);
    }
  };

  const familyConfirms = {
    create(input: { elderId: string; type: string; payload: unknown }): DbFamilyConfirm {
      const id = `fc_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO family_confirms (id, elder_id, type, payload_json, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        )
        .run(id, input.elderId, input.type, JSON.stringify(input.payload), now);
      return {
        id,
        elderId: input.elderId,
        type: input.type,
        payload: input.payload,
        status: "pending",
        createdAt: now
      };
    },
    get(id: string): DbFamilyConfirm | null {
      const row = raw.prepare("SELECT * FROM family_confirms WHERE id = ?").get(id) as any;
      if (!row) return null;
      return {
        id: String(row.id),
        elderId: String(row.elder_id),
        type: String(row.type),
        payload: parseJson<unknown>(row.payload_json, {}),
        status: String(row.status),
        createdAt: Number(row.created_at)
      };
    },
    listPending(elderId: string): DbFamilyConfirm[] {
      const rows = raw
        .prepare(
          "SELECT * FROM family_confirms WHERE elder_id = ? AND status = 'pending' ORDER BY created_at DESC"
        )
        .all(elderId) as any[];
      return rows.map((r) => ({
        id: String(r.id),
        elderId: String(r.elder_id),
        type: String(r.type),
        payload: parseJson<unknown>(r.payload_json, {}),
        status: String(r.status),
        createdAt: Number(r.created_at)
      }));
    },
    respond(id: string, decision: "approved" | "denied", respondedBy: string, note?: string): void {
      raw
        .prepare(
          "UPDATE family_confirms SET status = ?, responded_at = ?, responded_by = ?, note_enc = ? WHERE id = ?"
        )
        .run(decision, Date.now(), respondedBy, note ? enc(note) : null, id);
    }
  };

  const medications = {
    listByElder(elderId: string): DbMedication[] {
      const rows = raw
        .prepare("SELECT * FROM medications WHERE elder_id = ? ORDER BY created_at ASC")
        .all(elderId) as any[];
      return rows.map(mapMedication);
    },
    getById(id: string): DbMedication | null {
      const row = raw.prepare("SELECT * FROM medications WHERE id = ?").get(id) as any;
      return row ? mapMedication(row) : null;
    },
    create(input: {
      elderId: string;
      name: string;
      genericName?: string | null;
      spec?: string | null;
      dosage?: string | null;
      schedule: { time: string }[];
      notes?: string | null;
    }): DbMedication {
      const id = `med_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO medications
            (id, elder_id, name, generic_name, spec, dosage, schedule_json, photo_upload_id, notes_enc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.elderId,
          input.name,
          input.genericName ?? null,
          input.spec ?? null,
          input.dosage ?? null,
          JSON.stringify(input.schedule),
          null,
          input.notes ? enc(input.notes) : null,
          now,
          now
        );
      return medications.getById(id)!;
    },
    update(
      id: string,
      patch: Partial<{
        name: string;
        genericName: string | null;
        spec: string | null;
        dosage: string | null;
        schedule: { time: string }[];
        notes: string | null;
      }>
    ): DbMedication | null {
      const current = medications.getById(id);
      if (!current) return null;
      const next = {
        ...current,
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
      } as DbMedication;
      raw
        .prepare(
          `UPDATE medications SET name = ?, generic_name = ?, spec = ?, dosage = ?, schedule_json = ?, notes_enc = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          next.name,
          next.genericName,
          next.spec,
          next.dosage,
          JSON.stringify(next.schedule),
          next.notes ? enc(next.notes) : null,
          Date.now(),
          id
        );
      return medications.getById(id);
    },
    remove(id: string): void {
      raw.prepare("DELETE FROM medications WHERE id = ?").run(id);
    }
  };

  const locations = {
    insert(input: Omit<DbLocation, "ts"> & { ts?: number }): void {
      const id = `loc_${randomUUID()}`;
      raw
        .prepare(
          `INSERT INTO location_points (id, elder_id, lat_enc, lng_enc, accuracy, source, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.elderId,
          enc(input.lat),
          enc(input.lng),
          input.accuracy ?? null,
          input.source,
          input.ts ?? Date.now()
        );
    },
    latest(elderId: string): DbLocation | null {
      const row = raw
        .prepare(
          "SELECT * FROM location_points WHERE elder_id = ? ORDER BY ts DESC LIMIT 1"
        )
        .get(elderId) as any;
      if (!row) return null;
      const lat = dec<number>(row.lat_enc);
      const lng = dec<number>(row.lng_enc);
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return {
        elderId: String(row.elder_id),
        lat,
        lng,
        accuracy: row.accuracy === null ? null : Number(row.accuracy),
        source: String(row.source),
        ts: Number(row.ts)
      };
    },
    history(elderId: string, from: number, to: number): DbLocation[] {
      const rows = raw
        .prepare(
          "SELECT * FROM location_points WHERE elder_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC"
        )
        .all(elderId, from, to) as any[];
      return rows
        .map((row) => {
          const lat = dec<number>(row.lat_enc);
          const lng = dec<number>(row.lng_enc);
          if (typeof lat !== "number" || typeof lng !== "number") return null;
          return {
            elderId: String(row.elder_id),
            lat,
            lng,
            accuracy: row.accuracy === null ? null : Number(row.accuracy),
            source: String(row.source),
            ts: Number(row.ts)
          } satisfies DbLocation;
        })
        .filter((point): point is DbLocation => point !== null);
    },
    deleteBefore(ts: number): number {
      const result = raw.prepare("DELETE FROM location_points WHERE ts < ?").run(ts);
      return Number(result.changes ?? 0);
    }
  };

  const toolLogs = {
    insert(input: DbToolLog): void {
      raw
        .prepare(
          `INSERT INTO tool_logs
            (id, session_id, user_id, tool, args_redacted_json, result_summary, ok, latency_ms, model, risk_level, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `tl_${randomUUID()}`,
          input.sessionId,
          input.userId,
          input.tool,
          JSON.stringify(input.argsRedacted),
          input.resultSummary.slice(0, 500),
          input.ok ? 1 : 0,
          input.latencyMs,
          input.model ?? null,
          input.riskLevel,
          Date.now()
        );
    },
    deleteBefore(ts: number): number {
      const result = raw.prepare("DELETE FROM tool_logs WHERE ts < ?").run(ts);
      return Number(result.changes ?? 0);
    }
  };

  const auditLogs = {
    insert(input: {
      userId?: string;
      action: string;
      targetType?: string;
      targetId?: string;
      meta?: unknown;
      ip?: string;
    }): void {
      raw
        .prepare(
          `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, meta_json, ip, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `al_${randomUUID()}`,
          input.userId ?? null,
          input.action,
          input.targetType ?? null,
          input.targetId ?? null,
          input.meta ? JSON.stringify(input.meta) : null,
          input.ip ?? null,
          Date.now()
        );
    },
    deleteBefore(ts: number): number {
      const result = raw.prepare("DELETE FROM audit_logs WHERE ts < ?").run(ts);
      return Number(result.changes ?? 0);
    }
  };

  const scamChecks = {
    insert(input: DbScamCheck): void {
      raw
        .prepare(
          `INSERT INTO scam_checks
            (id, elder_id, input_type, input_text_enc, image_upload_id, url, risk_level, scam_type, confidence, result_json, model, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `sc_${randomUUID()}`,
          input.elderId,
          input.inputType,
          input.inputText ? enc(input.inputText) : null,
          input.imageUploadId ?? null,
          input.url ?? null,
          input.riskLevel,
          input.scamType,
          input.confidence,
          JSON.stringify(input.result),
          input.model ?? "rules",
          Date.now()
        );
    }
  };

  function mapUpload(row: any): DbUpload {
    return {
      id: String(row.id),
      ownerUserId: String(row.owner_user_id),
      elderId: row.elder_id ? String(row.elder_id) : null,
      kind: String(row.kind),
      path: String(row.path),
      mime: String(row.mime),
      size: Number(row.size),
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
      createdAt: Number(row.created_at)
    };
  }

  function mapMemory(row: any): DbMemory {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      title: String(row.title),
      timeRange: row.time_range ? String(row.time_range) : null,
      place: row.place ? String(row.place) : null,
      people: parseJson<string[]>(row.people_json, []),
      tags: parseJson<string[]>(row.tags_json, []),
      photoIds: parseJson<string[]>(row.photo_ids_json, []),
      transcript: dec<string>(row.transcript_enc) ?? "",
      summary: row.summary ? String(row.summary) : null,
      visibility: String(row.visibility),
      consent: Boolean(row.consent),
      status: String(row.status),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  function mapStoryBook(row: any): DbStoryBook {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      title: String(row.title),
      coverUploadId: row.cover_upload_id ? String(row.cover_upload_id) : null,
      shareToken: row.share_token ? String(row.share_token) : null,
      createdAt: Number(row.created_at)
    };
  }

  function mapStoryChapter(row: any): DbStoryChapter {
    return {
      id: String(row.id),
      bookId: String(row.book_id),
      title: String(row.title),
      memoryIds: parseJson<string[]>(row.memory_ids_json, []),
      content: String(row.content),
      audioUrl: row.audio_url ? String(row.audio_url) : null,
      orderIndex: Number(row.order_index),
      status: String(row.status),
      familyNotes: dec<string>(row.family_notes_enc),
      fidelity: parseJson<StoryFidelity | null>(row.fidelity_json, null),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  function mapInterview(row: any): DbInterview {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      topic: row.topic ? String(row.topic) : null,
      photoId: row.photo_id ? String(row.photo_id) : null,
      turn: Number(row.turn),
      maxTurns: Number(row.max_turns),
      status: String(row.status),
      transcript: parseJson<InterviewQA[]>(row.transcript_json, []),
      currentQuestion: row.current_question ? String(row.current_question) : null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  function mapMedication(row: any): DbMedication {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      name: String(row.name),
      genericName: row.generic_name ? String(row.generic_name) : null,
      spec: row.spec ? String(row.spec) : null,
      dosage: row.dosage ? String(row.dosage) : null,
      schedule: parseJson<{ time: string }[]>(row.schedule_json, []),
      notes: dec<string>(row.notes_enc)
    };
  }

  function mapGeofence(row: any): DbGeofence {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      name: String(row.name),
      shape: parseJson<GeofenceShape>(row.shape_json, {
        type: "circle",
        center: [0, 0],
        radius: 0
      }),
      schedule: parseJson<unknown>(row.schedule_json, null),
      notifyOn: parseJson<string[]>(row.notify_on_json, ["exit"]),
      active: Boolean(row.active),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  function mapAlert(row: any): DbSafetyAlert {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      type: String(row.type),
      level: String(row.level),
      payload: parseJson<unknown>(row.payload_json, {}),
      status: String(row.status),
      createdAt: Number(row.created_at)
    };
  }

  function mapPoster(row: any): DbMissingPoster {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      elderName: String(row.elder_name ?? "老人"),
      birthYear: row.birth_year === null || typeof row.birth_year === "undefined" ? null : Number(row.birth_year),
      lastSeenText: dec<string>(row.last_seen_text_enc) ?? "",
      lastSeenTs: row.last_seen_ts === null ? null : Number(row.last_seen_ts),
      clothing: dec<string>(row.clothing_enc),
      contact: dec<string>(row.contact_enc) ?? "",
      shareToken: String(row.share_token),
      expiresAt: Number(row.expires_at),
      status: String(row.status),
      createdAt: Number(row.created_at)
    };
  }

  const uploads = {
    create(input: {
      id?: string;
      ownerUserId: string;
      elderId: string | null;
      kind: string;
      path: string;
      mime: string;
      size: number;
      width: number | null;
      height: number | null;
      sha256?: string;
    }): DbUpload {
      const id = input.id ?? `up_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO uploads
            (id, owner_user_id, elder_id, kind, path, mime, size, width, height, sha256, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.ownerUserId,
          input.elderId,
          input.kind,
          input.path,
          input.mime,
          input.size,
          input.width,
          input.height,
          input.sha256 ?? null,
          now
        );
      return {
        id,
        ownerUserId: input.ownerUserId,
        elderId: input.elderId,
        kind: input.kind,
        path: input.path,
        mime: input.mime,
        size: input.size,
        width: input.width,
        height: input.height,
        createdAt: now
      };
    },
    getById(id: string): DbUpload | null {
      const row = raw.prepare("SELECT * FROM uploads WHERE id = ?").get(id) as any;
      return row ? mapUpload(row) : null;
    }
  };

  const memories = {
    create(input: {
      elderId: string;
      title: string;
      timeRange?: string | null;
      place?: string | null;
      people?: string[];
      tags?: string[];
      photoIds?: string[];
      transcript: string;
      summary?: string | null;
      visibility?: string;
      consent?: boolean;
    }): DbMemory {
      const id = `m_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO memories
            (id, elder_id, title, time_range, place, people_json, tags_json, photo_ids_json,
             transcript_enc, summary, visibility, consent, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        )
        .run(
          id,
          input.elderId,
          input.title,
          input.timeRange ?? null,
          input.place ?? null,
          JSON.stringify(input.people ?? []),
          JSON.stringify(input.tags ?? []),
          JSON.stringify(input.photoIds ?? []),
          enc(input.transcript),
          input.summary ?? null,
          input.visibility ?? "family",
          input.consent ? 1 : 0,
          now,
          now
        );
      return memories.getById(id)!;
    },
    listByElder(elderId: string): DbMemory[] {
      const rows = raw
        .prepare(
          "SELECT * FROM memories WHERE elder_id = ? AND status = 'active' ORDER BY created_at DESC"
        )
        .all(elderId) as any[];
      return rows.map(mapMemory);
    },
    countByElder(elderId: string): number {
      const row = raw
        .prepare("SELECT COUNT(*) AS n FROM memories WHERE elder_id = ? AND status = 'active'")
        .get(elderId) as any;
      return Number(row?.n ?? 0);
    },
    countByElderSince(elderId: string, sinceTs: number): number {
      const row = raw
        .prepare(
          "SELECT COUNT(*) AS n FROM memories WHERE elder_id = ? AND status = 'active' AND created_at >= ?"
        )
        .get(elderId, sinceTs) as any;
      return Number(row?.n ?? 0);
    },
    getById(id: string): DbMemory | null {
      const row = raw.prepare("SELECT * FROM memories WHERE id = ?").get(id) as any;
      return row ? mapMemory(row) : null;
    },
    update(
      id: string,
      patch: Partial<
        Pick<
          DbMemory,
          | "title"
          | "timeRange"
          | "place"
          | "people"
          | "tags"
          | "photoIds"
          | "transcript"
          | "summary"
          | "visibility"
          | "consent"
        >
      >
    ): DbMemory | null {
      const current = memories.getById(id);
      if (!current) return null;
      const next = {
        ...current,
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
        updatedAt: Date.now()
      } as DbMemory;
      raw
        .prepare(
          `UPDATE memories SET title = ?, time_range = ?, place = ?, people_json = ?, tags_json = ?,
             photo_ids_json = ?, transcript_enc = ?, summary = ?, visibility = ?, consent = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          next.title,
          next.timeRange,
          next.place,
          JSON.stringify(next.people),
          JSON.stringify(next.tags),
          JSON.stringify(next.photoIds),
          enc(next.transcript),
          next.summary,
          next.visibility,
          next.consent ? 1 : 0,
          next.updatedAt,
          id
        );
      return memories.getById(id);
    },
    softDelete(id: string): void {
      raw
        .prepare("UPDATE memories SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(Date.now(), Date.now(), id);
    }
  };

  const storyBooks = {
    ensureForElder(elderId: string, title = "我的人生故事"): DbStoryBook {
      const existing = raw
        .prepare("SELECT * FROM story_books WHERE elder_id = ? ORDER BY created_at ASC LIMIT 1")
        .get(elderId) as any;
      if (existing) return mapStoryBook(existing);

      const id = `sb_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          "INSERT INTO story_books (id, elder_id, title, cover_upload_id, share_token, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(id, elderId, title, null, null, now);
      return { id, elderId, title, coverUploadId: null, shareToken: null, createdAt: now };
    },
    getById(id: string): DbStoryBook | null {
      const row = raw.prepare("SELECT * FROM story_books WHERE id = ?").get(id) as any;
      return row ? mapStoryBook(row) : null;
    },
    getByElder(elderId: string): DbStoryBook | null {
      const row = raw
        .prepare("SELECT * FROM story_books WHERE elder_id = ? ORDER BY created_at ASC LIMIT 1")
        .get(elderId) as any;
      return row ? mapStoryBook(row) : null;
    }
  };

  const storyChapters = {
    create(input: {
      bookId: string;
      title: string;
      memoryIds: string[];
      content: string;
      orderIndex: number;
      status?: string;
      fidelity?: StoryFidelity | null;
    }): DbStoryChapter {
      const id = `ch_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO story_chapters
            (id, book_id, title, memory_ids_json, content, audio_url, order_index, status, family_notes_enc, fidelity_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.bookId,
          input.title,
          JSON.stringify(input.memoryIds),
          input.content,
          null,
          input.orderIndex,
          input.status ?? "draft",
          null,
          input.fidelity ? JSON.stringify(input.fidelity) : null,
          now,
          now
        );
      return storyChapters.getById(id)!;
    },
    getById(id: string): DbStoryChapter | null {
      const row = raw.prepare("SELECT * FROM story_chapters WHERE id = ?").get(id) as any;
      return row ? mapStoryChapter(row) : null;
    },
    listByBook(bookId: string): DbStoryChapter[] {
      const rows = raw
        .prepare("SELECT * FROM story_chapters WHERE book_id = ? ORDER BY order_index ASC")
        .all(bookId) as any[];
      return rows.map(mapStoryChapter);
    }
  };

  const interviews = {
    create(input: {
      elderId: string;
      topic: string | null;
      photoId: string | null;
      maxTurns: number;
      questions: string[];
    }): DbInterview {
      const id = `iv_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO interviews
            (id, elder_id, topic, photo_id, turn, max_turns, status, transcript_json, current_question, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, 'asking', '[]', ?, ?, ?)`
        )
        .run(
          id,
          input.elderId,
          input.topic,
          input.photoId,
          input.maxTurns,
          input.questions[0] ?? null,
          now,
          now
        );
      return interviews.get(id)!;
    },
    get(id: string): DbInterview | null {
      const row = raw.prepare("SELECT * FROM interviews WHERE id = ?").get(id) as any;
      return row ? mapInterview(row) : null;
    },
    update(
      id: string,
      patch: { turn?: number; transcript?: InterviewQA[]; currentQuestion?: string | null; status?: string }
    ): DbInterview | null {
      const current = interviews.get(id);
      if (!current) return null;
      const next = {
        ...current,
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
        updatedAt: Date.now()
      } as DbInterview;
      raw
        .prepare(
          "UPDATE interviews SET turn = ?, transcript_json = ?, current_question = ?, status = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          next.turn,
          JSON.stringify(next.transcript),
          next.currentQuestion,
          next.status,
          next.updatedAt,
          id
        );
      return interviews.get(id);
    }
  };

  const geofences = {
    listByElder(elderId: string): DbGeofence[] {
      const rows = raw
        .prepare("SELECT * FROM geofences WHERE elder_id = ? AND active = 1 ORDER BY created_at ASC")
        .all(elderId) as any[];
      return rows.map(mapGeofence);
    },
    getById(id: string): DbGeofence | null {
      const row = raw.prepare("SELECT * FROM geofences WHERE id = ?").get(id) as any;
      return row ? mapGeofence(row) : null;
    },
    create(input: {
      elderId: string;
      name: string;
      shape: GeofenceShape;
      notifyOn?: string[];
      schedule?: unknown;
    }): DbGeofence {
      const id = `gf_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO geofences
            (id, elder_id, name, shape_json, schedule_json, notify_on_json, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          id,
          input.elderId,
          input.name,
          JSON.stringify(input.shape),
          input.schedule ? JSON.stringify(input.schedule) : null,
          JSON.stringify(input.notifyOn ?? ["exit"]),
          now,
          now
        );
      return geofences.getById(id)!;
    },
    update(
      id: string,
      patch: Partial<{
        name: string;
        shape: GeofenceShape;
        notifyOn: string[];
        schedule: unknown;
        active: boolean;
      }>
    ): DbGeofence | null {
      const current = geofences.getById(id);
      if (!current) return null;
      const next = {
        ...current,
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
      } as DbGeofence;
      raw
        .prepare(
          `UPDATE geofences SET name = ?, shape_json = ?, schedule_json = ?, notify_on_json = ?, active = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          next.name,
          JSON.stringify(next.shape),
          next.schedule ? JSON.stringify(next.schedule) : null,
          JSON.stringify(next.notifyOn),
          next.active ? 1 : 0,
          Date.now(),
          id
        );
      return geofences.getById(id);
    },
    remove(id: string): void {
      raw.prepare("DELETE FROM geofences WHERE id = ?").run(id);
    }
  };

  const safetyAlerts = {
    create(input: {
      elderId: string;
      type: string;
      level: string;
      payload: unknown;
    }): DbSafetyAlert {
      const id = `al_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO safety_alerts (id, elder_id, type, level, payload_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?)`
        )
        .run(id, input.elderId, input.type, input.level, JSON.stringify(input.payload), now);
      return {
        id,
        elderId: input.elderId,
        type: input.type,
        level: input.level,
        payload: input.payload,
        status: "open",
        createdAt: now
      };
    },
    listByElder(elderId: string, status?: string): DbSafetyAlert[] {
      const rows = status
        ? (raw
            .prepare(
              "SELECT * FROM safety_alerts WHERE elder_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50"
            )
            .all(elderId, status) as any[])
        : (raw
            .prepare(
              "SELECT * FROM safety_alerts WHERE elder_id = ? ORDER BY created_at DESC LIMIT 50"
            )
            .all(elderId) as any[]);
      return rows.map(mapAlert);
    },
    ack(id: string, status: string): void {
      raw
        .prepare("UPDATE safety_alerts SET status = ?, handled_at = ? WHERE id = ?")
        .run(status, Date.now(), id);
    },
    hasRecent(elderId: string, type: string, sinceTs: number): boolean {
      const row = raw
        .prepare(
          "SELECT COUNT(*) AS n FROM safety_alerts WHERE elder_id = ? AND type = ? AND created_at >= ?"
        )
        .get(elderId, type, sinceTs) as any;
      return Number(row?.n ?? 0) > 0;
    },
    deleteHandledBefore(ts: number): number {
      const result = raw
        .prepare(
          "DELETE FROM safety_alerts WHERE created_at < ? AND status IN ('ack', 'resolved')"
        )
        .run(ts);
      return Number(result.changes ?? 0);
    }
  };

  const missingPosters = {
    create(input: {
      elderId: string;
      lastSeenText: string;
      lastSeenTs: number | null;
      clothing?: string | null;
      contact: string;
      shareToken: string;
      expiresAt: number;
      photoUploadId?: string | null;
    }): DbMissingPoster {
      const id = `mp_${randomUUID()}`;
      const now = Date.now();
      raw
        .prepare(
          `INSERT INTO missing_posters
            (id, elder_id, last_seen_text_enc, last_seen_ts, clothing_enc, photo_upload_id, contact_enc, image_url, share_token, expires_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(
          id,
          input.elderId,
          enc(input.lastSeenText),
          input.lastSeenTs,
          input.clothing ? enc(input.clothing) : null,
          input.photoUploadId ?? null,
          enc(input.contact),
          null,
          input.shareToken,
          input.expiresAt,
          now
        );
      return missingPosters.getByToken(input.shareToken)!;
    },
    getByToken(token: string): DbMissingPoster | null {
      const row = raw
        .prepare(
          `SELECT p.*, e.display_name AS elder_name, e.birth_year
           FROM missing_posters p
           JOIN elders e ON e.id = p.elder_id
           WHERE p.share_token = ?`
        )
        .get(token) as any;
      return row ? mapPoster(row) : null;
    },
    deleteExpiredBefore(ts: number): number {
      const result = raw.prepare("DELETE FROM missing_posters WHERE expires_at < ?").run(ts);
      return Number(result.changes ?? 0);
    }
  };

  const medicationLogs = {
    create(input: {
      medicationId: string;
      elderId: string;
      status: "taken" | "skipped" | "late";
      scheduledTime?: string | null;
      ts?: number;
    }): DbMedicationLog {
      const id = `ml_${randomUUID()}`;
      const ts = input.ts ?? Date.now();
      raw
        .prepare(
          `INSERT INTO medication_logs (id, medication_id, elder_id, status, scheduled_time, ts)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.medicationId,
          input.elderId,
          input.status,
          input.scheduledTime ?? null,
          ts
        );
      return {
        id,
        medicationId: input.medicationId,
        elderId: input.elderId,
        status: input.status,
        scheduledTime: input.scheduledTime ?? null,
        ts
      };
    },
    listByElder(elderId: string, from: number, to: number): DbMedicationLog[] {
      const rows = raw
        .prepare(
          "SELECT * FROM medication_logs WHERE elder_id = ? AND ts >= ? AND ts <= ? ORDER BY ts DESC"
        )
        .all(elderId, from, to) as any[];
      return rows.map((row) => ({
        id: String(row.id),
        medicationId: String(row.medication_id),
        elderId: String(row.elder_id),
        status: row.status as DbMedicationLog["status"],
        scheduledTime: row.scheduled_time ? String(row.scheduled_time) : null,
        ts: Number(row.ts)
      }));
    }
  };

  function mapRoleplay(row: any): DbRoleplaySession {
    return {
      id: String(row.id),
      elderId: String(row.elder_id),
      scenarioId: String(row.scenario_id),
      status: String(row.status),
      turn: Number(row.turn),
      maxTurns: Number(row.max_turns),
      messages: parseJson<RoleplayMessage[]>(row.messages_json, []),
      report: parseJson<unknown>(row.report_json, null),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  const roleplaySessions = {
    create(input: {
      elderId: string;
      scenarioId: string;
      maxTurns: number;
      opener: string;
    }): DbRoleplaySession {
      const id = `rp_${randomUUID()}`;
      const now = Date.now();
      const messages: RoleplayMessage[] = [
        { role: "scammer", text: input.opener, ts: now }
      ];
      raw
        .prepare(
          `INSERT INTO roleplay_sessions
            (id, elder_id, scenario_id, status, turn, max_turns, messages_json, report_json, created_at, updated_at)
           VALUES (?, ?, ?, 'active', 1, ?, ?, NULL, ?, ?)`
        )
        .run(id, input.elderId, input.scenarioId, input.maxTurns, JSON.stringify(messages), now, now);
      return roleplaySessions.get(id)!;
    },
    get(id: string): DbRoleplaySession | null {
      const row = raw.prepare("SELECT * FROM roleplay_sessions WHERE id = ?").get(id) as any;
      return row ? mapRoleplay(row) : null;
    },
    update(
      id: string,
      patch: {
        status?: string;
        turn?: number;
        messages?: RoleplayMessage[];
        report?: unknown;
      }
    ): DbRoleplaySession | null {
      const current = roleplaySessions.get(id);
      if (!current) return null;
      const next = {
        ...current,
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
        updatedAt: Date.now()
      } as DbRoleplaySession;
      raw
        .prepare(
          "UPDATE roleplay_sessions SET status = ?, turn = ?, messages_json = ?, report_json = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          next.status,
          next.turn,
          JSON.stringify(next.messages),
          next.report ? JSON.stringify(next.report) : null,
          next.updatedAt,
          id
        );
      return roleplaySessions.get(id);
    }
  };

  const evalCases = {
    upsert(input: { id: string; module: string; question: string; expected: unknown }): void {
      raw
        .prepare(
          `INSERT INTO eval_cases (id, module, question, expected_json, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             module = excluded.module,
             question = excluded.question,
             expected_json = excluded.expected_json`
        )
        .run(
          input.id,
          input.module,
          input.question,
          JSON.stringify(input.expected ?? null),
          Date.now()
        );
    },
    list(module?: string): DbEvalCase[] {
      const rows = module
        ? (raw
            .prepare("SELECT * FROM eval_cases WHERE module = ? ORDER BY id ASC")
            .all(module) as any[])
        : (raw.prepare("SELECT * FROM eval_cases ORDER BY module ASC, id ASC").all() as any[]);
      return rows.map((row) => ({
        id: String(row.id),
        module: String(row.module),
        question: String(row.question),
        expected: parseJson<unknown>(row.expected_json, null),
        createdAt: Number(row.created_at)
      }));
    }
  };

  const evalRuns = {
    start(): string {
      const id = `er_${randomUUID()}`;
      raw
        .prepare("INSERT INTO eval_runs (id, started_at, finished_at, metrics_json) VALUES (?, ?, NULL, NULL)")
        .run(id, Date.now());
      return id;
    },
    finish(id: string, metrics: unknown): void {
      raw
        .prepare("UPDATE eval_runs SET finished_at = ?, metrics_json = ? WHERE id = ?")
        .run(Date.now(), JSON.stringify(metrics ?? null), id);
    },
    latest(): DbEvalRun | null {
      const row = raw
        .prepare("SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT 1")
        .get() as any;
      return row ? mapEvalRun(row) : null;
    },
    list(limit = 10): DbEvalRun[] {
      const rows = raw
        .prepare("SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?")
        .all(limit) as any[];
      return rows.map(mapEvalRun);
    }
  };

  function mapEvalRun(row: any): DbEvalRun {
    return {
      id: String(row.id),
      startedAt: Number(row.started_at),
      finishedAt: row.finished_at === null ? null : Number(row.finished_at),
      metrics: parseJson<unknown>(row.metrics_json, null)
    };
  }

  return {
    raw,
    users,
    elders,
    sessions,
    confirmations,
    coolingOffs,
    familyConfirms,
    medications,
    locations,
    toolLogs,
    auditLogs,
    scamChecks,
    uploads,
    memories,
    storyBooks,
    storyChapters,
    interviews,
    geofences,
    safetyAlerts,
    missingPosters,
    medicationLogs,
    roleplaySessions,
    evalCases,
    evalRuns,
    close: () => raw.close()
  };
}

export type AppDb = ReturnType<typeof createDb>;
