'use strict';

/**
 * anonymized_at marca cuándo se anonimizó una cuenta dada de baja, para que
 * el job de retención (services/retention.ts) sea idempotente: solo procesa
 * deleted_at antiguos con anonymized_at todavía NULL.
 *
 * No se toca nullifier_audit — sigue sin plazo de conservación, a propósito
 * (ver SEGURIDAD.md y la Política de Privacidad, sección 6: es un hueco de
 * cumplimiento real, no algo que esta migración resuelva).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ DEFAULT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS anonymized_at;`);
};
