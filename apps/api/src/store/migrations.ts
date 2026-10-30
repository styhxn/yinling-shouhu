import type { SqlClient } from "./sql.js";

/**
 * SQLite schema. Keep this idempotent so existing databases can be upgraded
 * without a separate migration step.
 */
export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      elder_id TEXT,
      phone TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes(phone, created_at DESC);

    CREATE TABLE IF NOT EXISTS elder_invites (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_elder_invites_elder ON elder_invites(elder_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS elders (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      birth_year INTEGER,
      gender TEXT,
      cognitive_note_enc TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_profiles (
      elder_id TEXT PRIMARY KEY,
      conditions_json TEXT NOT NULL,
      allergies_json TEXT NOT NULL,
      diet_notes TEXT,
      home_address TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS family_links (
      id TEXT PRIMARY KEY,
      family_user_id TEXT NOT NULL,
      elder_id TEXT NOT NULL,
      relation TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      phone TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_family_links_user ON family_links(family_user_id);
    CREATE INDEX IF NOT EXISTS idx_family_links_elder ON family_links(elder_id);

    CREATE TABLE IF NOT EXISTS family_messages (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      family_user_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'general',
      \`read\` INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_family_messages_family ON family_messages(family_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_family_messages_elder ON family_messages(elder_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS profiles (
      elder_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS privacy (
      elder_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_memories_elder ON memories(elder_id, created_at DESC);

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
    CREATE INDEX IF NOT EXISTS idx_interviews_elder ON interviews(elder_id, created_at DESC);

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
    CREATE INDEX IF NOT EXISTS idx_medications_elder ON medications(elder_id);

    CREATE TABLE IF NOT EXISTS medication_logs (
      id TEXT PRIMARY KEY,
      medication_id TEXT NOT NULL,
      elder_id TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_time TEXT,
      ts INTEGER NOT NULL,
      note_enc TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_med_logs_elder ON medication_logs(elder_id, ts DESC);

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
    CREATE INDEX IF NOT EXISTS idx_confirms_status ON family_confirms(status, created_at DESC);

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

    CREATE TABLE IF NOT EXISTS location_points (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      lat_enc TEXT NOT NULL,
      lng_enc TEXT NOT NULL,
      accuracy REAL,
      source TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_loc_elder_ts ON location_points(elder_id, ts DESC);

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
    CREATE INDEX IF NOT EXISTS idx_alerts_elder ON safety_alerts(elder_id, status, created_at DESC);

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
    CREATE INDEX IF NOT EXISTS idx_roleplay_elder ON roleplay_sessions(elder_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      elder_id TEXT,
      messages_json TEXT NOT NULL,
      summary TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_tool_logs_ts ON tool_logs(ts DESC);

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

    CREATE TABLE IF NOT EXISTS kb_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT,
      license TEXT,
      tags_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id);

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

    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      decision_json TEXT,
      steps_json TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      model TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_traces_elder ON agent_traces(elder_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS agent_briefs (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      brief_date TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(elder_id, brief_date)
    );

    CREATE TABLE IF NOT EXISTS memory_profiles (
      elder_id TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      source_count INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_logs_user ON tool_logs(user_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_scam_checks_elder ON scam_checks(elder_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_story_chapters_book ON story_chapters(book_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON audit_logs(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_missing_posters_expires ON missing_posters(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`;

/**
 * MySQL 8 schema. MySQL has no pgvector and uses VARCHAR for indexed IDs;
 * JSON blobs are LONGTEXT so the repository can keep returning strings.
 */
export const MYSQL_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      role VARCHAR(32) NOT NULL,
      display_name VARCHAR(128) NOT NULL,
      elder_id VARCHAR(64),
      phone VARCHAR(32),
      created_at BIGINT NOT NULL,
      UNIQUE KEY uq_users_phone (phone),
      KEY idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS auth_codes (
      id VARCHAR(64) PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at BIGINT NOT NULL,
      consumed_at BIGINT,
      attempts INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      KEY idx_auth_codes_phone (phone, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS elder_invites (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      created_by VARCHAR(64) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at BIGINT NOT NULL,
      consumed_at BIGINT,
      attempts INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      KEY idx_elder_invites_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS elders (
      id VARCHAR(64) PRIMARY KEY,
      display_name VARCHAR(128) NOT NULL,
      birth_year INT,
      gender VARCHAR(16),
      cognitive_note_enc LONGTEXT,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS health_profiles (
      elder_id VARCHAR(64) PRIMARY KEY,
      conditions_json LONGTEXT NOT NULL,
      allergies_json LONGTEXT NOT NULL,
      diet_notes VARCHAR(255),
      home_address VARCHAR(255),
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS family_links (
      id VARCHAR(64) PRIMARY KEY,
      family_user_id VARCHAR(64) NOT NULL,
      elder_id VARCHAR(64) NOT NULL,
      relation VARCHAR(64),
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      phone VARCHAR(64),
      created_at BIGINT NOT NULL,
      KEY idx_family_links_user (family_user_id),
      KEY idx_family_links_elder (elder_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS family_messages (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      family_user_id VARCHAR(64) NOT NULL,
      from_role VARCHAR(32) NOT NULL,
      content LONGTEXT NOT NULL,
      kind VARCHAR(32) NOT NULL DEFAULT 'general',
      \`read\` TINYINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      KEY idx_family_messages_family (family_user_id, created_at DESC),
      KEY idx_family_messages_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS profiles (
      elder_id VARCHAR(64) PRIMARY KEY,
      data_json LONGTEXT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS privacy (
      elder_id VARCHAR(64) PRIMARY KEY,
      data_json LONGTEXT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS memories (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      time_range VARCHAR(64),
      place VARCHAR(255),
      people_json LONGTEXT,
      tags_json LONGTEXT,
      photo_ids_json LONGTEXT,
      transcript_enc LONGTEXT NOT NULL,
      summary TEXT,
      visibility VARCHAR(32) NOT NULL DEFAULT 'family',
      consent TINYINT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT,
      KEY idx_memories_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS interviews (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      topic VARCHAR(255),
      photo_id VARCHAR(64),
      turn INT NOT NULL,
      max_turns INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      transcript_json LONGTEXT NOT NULL,
      current_question TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_interviews_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS story_books (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      cover_upload_id VARCHAR(64),
      share_token VARCHAR(128),
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS story_chapters (
      id VARCHAR(64) PRIMARY KEY,
      book_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      memory_ids_json LONGTEXT NOT NULL,
      content LONGTEXT NOT NULL,
      audio_url TEXT,
      order_index INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      family_notes_enc LONGTEXT,
      fidelity_json LONGTEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_story_chapters_book (book_id, order_index)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS medications (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      generic_name VARCHAR(255),
      spec VARCHAR(255),
      dosage VARCHAR(255),
      schedule_json LONGTEXT NOT NULL,
      photo_upload_id VARCHAR(64),
      notes_enc LONGTEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_medications_elder (elder_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS medication_logs (
      id VARCHAR(64) PRIMARY KEY,
      medication_id VARCHAR(64) NOT NULL,
      elder_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      scheduled_time VARCHAR(64),
      ts BIGINT NOT NULL,
      note_enc LONGTEXT,
      KEY idx_med_logs_elder (elder_id, ts DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS scam_checks (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      input_type VARCHAR(32) NOT NULL,
      input_text_enc LONGTEXT,
      image_upload_id VARCHAR(64),
      url TEXT,
      risk_level VARCHAR(32) NOT NULL,
      scam_type VARCHAR(64) NOT NULL,
      confidence DOUBLE NOT NULL,
      result_json LONGTEXT NOT NULL,
      model VARCHAR(128),
      created_at BIGINT NOT NULL,
      KEY idx_scam_checks_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS cooling_offs (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      reason_enc LONGTEXT,
      counterparty_enc LONGTEXT,
      amount DOUBLE,
      risk_level VARCHAR(32) NOT NULL,
      questions_json LONGTEXT NOT NULL,
      family_confirm_id VARCHAR(64),
      started_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      outcome VARCHAR(32)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS family_confirms (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      type VARCHAR(32) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      responded_at BIGINT,
      responded_by VARCHAR(64),
      note_enc LONGTEXT,
      KEY idx_confirms_status (status, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS geofences (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      shape_json LONGTEXT NOT NULL,
      schedule_json LONGTEXT,
      notify_on_json LONGTEXT NOT NULL,
      active TINYINT NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS location_points (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      lat_enc LONGTEXT NOT NULL,
      lng_enc LONGTEXT NOT NULL,
      accuracy DOUBLE,
      source VARCHAR(32) NOT NULL,
      ts BIGINT NOT NULL,
      KEY idx_loc_elder_ts (elder_id, ts DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS safety_alerts (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL,
      level VARCHAR(32) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      created_at BIGINT NOT NULL,
      handled_by VARCHAR(64),
      handled_at BIGINT,
      KEY idx_alerts_elder (elder_id, status, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS missing_posters (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      last_seen_text_enc LONGTEXT NOT NULL,
      last_seen_ts BIGINT,
      clothing_enc LONGTEXT,
      photo_upload_id VARCHAR(64),
      contact_enc LONGTEXT NOT NULL,
      image_url TEXT,
      share_token VARCHAR(128) NOT NULL,
      expires_at BIGINT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL,
      KEY idx_missing_posters_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS agent_confirmations (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      tool VARCHAR(64) NOT NULL,
      args_json LONGTEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      responded_at BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS roleplay_sessions (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      scenario_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      turn INT NOT NULL,
      max_turns INT NOT NULL,
      messages_json LONGTEXT NOT NULL,
      report_json LONGTEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_roleplay_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      elder_id VARCHAR(64),
      messages_json LONGTEXT NOT NULL,
      summary LONGTEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_sessions_user (user_id, updated_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS tool_logs (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64),
      user_id VARCHAR(64) NOT NULL,
      tool VARCHAR(64) NOT NULL,
      args_redacted_json LONGTEXT NOT NULL,
      result_summary TEXT NOT NULL,
      ok TINYINT NOT NULL,
      latency_ms INT NOT NULL,
      model VARCHAR(128),
      risk_level VARCHAR(32) NOT NULL,
      ts BIGINT NOT NULL,
      KEY idx_tool_logs_ts (ts DESC),
      KEY idx_tool_logs_user (user_id, ts DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS uploads (
      id VARCHAR(64) PRIMARY KEY,
      owner_user_id VARCHAR(64) NOT NULL,
      elder_id VARCHAR(64),
      kind VARCHAR(32) NOT NULL,
      path TEXT NOT NULL,
      mime VARCHAR(128) NOT NULL,
      size BIGINT NOT NULL,
      width INT,
      height INT,
      sha256 VARCHAR(64),
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS kb_docs (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      source_url TEXT,
      license VARCHAR(128),
      tags_json LONGTEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS kb_chunks (
      id VARCHAR(64) PRIMARY KEY,
      doc_id VARCHAR(64) NOT NULL,
      section VARCHAR(255),
      content LONGTEXT NOT NULL,
      embedding_json LONGTEXT,
      token_count INT,
      created_at BIGINT NOT NULL,
      KEY idx_kb_chunks_doc (doc_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS eval_cases (
      id VARCHAR(64) PRIMARY KEY,
      module VARCHAR(32) NOT NULL,
      question LONGTEXT NOT NULL,
      expected_json LONGTEXT,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS eval_runs (
      id VARCHAR(64) PRIMARY KEY,
      started_at BIGINT NOT NULL,
      finished_at BIGINT,
      metrics_json LONGTEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS agent_traces (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      agent VARCHAR(32) NOT NULL,
      trigger_type VARCHAR(32) NOT NULL,
      goal TEXT NOT NULL,
      status VARCHAR(32) NOT NULL,
      decision_json LONGTEXT,
      steps_json LONGTEXT NOT NULL,
      citations_json LONGTEXT NOT NULL,
      model VARCHAR(128) NOT NULL,
      latency_ms INT NOT NULL,
      created_at BIGINT NOT NULL,
      KEY idx_agent_traces_elder (elder_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS agent_briefs (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      brief_date VARCHAR(16) NOT NULL,
      content_json LONGTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_agent_brief (elder_id, brief_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS memory_profiles (
      elder_id VARCHAR(64) PRIMARY KEY,
      profile_json LONGTEXT NOT NULL,
      source_count INT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      action VARCHAR(128) NOT NULL,
      target_type VARCHAR(64),
      target_id VARCHAR(64),
      meta_json LONGTEXT,
      ip VARCHAR(64),
      ts BIGINT NOT NULL,
      KEY idx_audit_logs_ts (ts DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS consents (
      id VARCHAR(64) PRIMARY KEY,
      elder_id VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL,
      granted TINYINT NOT NULL,
      version VARCHAR(32) NOT NULL,
      ts BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const MYSQL_STATEMENT_SEPARATOR = /;\s*(?:\r?\n|$)/;

function mysqlStatements(sql: string): string[] {
  return sql
    .split(MYSQL_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function sqliteMigrate(db: SqlClient) {
  await db.exec("PRAGMA foreign_keys = ON;");
  await db.exec(SCHEMA_SQL);
  await db.exec("PRAGMA user_version = 1;");

  const userColumns = await db
    .prepare("PRAGMA table_info(users)")
    .all<{ name?: string }>();
  if (!userColumns.some((column) => column.name === "phone")) {
    await db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)");

  const memoryColumns = await db
    .prepare("PRAGMA table_info(memories)")
    .all<{ name?: string }>();
  if (!memoryColumns.some((column) => column.name === "photo_ids_json")) {
    await db.exec("ALTER TABLE memories ADD COLUMN photo_ids_json TEXT");
  }

  const medicationLogColumns = await db
    .prepare("PRAGMA table_info(medication_logs)")
    .all<{ name?: string }>();
  if (!medicationLogColumns.some((column) => column.name === "scheduled_time")) {
    await db.exec("ALTER TABLE medication_logs ADD COLUMN scheduled_time TEXT");
  }

  const storyChapterColumns = await db
    .prepare("PRAGMA table_info(story_chapters)")
    .all<{ name?: string }>();
  if (!storyChapterColumns.some((column) => column.name === "fidelity_json")) {
    await db.exec("ALTER TABLE story_chapters ADD COLUMN fidelity_json TEXT");
  }

  const traceColumns = await db
    .prepare("PRAGMA table_info(agent_traces)")
    .all<{ name?: string }>();
  if (
    !traceColumns.some((column) => column.name === "trigger_type") &&
    traceColumns.some((column) => column.name === "trigger")
  ) {
    await db.exec("ALTER TABLE agent_traces RENAME COLUMN trigger TO trigger_type");
  }

  const familyLinkColumns = await db
    .prepare("PRAGMA table_info(family_links)")
    .all<{ name?: string }>();
  if (!familyLinkColumns.some((column) => column.name === "phone")) {
    await db.exec("ALTER TABLE family_links ADD COLUMN phone TEXT");
  }
}

async function mysqlHasColumn(db: SqlClient, table: string, column: string) {
  const rows = await db
    .prepare(
      "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?"
    )
    .all<{ name?: string }>(table);
  return rows.some((row) => row.name === column);
}

async function mysqlHasIndex(db: SqlClient, table: string, index: string) {
  const rows = await db
    .prepare(
      "SELECT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?"
    )
    .all<{ name?: string }>(table, index);
  return rows.length > 0;
}

async function mysqlMigrate(db: SqlClient) {
  for (const statement of mysqlStatements(MYSQL_SCHEMA_SQL)) {
    await db.exec(statement);
  }

  if (!(await mysqlHasColumn(db, "users", "phone"))) {
    await db.exec("ALTER TABLE users ADD COLUMN phone VARCHAR(32)");
  }
  if (!(await mysqlHasIndex(db, "users", "uq_users_phone"))) {
    await db.exec("ALTER TABLE users ADD UNIQUE KEY uq_users_phone (phone)");
  }

  if (
    !(await mysqlHasColumn(db, "memories", "photo_ids_json"))
  ) {
    await db.exec("ALTER TABLE memories ADD COLUMN photo_ids_json LONGTEXT");
  }
  if (!(await mysqlHasColumn(db, "medication_logs", "scheduled_time"))) {
    await db.exec("ALTER TABLE medication_logs ADD COLUMN scheduled_time VARCHAR(64)");
  }
  if (!(await mysqlHasColumn(db, "story_chapters", "fidelity_json"))) {
    await db.exec("ALTER TABLE story_chapters ADD COLUMN fidelity_json LONGTEXT");
  }
  if (
    !(await mysqlHasColumn(db, "agent_traces", "trigger_type")) &&
    (await mysqlHasColumn(db, "agent_traces", "trigger"))
  ) {
    await db.exec("ALTER TABLE agent_traces RENAME COLUMN `trigger` TO trigger_type");
  }
  if (!(await mysqlHasColumn(db, "family_links", "phone"))) {
    await db.exec("ALTER TABLE family_links ADD COLUMN phone VARCHAR(64)");
  }

  await db.exec(
    "INSERT IGNORE INTO schema_migrations (version, applied_at) VALUES (1, CAST(UNIX_TIMESTAMP() * 1000 AS SIGNED))"
  );
}

export async function migrate(db: SqlClient) {
  if (db.driver === "mysql") {
    await mysqlMigrate(db);
  } else {
    await sqliteMigrate(db);
  }
}
