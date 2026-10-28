-- 银龄守护 SQLite schema
-- 由 apps/api/src/store/migrations.ts 生成，请勿手工修改。
-- 重新生成：npm run db:schema
--
-- 说明：后端启动时会自动执行同一份迁移，通常无需手动建表。
-- 手动初始化：sqlite3 /path/to/app.db < docs/schema.sql
-- 语句均为 IF NOT EXISTS，可在已有库上重复执行。
-- 演示数据由 DEMO_MODE=1 启动时写入，本文件只包含表结构。

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS agent_confirmations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      args_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      responded_at INTEGER
    );

CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      meta_json TEXT,
      ip TEXT,
      ts INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      type TEXT NOT NULL,
      granted INTEGER NOT NULL,
      version TEXT NOT NULL,
      ts INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS cooling_offs (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason_enc TEXT,
      counterparty_enc TEXT,
      amount REAL,
      risk_level TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      family_confirm_id TEXT,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      outcome TEXT
    );

CREATE TABLE IF NOT EXISTS elders (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      birth_year INTEGER,
      gender TEXT,
      cognitive_note_enc TEXT,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS eval_cases (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      question TEXT NOT NULL,
      expected_json TEXT,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      metrics_json TEXT
    );

CREATE TABLE IF NOT EXISTS family_confirms (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      responded_at INTEGER,
      responded_by TEXT,
      note_enc TEXT
    );

CREATE TABLE IF NOT EXISTS family_links (
      id TEXT PRIMARY KEY,
      family_user_id TEXT NOT NULL,
      elder_id TEXT NOT NULL,
      relation TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS geofences (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      name TEXT NOT NULL,
      shape_json TEXT NOT NULL,
      schedule_json TEXT,
      notify_on_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      topic TEXT,
      photo_id TEXT,
      turn INTEGER NOT NULL,
      max_turns INTEGER NOT NULL,
      status TEXT NOT NULL,
      transcript_json TEXT NOT NULL,
      current_question TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      section TEXT,
      content TEXT NOT NULL,
      embedding_json TEXT,
      token_count INTEGER,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS kb_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT,
      license TEXT,
      tags_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS location_points (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      lat_enc TEXT NOT NULL,
      lng_enc TEXT NOT NULL,
      accuracy REAL,
      source TEXT NOT NULL,
      ts INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS medication_logs (
      id TEXT PRIMARY KEY,
      medication_id TEXT NOT NULL,
      elder_id TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_time TEXT,
      ts INTEGER NOT NULL,
      note_enc TEXT
    );

CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      name TEXT NOT NULL,
      generic_name TEXT,
      spec TEXT,
      dosage TEXT,
      schedule_json TEXT NOT NULL,
      photo_upload_id TEXT,
      notes_enc TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      title TEXT NOT NULL,
      time_range TEXT,
      place TEXT,
      people_json TEXT,
      tags_json TEXT,
      photo_ids_json TEXT,
      transcript_enc TEXT NOT NULL,
      summary TEXT,
      visibility TEXT NOT NULL DEFAULT 'family',
      consent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

CREATE TABLE IF NOT EXISTS missing_posters (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      last_seen_text_enc TEXT NOT NULL,
      last_seen_ts INTEGER,
      clothing_enc TEXT,
      photo_upload_id TEXT,
      contact_enc TEXT NOT NULL,
      image_url TEXT,
      share_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS privacy (
      elder_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS profiles (
      elder_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS roleplay_sessions (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      status TEXT NOT NULL,
      turn INTEGER NOT NULL,
      max_turns INTEGER NOT NULL,
      messages_json TEXT NOT NULL,
      report_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS safety_alerts (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      handled_by TEXT,
      handled_at INTEGER
    );

CREATE TABLE IF NOT EXISTS scam_checks (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      input_type TEXT NOT NULL,
      input_text_enc TEXT,
      image_upload_id TEXT,
      url TEXT,
      risk_level TEXT NOT NULL,
      scam_type TEXT NOT NULL,
      confidence REAL NOT NULL,
      result_json TEXT NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      elder_id TEXT,
      messages_json TEXT NOT NULL,
      summary TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS story_books (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      title TEXT NOT NULL,
      cover_upload_id TEXT,
      share_token TEXT,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS story_chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      memory_ids_json TEXT NOT NULL,
      content TEXT NOT NULL,
      audio_url TEXT,
      order_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      family_notes_enc TEXT,
      fidelity_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS tool_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      args_redacted_json TEXT NOT NULL,
      result_summary TEXT NOT NULL,
      ok INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      model TEXT,
      risk_level TEXT NOT NULL,
      ts INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      elder_id TEXT,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      sha256 TEXT,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      elder_id TEXT,
      created_at INTEGER NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_alerts_elder ON safety_alerts(elder_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_confirms_status ON family_confirms(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_family_links_elder ON family_links(elder_id);

CREATE INDEX IF NOT EXISTS idx_family_links_user ON family_links(family_user_id);

CREATE INDEX IF NOT EXISTS idx_interviews_elder ON interviews(elder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id);

CREATE INDEX IF NOT EXISTS idx_loc_elder_ts ON location_points(elder_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_med_logs_elder ON medication_logs(elder_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_medications_elder ON medications(elder_id);

CREATE INDEX IF NOT EXISTS idx_memories_elder ON memories(elder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roleplay_elder ON roleplay_sessions(elder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_logs_ts ON tool_logs(ts DESC);

PRAGMA user_version = 1;
