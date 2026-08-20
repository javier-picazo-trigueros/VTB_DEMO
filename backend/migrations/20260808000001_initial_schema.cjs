// node-pg-migrate migration — CommonJS (.cjs) for ESM project compatibility
// UP:   creates all VTB tables, indexes, and triggers
// DOWN: drops everything in reverse FK order

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  // ── Trigger function for auto-updating updated_at ──────────────────────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;
  `);

  // ── users ──────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE users (
      id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email                TEXT NOT NULL UNIQUE,
      password_hash        TEXT NOT NULL,
      name                 TEXT NOT NULL,
      student_id           TEXT NOT NULL UNIQUE,
      role                 TEXT NOT NULL DEFAULT 'student'
                             CHECK (role IN ('student', 'admin', 'superadmin')),
      admin_domain         TEXT,
      is_approved          BOOLEAN NOT NULL DEFAULT FALSE,
      approved_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
      approved_at          TIMESTAMPTZ,
      is_eligible          BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      org_unit             TEXT,
      school               TEXT,
      degree               TEXT,
      year                 SMALLINT,
      study_group          TEXT,
      deleted_at           TIMESTAMPTZ,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`CREATE INDEX idx_users_email        ON users (email);`);
  pgm.sql(`CREATE INDEX idx_users_student_id   ON users (student_id);`);
  pgm.sql(`CREATE INDEX idx_users_role         ON users (role);`);
  pgm.sql(`CREATE INDEX idx_users_admin_domain ON users (admin_domain) WHERE admin_domain IS NOT NULL;`);
  pgm.sql(`CREATE INDEX idx_users_active       ON users (is_approved)  WHERE deleted_at IS NULL;`);

  pgm.sql(`
    CREATE TRIGGER trg_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── elections ──────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE elections (
      id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      election_id_blockchain BIGINT NOT NULL,
      name                   TEXT NOT NULL,
      description            TEXT,
      start_time             BIGINT NOT NULL,
      end_time               BIGINT NOT NULL,
      is_active              BOOLEAN NOT NULL DEFAULT TRUE,
      banner_color           TEXT NOT NULL DEFAULT '#1E3A5F',
      target_type            TEXT NOT NULL DEFAULT 'domain',
      target_description     TEXT,
      voter_role             TEXT NOT NULL DEFAULT 'student',
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_elections_time_window CHECK (end_time > start_time)
    );
  `);

  pgm.sql(`CREATE INDEX idx_elections_active     ON elections (is_active) WHERE is_active = TRUE;`);
  pgm.sql(`CREATE INDEX idx_elections_blockchain ON elections (election_id_blockchain);`);

  pgm.sql(`
    CREATE TRIGGER trg_elections_updated_at
      BEFORE UPDATE ON elections
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── election_images  (S11: base64 sacado de elections.image_url) ───────
  pgm.sql(`
    CREATE TABLE election_images (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      election_id BIGINT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
      mime_type   TEXT NOT NULL DEFAULT 'image/png',
      data        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (election_id)
    );
  `);

  // ── candidates ─────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE candidates (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      election_id BIGINT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      position    SMALLINT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`CREATE INDEX idx_candidates_election ON candidates (election_id);`);

  pgm.sql(`
    CREATE TRIGGER trg_candidates_updated_at
      BEFORE UPDATE ON candidates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── election_access (mantenida sin consolidar — ver commit posterior) ──
  pgm.sql(`
    CREATE TABLE election_access (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      election_id  BIGINT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
      email_domain TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (election_id, email_domain)
    );
  `);

  pgm.sql(`CREATE INDEX idx_election_access_domain ON election_access (email_domain);`);

  // ── election_targets ────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE election_targets (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      election_id  BIGINT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
      target_type  TEXT NOT NULL,
      target_value TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (election_id, target_type, target_value)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_election_targets_lookup
      ON election_targets (election_id, target_type, target_value);
  `);

  // ── election_voters ─────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE election_voters (
      election_id BIGINT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
      user_id     BIGINT NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (election_id, user_id)
    );
  `);

  pgm.sql(`CREATE INDEX idx_election_voters_user ON election_voters (user_id);`);

  // ── vote_attempts  (TOCTOU fix) ─────────────────────────────────────────
  // INSERT must use ON CONFLICT DO UPDATE ... WHERE status = 'failed'
  // to allow retries after failure but block parallel/confirmed attempts.
  pgm.sql(`
    CREATE TABLE vote_attempts (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id        BIGINT NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
      election_id    BIGINT NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
      status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'failed')),
      nullifier_hash TEXT,
      candidate_id   BIGINT,
      started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at   TIMESTAMPTZ,
      error_detail   TEXT,
      UNIQUE (user_id, election_id)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_vote_attempts_stale
      ON vote_attempts (started_at)
      WHERE status = 'pending';
  `);

  // ── nullifier_audit ──────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE nullifier_audit (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id        BIGINT NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
      election_id    BIGINT NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
      nullifier_hash TEXT NOT NULL,
      vote_choice    TEXT,
      tx_hash        TEXT,
      block_number   BIGINT,
      candidate_id   BIGINT,
      generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, election_id)
    );
  `);

  pgm.sql(`CREATE INDEX idx_nullifier_audit_election ON nullifier_audit (election_id);`);

  // ── registration_requests ────────────────────────────────────────────────
  // approved_password eliminada (columna huérfana, confirmado en código)
  pgm.sql(`
    CREATE TABLE registration_requests (
      id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      full_name        TEXT NOT NULL,
      email            TEXT NOT NULL UNIQUE,
      student_id       TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
      rejection_reason TEXT,
      password_hash    TEXT,
      org_unit         TEXT,
      school           TEXT,
      degree           TEXT,
      year             SMALLINT,
      study_group      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at      TIMESTAMPTZ,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_reg_requests_pending
      ON registration_requests (status)
      WHERE status = 'pending';
  `);

  pgm.sql(`
    CREATE TRIGGER trg_reg_requests_updated_at
      BEFORE UPDATE ON registration_requests
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── org_units ────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE org_units (
      id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name               TEXT NOT NULL,
      domain             TEXT NOT NULL UNIQUE,
      parent_domain      TEXT,
      unit_type          TEXT NOT NULL DEFAULT 'institution',
      institution_domain TEXT NOT NULL DEFAULT '',
      logo_url           TEXT,
      primary_color      TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`CREATE INDEX idx_org_units_institution ON org_units (institution_domain);`);

  pgm.sql(`
    CREATE TRIGGER trg_org_units_updated_at
      BEFORE UPDATE ON org_units
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── schools_and_degrees ──────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE schools_and_degrees (
      id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      institution_domain TEXT NOT NULL,
      school_name        TEXT NOT NULL,
      degree_name        TEXT NOT NULL,
      degree_code        TEXT,
      years              SMALLINT NOT NULL DEFAULT 4,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (institution_domain, school_name, degree_name)
    );
  `);

  // ── email_whitelist ──────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE email_whitelist (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email        TEXT NOT NULL,
      full_name    TEXT,
      student_id   TEXT,
      admin_domain TEXT NOT NULL,
      used         BOOLEAN NOT NULL DEFAULT FALSE,
      imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (email, admin_domain)
    );
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  // Drop in reverse FK dependency order; CASCADE handles child constraints.
  pgm.sql(`DROP TABLE IF EXISTS email_whitelist        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS schools_and_degrees    CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS org_units              CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS registration_requests  CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS nullifier_audit        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS vote_attempts          CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS election_voters        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS election_targets       CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS election_access        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS candidates             CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS election_images        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS elections              CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS users                  CASCADE;`);
  pgm.sql(`DROP FUNCTION IF EXISTS set_updated_at      CASCADE;`);
};
