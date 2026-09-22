'use strict';

/**
 * tx_hash y nonce en vote_attempts, para poder distinguir una transacción
 * revertida o reemplazada de una simplemente no encontrada todavía.
 *
 * ── Por qué hacía falta ─────────────────────────────────────────────────────
 *
 * findVote() buscaba el voto por nullifier_hash, vía el evento VoteCast. Una
 * transacción revertida o reemplazada NUNCA emite ese evento, así que la
 * búsqueda por nullifier siempre daba "no-esta" — indistinguible de "todavía
 * no se ha minado". cleanupStaleVoteAttempts() ya sabía tratar 'revertido' y
 * 'reemplazado' de forma distinta (falla el intento, libera el cerrojo), pero
 * findVote() nunca podía producir esos estados: le faltaba el dato necesario
 * para mirar la transacción CONCRETA en vez de solo el evento.
 *
 * Con tx_hash se puede pedir su recibo directamente (status 0 = revertida).
 * Con nonce se puede comprobar si ese hueco de nonce ya lo consumió otra
 * transacción aunque la original nunca llegara a minarse (reemplazada).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */

exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE vote_attempts
      ADD COLUMN IF NOT EXISTS tx_hash TEXT DEFAULT NULL;
  `);
  pgm.sql(`
    ALTER TABLE vote_attempts
      ADD COLUMN IF NOT EXISTS nonce INTEGER DEFAULT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    ALTER TABLE vote_attempts
      DROP COLUMN IF EXISTS tx_hash;
  `);
  pgm.sql(`
    ALTER TABLE vote_attempts
      DROP COLUMN IF EXISTS nonce;
  `);
};
