'use strict';

/**
 * Sal efímera por elección para derivación de nullifiers y privacidad hacia adelante.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 *
 * El nullifier se derivaba con HMAC(userId + electionId, NULLIFIER_SECRET).
 * Esto hacía que el nullifier fuera determinista y calculable en cualquier
 * momento mientras se conociera NULLIFIER_SECRET.
 *
 * Con `ephemeral_salt`, cada elección dispone de una sal aleatoria de 32 bytes
 * (256 bits). La derivación pasa a ser:
 *   HMAC(userId + ":" + electionId + ":" + ephemeral_salt + ":vtb-voter", NULLIFIER_SECRET)
 *
 * Durante la votación, el nullifier se deriva con la sal (ver utils/auth.ts,
 * routes/elections.ts). Una vez cerrada la elección y reconciliados todos los
 * intentos pendientes (COUNT(pending_attempts) = 0), la sal se destruye (se
 * pone a NULL) — ver services/electionSalt.ts.
 *
 * OJO: esto NO anonimiza el voto. nullifier_audit sigue guardando user_id,
 * election_id y vote_choice en la misma fila, sin plazo de borrado, con o sin
 * sal. Lo único que la sal impide, una vez destruida, es recalcular desde cero
 * el nullifier de un votante para esa elección; no borra la correspondencia
 * que la base ya tiene escrita. La separación de esa relación (sacar el
 * user_id de la fila del voto) es trabajo pendiente, no algo que esta
 * migración resuelva.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */

exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE elections
      ADD COLUMN IF NOT EXISTS ephemeral_salt TEXT DEFAULT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    ALTER TABLE elections
      DROP COLUMN IF EXISTS ephemeral_salt;
  `);
};
