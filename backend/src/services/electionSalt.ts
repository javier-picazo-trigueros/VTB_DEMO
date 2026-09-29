import type { DbClient } from '../db/client.js';

/**
 * Destruye la sal efímera de una elección si y solo si:
 * 1. La elección está cerrada (no activa o ha superado su hora de finalización).
 * 2. Todos los intentos pendientes en vote_attempts han sido resueltos (COUNT == 0).
 *
 * Una vez destruida (puesta a NULL), el nullifier de esa elección deja de poder
 * recalcularse desde cero — ni con NULLIFIER_SECRET basta, porque falta la sal.
 *
 * Desde SCRUM-17 (migración 016), `nullifier_audit` ya no guarda `user_id`: la
 * persona vive en `election_participations`, sin nullifier, candidato ni
 * transacción. Con la sal destruida, ninguna fila de la base une a una persona
 * con su voto. Lo que sigue sin cubrirse está en SEGURIDAD.md: durante la
 * votación el servidor puede calcular cualquier nullifier, `vote_attempts` une
 * usuario y nullifier mientras un voto está pendiente, y las copias de
 * seguridad anteriores a la migración conservan el vínculo.
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
