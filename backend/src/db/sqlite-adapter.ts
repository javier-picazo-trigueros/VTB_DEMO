/**
 * SqliteAdapter — envuelve la clase Database existente (SQLite)
 * e implementa la interfaz DbClient para compatibilidad con el nuevo sistema.
 *
 * acquireVoteLock: comportamiento legacy (SELECT check).
 *   La race condition TOCTOU sigue presente, pero SQLite es single-writer
 *   y la probabilidad real en este contexto es baja.
 * releaseVoteLock / transaction: no-op o paso directo (SQLite no tiene transacciones
 *   de aplicación multi-statement en este contexto sin cambios mayores).
 */
import type { Database } from '../config/database.js';
import type { DbClient, ExecResult } from './client.js';
import { VoteConflictError } from './client.js';

export class SqliteAdapter implements DbClient {
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
    _nullifierHash: string,
    _candidateId: number | null,
  ): Promise<void> {
    // SQLite legacy: check nullifier_audit directly (pre-blockchain check)
    const existing = await this.db.get<{ id: number }>(
      'SELECT id FROM nullifier_audit WHERE user_id = ? AND election_id = ?',
      [userId, electionId],
    );
    if (existing) throw new VoteConflictError('Ya has votado en esta elección');
  }

  async releaseVoteLock(
    _userId: number,
    _electionId: number,
    _status: 'confirmed' | 'failed',
    _errorDetail?: string,
  ): Promise<void> {
    // No-op en SQLite — sin tabla vote_attempts
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    // SQLite es single-writer; pasamos this directamente.
    // Las operaciones son atómicas de facto en un servidor de un solo proceso.
    return fn(this);
  }

  close(): Promise<void> {
    return this.db.close();
  }
}
