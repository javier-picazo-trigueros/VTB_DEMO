/**
 * DbClient — abstracción sobre el motor de BD.
 *
 * Ambas implementaciones (SqliteAdapter y PgClient) exponen esta interfaz,
 * lo que permite cambiar de motor sin tocar las rutas.
 *
 * Nomenclatura intencionalmente igual a la clase Database de SQLite existente
 * para minimizar el diff en las rutas al hacer el switch.
 */
export interface ExecResult {
  lastID: number;
  changes: number;
}

export interface DbClient {
  /** SELECT que devuelve múltiples filas */
  run<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /** SELECT que devuelve una sola fila (o undefined) */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /** INSERT / UPDATE / DELETE */
  exec(sql: string, params?: unknown[]): Promise<ExecResult>;

  /**
   * Adquiere el cerrojo de voto atómico ANTES de llamar a la blockchain.
   *
   * - Si no hay intento previo: INSERT status='pending'
   * - Si el intento previo tiene status='failed': UPDATE a 'pending' (reintento permitido)
   * - Si el intento es 'pending' o 'confirmed': lanza VoteConflictError
   *
   * En SQLite (single-writer) hace el SELECT legacy para compatibilidad.
   */
  acquireVoteLock(
    userId: number,
    electionId: number,
    nullifierHash: string,
    candidateId: number | null,
  ): Promise<void>;

  /**
   * Marca el intento de voto como 'confirmed' o 'failed' tras la respuesta de blockchain.
   * No-op en SQLite.
   */
  releaseVoteLock(
    userId: number,
    electionId: number,
    status: 'confirmed' | 'failed',
    errorDetail?: string,
  ): Promise<void>;

  /** Ejecuta varias operaciones en una sola transacción atómica. No-op tx en SQLite. */
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;

  close(): Promise<void>;
}

/** Error lanzado por acquireVoteLock cuando ya existe un intento activo */
export class VoteConflictError extends Error {
  readonly code = 'VOTE_CONFLICT';
  constructor(message = 'Ya tienes un intento de voto activo o confirmado') {
    super(message);
    this.name = 'VoteConflictError';
  }
}
