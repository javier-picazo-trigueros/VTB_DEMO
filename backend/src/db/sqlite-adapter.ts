/**
 * SqliteAdapter — envuelve la clase Database existente (SQLite)
 * e implementa la interfaz DbClient para compatibilidad con el nuevo sistema.
 *
 * acquireVoteLock: comportamiento legacy (SELECT check).
 *   La race condition TOCTOU sigue presente, pero SQLite es single-writer
 *   y la probabilidad real en este contexto es baja.
 * releaseVoteLock: no-op (SQLite no tiene la tabla vote_attempts).
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
