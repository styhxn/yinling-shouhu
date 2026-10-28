-- 银龄守护 MySQL 8 schema
-- 由 apps/api/src/store/migrations.ts 生成，请勿手工修改。
-- 重新生成：npm run db:schema
--
-- 说明：后端启动时会自动执行同一份迁移；本文件用于 DBA 审计或手动建库。
-- 手动初始化：mysql -u root -p yinling < docs/schema.mysql.sql
-- 需要 MySQL 8.0+；业务时间戳统一为 BIGINT（毫秒），字符集 utf8mb4。

SET NAMES utf8mb4;

    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      role VARCHAR(32) NOT NULL,
      display_name VARCHAR(128) NOT NULL,
      elder_id VARCHAR(64),
      created_at BIGINT NOT NULL,
      KEY idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS elders (
      id VARCHAR(64) PRIMARY KEY,
      display_name VARCHAR(128) NOT NULL,
      birth_year INT,
      gender VARCHAR(16),
      cognitive_note_enc LONGTEXT,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS family_links (
      id VARCHAR(64) PRIMARY KEY,
      family_user_id VARCHAR(64) NOT NULL,
      elder_id VARCHAR(64) NOT NULL,
      relation VARCHAR(64),
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL,
      KEY idx_family_links_user (family_user_id),
      KEY idx_family_links_elder (elder_id)
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

