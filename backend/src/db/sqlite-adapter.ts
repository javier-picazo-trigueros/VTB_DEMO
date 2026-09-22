/**
 * SqliteAdapter — envuelve la clase Database existente (SQLite)
 * e implementa la interfaz DbClient para compatibilidad con el nuevo sistema.
 *
 * acquireVoteLock / releaseVoteLock / hasPendingVoteLock: persisten en la
 * tabla vote_attempts, igual que PgClient (ver postgres.ts) — misma UPSERT
 * condicionada a status='failed', mismo DELETE al confirmar. SQLite ≥3.35
 * soporta ON CONFLICT ... DO UPDATE ... WHERE (aquí corre 3.52), así que el
 * chequeo es una única sentencia atómica, sin el hueco TOCTOU que tenía el
 * Set en memoria de antes.
 * transaction: BEGIN/COMMIT/ROLLBACK reales, serializados. Ver más abajo.
 */
import type { Database } from '../config/database.js';
import type { DbClient, ExecResult } from './client.js';
import { VoteConflictError } from './client.js';

export class SqliteAdapter implements DbClient {
  /**
   * Cola de transacciones.
   *
   * node-sqlite3 usa UNA sola conexión, y SQLite no admite transacciones
   * anidadas sobre ella: un segundo BEGIN da "cannot start a transaction within
   * a transaction". Como el backend atiende peticiones concurrentes, dos
   * importaciones de censo a la vez se pisarían.
   *
   * Esta cadena de promesas serializa las transacciones: la segunda espera a que
   * termine la primera. Es un cuello de botella asumido — en SQLite la escritura
   * ya era de un solo escritor — y solo afecta a los bloques transaccionales, no
   * a las consultas sueltas.
   */
  private txQueue: Promise<unknown> = Promise.resolve();

  /** Profundidad actual, para que una transacción anidada reutilice la de fuera. */
  private txDepth = 0;

  constructor(private db: Database) {}

  run<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.run<T>(sql, params as any[]);
  }

  get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.get<T>(sql, params as any[]);
  }

  exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
    return this.db.exec(sql, params as any[]).then(({ lastID, changes }) => ({
      lastID,
      changes,
    }));
  }

  async acquireVoteLock(
    userId: number,
    electionId: number,
    nullifierHash: string,
    candidateId: number | null,
  ): Promise<void> {
    // Comprobación previa al voto en cadena (pre-blockchain check), igual que antes.
    const existing = await this.db.get<{ id: number }>(
      'SELECT id FROM nullifier_audit WHERE user_id = ? AND election_id = ?',
      [userId, electionId],
    );
    if (existing) throw new VoteConflictError('Ya has votado en esta elección');

    // Misma UPSERT atómica que PgClient.acquireVoteLock: solo toma el cerrojo si
    // no hay fila (primer intento) o la fila existente está 'failed'. Si está
    // 'pending' o 'confirmed', la cláusula WHERE bloquea el UPDATE y changes=0.
    const res = await this.db.exec(
      `INSERT INTO vote_attempts (user_id, election_id, status, nullifier_hash, candidate_id)
       VALUES (?, ?, 'pending', ?, ?)
       ON CONFLICT(user_id, election_id) DO UPDATE SET
         status         = 'pending',
         started_at     = CURRENT_TIMESTAMP,
         nullifier_hash = excluded.nullifier_hash,
         candidate_id   = excluded.candidate_id,
         completed_at   = NULL,
         error_detail   = NULL
       WHERE vote_attempts.status = 'failed'`,
      [userId, electionId, nullifierHash, candidateId],
    );
    if (res.changes === 0) throw new VoteConflictError('Ya has votado o hay un voto en curso');
  }

  async releaseVoteLock(
    userId: number,
    electionId: number,
    status: 'confirmed' | 'failed',
    errorDetail?: string,
  ): Promise<void> {
    if (status === 'confirmed') {
      // Igual que PgClient: al confirmarse, se borra la fila en vez de dejarla
      // 'confirmed' — no hay razón para retener la relación user_id/candidate_id
      // en vote_attempts una vez el voto ya está en nullifier_audit.
      await this.db.exec(
        'DELETE FROM vote_attempts WHERE user_id = ? AND election_id = ?',
        [userId, electionId],
      );
    } else {
      await this.db.exec(
        `UPDATE vote_attempts
         SET status = ?, completed_at = CURRENT_TIMESTAMP, error_detail = ?
         WHERE user_id = ? AND election_id = ?`,
        [status, errorDetail ?? null, userId, electionId],
      );
    }
  }

  async hasPendingVoteLock(userId: number, electionId: number): Promise<boolean> {
    const row = await this.db.get<{ id: number }>(
      "SELECT id FROM vote_attempts WHERE user_id = ? AND election_id = ? AND status = 'pending'",
      [userId, electionId],
    );
    return !!row;
  }

  async recordPendingTx(
    userId: number,
    electionId: number,
    txHash: string,
    nonce: number | null,
  ): Promise<void> {
    await this.db.exec(
      'UPDATE vote_attempts SET tx_hash = ?, nonce = ? WHERE user_id = ? AND election_id = ?',
      [txHash, nonce, userId, electionId],
    );
  }

  /**
   * Transacción real sobre la única conexión de SQLite.
   *
   * Antes esto era `return fn(this)` — un no-op con el comentario "las
   * operaciones son atómicas de facto". No lo eran: si el callback fallaba a la
   * mitad, lo ya escrito se quedaba escrito. Eso es justo lo que no puede pasar
   * al importar un censo.
   *
   * `this` ES el cliente de la transacción, porque en SQLite solo hay una
   * conexión y todas las consultas van por ella. En PostgreSQL no es así, y por
   * eso PgClient entrega un PgTransactionClient distinto.
   *
   * BEGIN IMMEDIATE (y no BEGIN a secas) toma el cerrojo de escritura al entrar,
   * en vez de al primer INSERT. Evita que dos transacciones que empiezan leyendo
   * choquen con SQLITE_BUSY a mitad de camino.
   */
  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    // Anidada: reutiliza la de fuera. SQLite no admite BEGIN dentro de BEGIN, y
    // abrir una nueva rompería la atomicidad de la exterior.
    if (this.txDepth > 0) return fn(this);

    const run = async (): Promise<T> => {
      await this.db.exec('BEGIN IMMEDIATE');
      this.txDepth++;
      try {
        const result = await fn(this);
        await this.db.exec('COMMIT');
        return result;
      } catch (err) {
        // Si el ROLLBACK falla no se puede hacer nada útil, pero el error que
        // debe propagarse es el original, no el del rollback.
        await this.db.exec('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        this.txDepth--;
      }
    };

    // Encola: la siguiente transacción espera a esta, falle o no.
    const queued = this.txQueue.then(run, run);
    this.txQueue = queued.catch(() => undefined);
    return queued;
  }

  close(): Promise<void> {
    return this.db.close();
  }
}
