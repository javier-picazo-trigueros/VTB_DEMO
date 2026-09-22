import type { DbClient } from '../db/client.js';

/**
 * Destruye la sal efímera de una elección si y solo si:
 * 1. La elección está cerrada (no activa o ha superado su hora de finalización).
 * 2. Todos los intentos pendientes en vote_attempts han sido resueltos (COUNT == 0).
 *
 * Una vez destruida (puesta a NULL), el nullifier de esa elección deja de poder
 * recalcularse desde cero — ni con NULLIFIER_SECRET basta, porque falta la sal.
 *
 * OJO — esto NO anonimiza el voto ni desvincula votante y voto ya emitidos:
 * `nullifier_audit` sigue guardando `user_id`, `election_id` y `vote_choice` en la
 * misma fila, sin plazo de borrado, con o sin sal. La sal solo cierra la puerta a
 * que alguien recalcule el nullifier de fuera hacia dentro tras el cierre; no borra
 * la correspondencia que la base ya tiene escrita. Esa separación (mover el
 * `user_id` fuera de la fila del voto) es trabajo pendiente, no algo que esta
 * función resuelva.
 *
 * @returns true si la sal fue destruida en esta llamada, false si no se pudo destruir.
 */
export async function destroyElectionSaltIfComplete(
  electionId: number,
  db: DbClient,
): Promise<boolean> {
  const election = await db.get<{
    id: number;
    end_time: number;
    is_active: number | boolean;
    ephemeral_salt: string | null;
  }>(
    'SELECT id, end_time, is_active, ephemeral_salt FROM elections WHERE id = ?',
    [electionId],
  );

  if (!election || election.ephemeral_salt === null) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const isActive = Boolean(election.is_active);
  const isClosed = !isActive || (election.end_time != null && now > election.end_time);

  if (!isClosed) {
    return false;
  }

  // Verificar si quedan intentos pendientes de resolución o reconciliación
  const pending = await db.get<{ c: number }>(
    "SELECT COUNT(*) as c FROM vote_attempts WHERE election_id = ? AND status = 'pending'",
    [electionId],
  );

  if ((pending?.c ?? 0) > 0) {
    return false;
  }

  // Destruir la sal de forma irreversible
  await db.exec(
    'UPDATE elections SET ephemeral_salt = NULL WHERE id = ?',
    [electionId],
  );

  return true;
}

/**
 * Recorre todas las elecciones con sal todavía viva e intenta destruirla en cada
 * una. Pensada para un job periódico (ver index.ts): una elección cerrada con un
 * voto atascado en 'pending' se reintenta sola en la siguiente pasada, sin que
 * haga falta ningún cierre/certificación manual explícitos — hoy no existen como
 * acción de administrador, la elección se considera cerrada por end_time/is_active.
 *
 * @returns cuántas elecciones tuvieron su sal destruida en esta pasada.
 */
export async function destroyExpiredElectionSalts(db: DbClient): Promise<number> {
  const candidatas = await db.run<{ id: number }>(
    'SELECT id FROM elections WHERE ephemeral_salt IS NOT NULL',
  );

  let destruidas = 0;
  for (const { id } of candidatas) {
    if (await destroyElectionSaltIfComplete(id, db)) destruidas++;
  }
  return destruidas;
}
