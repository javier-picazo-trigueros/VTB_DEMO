'use strict';

/**
 * Estado de sincronización de cada elección con el contrato ElectionRegistry.
 *
 * ── Qué pasaba ──────────────────────────────────────────────────────────────
 *
 * 1. POST /admin/elections esperaba a que Sepolia confirmara la transacción
 *    (12-40 s) antes de responder. El frontend corta a los 15 s: la elección
 *    quedaba creada, sin candidatos, y el administrador veía un error.
 *
 * 2. La sincronización (syncElections.ts) renumeraba election_id_blockchain
 *    como 1..N en el orden de la base y daba por hecho que la elección i de la
 *    base era la elección i del contrato. No lo era: comprobado el 16-sep-2026
 *    en Supabase, las elecciones #1-#5 del contrato son otras ("Delegado
 *    Ingeniería Informatica 2026/27", "Fecha para el Día de la Paella"...). Un
 *    voto de una cuenta real se habría registrado en la elección equivocada.
 *
 * ── Qué cambia ──────────────────────────────────────────────────────────────
 *
 * Cada elección lleva su propio estado:
 *
 *   pending → creada en la base, aún no en el contrato
 *   syncing → un proceso la ha reclamado y está enviando / confirmando
 *   synced  → en el contrato; election_id_blockchain es el id del evento
 *             ElectionCreated de su transacción
 *   failed  → agotó los reintentos; se reintenta a mano desde el panel
 *
 * Solo con 'synced' se usa election_id_blockchain para votar o leer la cadena.
 *
 * ── Por qué las existentes quedan en 'pending' ─────────────────────────────
 *
 * Su election_id_blockchain salió de la renumeración, así que no hay forma de
 * saber desde la base si apunta a su elección del contrato (en Supabase, se ha
 * comprobado que no). 'pending' hace que la sincronización las cree de nuevo
 * con el id correcto. El coste es una transacción por elección la primera vez;
 * los votos ya emitidos no se tocan (los resultados salen de nullifier_audit).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */

exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE elections
      ADD COLUMN IF NOT EXISTS chain_status        TEXT        NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS chain_tx_hash       TEXT,
      ADD COLUMN IF NOT EXISTS chain_error         TEXT,
      ADD COLUMN IF NOT EXISTS chain_attempts      INTEGER     NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS chain_next_retry_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS chain_claimed_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS chain_synced_at     TIMESTAMPTZ;
  `);

  pgm.sql(`
    ALTER TABLE elections DROP CONSTRAINT IF EXISTS elections_chain_status_check;
    ALTER TABLE elections ADD CONSTRAINT elections_chain_status_check
      CHECK (chain_status IN ('pending', 'syncing', 'synced', 'failed'));
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_elections_chain_pending
      ON elections (chain_status, chain_next_retry_at)
      WHERE chain_status IN ('pending', 'syncing', 'failed');
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_elections_chain_pending;
    ALTER TABLE elections DROP CONSTRAINT IF EXISTS elections_chain_status_check;
    ALTER TABLE elections
      DROP COLUMN IF EXISTS chain_synced_at,
      DROP COLUMN IF EXISTS chain_claimed_at,
      DROP COLUMN IF EXISTS chain_next_retry_at,
      DROP COLUMN IF EXISTS chain_attempts,
      DROP COLUMN IF EXISTS chain_error,
      DROP COLUMN IF EXISTS chain_tx_hash,
      DROP COLUMN IF EXISTS chain_status;
  `);
};
