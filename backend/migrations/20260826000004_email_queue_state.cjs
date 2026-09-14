'use strict';

/**
 * Cola de emails con estado en base de datos (HIGH-1).
 *
 * Sustituye el doble mecanismo de reintento (setTimeout en memoria + job de
 * 5 min sobre la misma tabla), que reenviaba correos ya en vuelo.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE email_log ADD COLUMN IF NOT EXISTS next_retry_at   TIMESTAMPTZ;
    ALTER TABLE email_log ADD COLUMN IF NOT EXISTS claimed_at      TIMESTAMPTZ;
    ALTER TABLE email_log ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
  `);

  // La restricción original solo admitía queued/sent/failed/skipped.
  // La máquina de estados nueva añade 'sending' y 'dead'.
  pgm.sql(`
    ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_status_check;
    ALTER TABLE email_log ADD CONSTRAINT email_log_status_check
      CHECK (status IN ('queued','sending','sent','failed','dead','skipped'));
  `);

  // Reconciliación: 'failed' dejó de ser un estado de espera.
  pgm.sql(`
    UPDATE email_log SET status = 'queued' WHERE status = 'failed' AND attempts < 5;
    UPDATE email_log SET status = 'dead'   WHERE status = 'failed' AND attempts >= 5;
    UPDATE email_log SET next_retry_at = NOW()
      WHERE status = 'queued' AND next_retry_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_email_log_pending
      ON email_log (status, next_retry_at)
      WHERE status = 'queued';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_email_log_pending;`);
  pgm.sql(`
    UPDATE email_log SET status = 'failed' WHERE status IN ('sending','dead');
    ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_status_check;
    ALTER TABLE email_log ADD CONSTRAINT email_log_status_check
      CHECK (status IN ('queued','sent','failed','skipped'));
  `);
  pgm.sql(`
    ALTER TABLE email_log DROP COLUMN IF EXISTS idempotency_key;
    ALTER TABLE email_log DROP COLUMN IF EXISTS claimed_at;
    ALTER TABLE email_log DROP COLUMN IF EXISTS next_retry_at;
  `);
};
