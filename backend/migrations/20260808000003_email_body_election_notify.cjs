'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  // Almacenar cuerpo del email para poder reintentar tras reinicio de servidor
  pgm.sql(`
    ALTER TABLE email_log ADD COLUMN IF NOT EXISTS html_body TEXT;
    ALTER TABLE email_log ADD COLUMN IF NOT EXISTS text_body TEXT;
  `);

  // Tracking de notificaciones masivas de elección
  pgm.sql(`
    ALTER TABLE elections ADD COLUMN IF NOT EXISTS notify_open_sent_at  TIMESTAMPTZ;
    ALTER TABLE elections ADD COLUMN IF NOT EXISTS notify_close_sent_at TIMESTAMPTZ;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    ALTER TABLE elections DROP COLUMN IF EXISTS notify_close_sent_at;
    ALTER TABLE elections DROP COLUMN IF EXISTS notify_open_sent_at;
    ALTER TABLE email_log DROP COLUMN IF EXISTS text_body;
    ALTER TABLE email_log DROP COLUMN IF EXISTS html_body;
  `);
};
