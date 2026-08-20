'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {

  // ── email_log ────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS email_log (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      recipient     TEXT        NOT NULL,
      template_name TEXT        NOT NULL,
      subject       TEXT        NOT NULL,
      resend_id     TEXT,
      status        TEXT        NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','failed','skipped')),
      attempts      INTEGER     NOT NULL DEFAULT 0,
      last_error    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at       TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON email_log(recipient);
    CREATE INDEX IF NOT EXISTS idx_email_log_status    ON email_log(status, created_at DESC);
  `);

  // ── password_reset_tokens ────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT        NOT NULL UNIQUE,
      type       TEXT        NOT NULL DEFAULT 'reset'
                   CHECK (type IN ('reset','invitation')),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS password_reset_tokens;
    DROP TABLE IF EXISTS email_log;
  `);
};
