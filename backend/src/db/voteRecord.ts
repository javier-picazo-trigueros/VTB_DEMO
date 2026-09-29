import { randomUUID } from 'node:crypto';
import type { DbClient } from './client.js';

export interface ConfirmedVote {
  userId: number;
  electionId: number;
  nullifierHash: string;
  candidateId: number | null;
  txHash: string | null;
  blockNumber: number | null;
  voteSource: 'chain' | 'demo' | 'legacy';
}

/**
 * Confirma un voto en la base (SCRUM-17). Es el ÚNICO sitio que escribe en
 * election_participations y nullifier_audit, y lo hace en una sola transacción:
 * el voto normal, el de demostración y la reconciliación pasan por aquí.
 *
 *   1. borra la fila de vote_attempts (guarda usuario y nullifier);
 *   2. inserta la participación (election_id, user_id): sin hora ni id;
 *   3. inserta el voto: sin user_id, con id aleatorio y hora truncada al minuto
 *      por defecto de la columna.
 *
 * Las tres o ninguna. Un id autoincremental, o insertar en dos transacciones,
 * permitiría emparejar la participación con el voto por orden.
 *
 * Devuelve 'ya-participaba' si esa persona ya tenía participación en la
 * elección (la clave primaria lo impide): no se escribe el voto.
 */
export async function recordConfirmedVote(
  db: DbClient,
  v: ConfirmedVote,
): Promise<'registrado' | 'ya-participaba'> {
  return db.transaction(async (tx) => {
    await tx.exec('DELETE FROM vote_attempts WHERE user_id = ? AND election_id = ?', [
      v.userId,
      v.electionId,
    ]);

    const participacion = await tx.exec(
      `INSERT INTO election_participations (election_id, user_id)
       VALUES (?, ?) ON CONFLICT (election_id, user_id) DO NOTHING`,
      [v.electionId, v.userId],
    );
    if (participacion.changes === 0) return 'ya-participaba' as const;

    await tx.exec(
      `INSERT INTO nullifier_audit
         (id, election_id, nullifier_hash, tx_hash, block_number, candidate_id, vote_source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        v.electionId,
        v.nullifierHash,
        v.txHash,
        v.blockNumber,
        v.candidateId,
        v.voteSource,
      ],
    );
    return 'registrado' as const;
  });
}

/** ¿Ha participado ya esta persona en esta elección? */
export async function hasParticipated(
  db: Pick<DbClient, 'get'>,
  userId: number,
  electionId: number,
): Promise<boolean> {
  const fila = await db.get<{ ya: number }>(
    'SELECT 1 AS ya FROM election_participations WHERE user_id = ? AND election_id = ?',
    [userId, electionId],
  );
  return Boolean(fila);
}
