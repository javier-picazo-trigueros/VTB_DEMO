'use strict';

/**
 * El registro público confirma el email antes de crear o aprobar nada
 * (SCRUM-123).
 *
 * Antes, una solicitud cuyo email estuviera en email_whitelist creaba la
 * cuenta aprobada en el acto, con la contraseña que eligiera quien rellenaba
 * el formulario. Nadie comprobaba que el correo fuera suyo: a los 30 días de
 * anonimizar una baja, cualquiera podía registrar ese email y quedar en el
 * censo en su lugar.
 *
 * Ahora la solicitud nace 'unverified' y solo avanza cuando se abre el enlace
 * que llega a ese buzón:
 *
 *   unverified ──(enlace)──▶ aprobada al momento si está en la lista blanca
 *                         └▶ 'pending', para que la revise un administrador
 *
 * Del enlace solo se guarda el hash (verify_token_hash), igual que en
 * password_reset_tokens, y se genera al enviar el correo, no al encolarlo
 * (P1-7). No se usa password_reset_tokens porque su user_id es obligatorio y
 * aquí todavía no hay usuario.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE registration_requests
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS verify_token_hash TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS verify_expires_at TIMESTAMPTZ DEFAULT NULL;

    ALTER TABLE registration_requests DROP CONSTRAINT IF EXISTS registration_requests_status_check;
    ALTER TABLE registration_requests ADD CONSTRAINT registration_requests_status_check
      CHECK (status IN ('unverified', 'pending', 'approved', 'rejected'));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_requests_verify_token
      ON registration_requests (verify_token_hash)
      WHERE verify_token_hash IS NOT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  // Las solicitudes sin confirmar no caben en el CHECK anterior. Son, por
  // definición, de alguien que no ha demostrado nada todavía: se descartan.
  pgm.sql(`
    DELETE FROM registration_requests WHERE status = 'unverified';

    DROP INDEX IF EXISTS idx_registration_requests_verify_token;

    ALTER TABLE registration_requests DROP CONSTRAINT IF EXISTS registration_requests_status_check;
    ALTER TABLE registration_requests ADD CONSTRAINT registration_requests_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));

    ALTER TABLE registration_requests
      DROP COLUMN IF EXISTS verify_expires_at,
      DROP COLUMN IF EXISTS verify_token_hash,
      DROP COLUMN IF EXISTS email_verified_at;
  `);
};
