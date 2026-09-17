import pg from 'pg';
import type { DbClient, ExecResult } from './client.js';
import { VoteConflictError } from './client.js';
import type { BusquedaDeVoto } from '../services/voteChain.js';

const { Pool } = pg;

// ── Marshalling de tipos numéricos ──────────────────────────────────────────
//
// node-postgres devuelve BIGINT (int8) y NUMERIC como **cadenas**, no como
// números. Lo hace a propósito: un int8 puede superar Number.MAX_SAFE_INTEGER
// (2^53) y convertirlo perdería precisión sin avisar.
//
// Para este proyecto esa decisión es la equivocada, y rompía cosas de verdad.
// Todas las claves primarias del esquema son `BIGINT GENERATED ALWAYS AS
// IDENTITY`, y `COUNT(*)`, `MAX()` y `SUM()` también devuelven int8. Con SQLite
// todo eso llegaba como number, así que el código lo trata como number:
//
//   const election_id_blockchain = (lastElection?.id || 0) + 1;
//
// Sobre PostgreSQL sin esto, `lastElection.id` es "19" y la expresión da "191"
// — concatenación de cadenas, no suma. Verificado en vivo: la elección creada
// se quedaba con election_id_blockchain 191. Y lo mismo afecta a los `id` que
// salen en las respuestas JSON de la API, a los recuentos del panel y a
// start_time / end_time / block_number.
//
// Los valores que maneja VTB están varios órdenes de magnitud por debajo del
// límite: ids de fila, recuentos de censo, epoch en segundos (~1,8e9) y números
// de bloque de Ethereum (~2e7). El techo de 2^53 son 9e15. No hay riesgo real
// de perder precisión, y a cambio el comportamiento vuelve a ser idéntico al de
// SQLite, que es lo que toda la capa DbClient promete.
//
// Se registra a nivel de módulo: afecta a cualquier consulta hecha con `pg`
// desde este proceso, incluidas las del pool y las de las transacciones.
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convierte placeholders SQLite ? a PostgreSQL $1, $2, … */
export function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Tablas cuya clave primaria es compuesta y que, por tanto, NO tienen columna `id`.
 *
 * Importa porque `normalizeSql` añade `RETURNING id` a todo INSERT para poder
 * rellenar `lastID`. Sobre una de estas tablas, ese RETURNING hace fallar la
 * consulta entera con `column "id" does not exist`. En SQLite no se notaba: la
 * tabla tiene rowid implícito y `lastID` salía igual.
 *
 * `election_voters` es la que rompía: PRIMARY KEY (election_id, user_id), y es la
 * tabla sobre la que se asigna a cada persona a un censo — 13 llamadas en admin,
 * registration y el seed.
 *
 * Si se añade otra tabla con clave compuesta, va aquí.
 */
const TABLES_WITHOUT_ID = new Set(['election_voters']);

/** Extrae el nombre de la tabla de un INSERT, o null si no se reconoce. */
function insertTarget(sql: string): string | null {
  const m = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([a-z_][a-z0-9_]*)/i.exec(sql);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Normaliza SQL SQLite→PG:
 *   INSERT OR IGNORE INTO …  →  INSERT INTO … ON CONFLICT DO NOTHING
 *
 * Para INSERTs añade RETURNING id para obtener lastID, salvo en las tablas sin
 * columna `id` (ver TABLES_WITHOUT_ID). En esas, `exec` devuelve lastID = 0, que
 * es lo que ya devolvía el adaptador de SQLite para estas mismas llamadas: ningún
 * sitio del código usa el lastID de un INSERT en election_voters.
 *
 * El RETURNING viene DESPUÉS del ON CONFLICT, que es el orden correcto en PG.
 */
export function normalizeSql(raw: string): string {
  const trimmed = raw.trim();
  const target = insertTarget(trimmed);
  const returning = target && TABLES_WITHOUT_ID.has(target) ? '' : ' RETURNING id';

  if (/^INSERT\s+OR\s+IGNORE\s+/i.test(trimmed)) {
    const base = trimmed.replace(/^INSERT\s+OR\s+IGNORE\s+/i, 'INSERT ');
    return toPositional(base).replace(/;?\s*$/, ` ON CONFLICT DO NOTHING${returning}`);
  }

  if (/^\s*INSERT\s/i.test(trimmed)) {
    return toPositional(trimmed).replace(/;?\s*$/, returning);
  }

  return toPositional(trimmed);
}

// ── PgTransactionClient ─────────────────────────────────────────────────────
// Envuelve un PoolClient ya en transacción.
// Se pasa al callback de transaction() para que todas sus queries
// vayan por la misma conexión y queden dentro del BEGIN/COMMIT.

class PgTransactionClient implements DbClient {
  constructor(private client: pg.PoolClient) {}

  async run<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client.query(toPositional(sql), params);
    return res.rows as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.run<T>(sql, params))[0];
  }

  async exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
    const pgSql = normalizeSql(sql);
    const res = await this.client.query(pgSql, params);
    return { lastID: res.rows[0]?.id ?? 0, changes: res.rowCount ?? 0 };
  }

  async acquireVoteLock(
    userId: number,
    electionId: number,
    nullifierHash: string,
    candidateId: number | null,
  ): Promise<void> {
    const res = await this.client.query(
      `INSERT INTO vote_attempts (user_id, election_id, status, nullifier_hash, candidate_id)
       VALUES ($1, $2, 'pending', $3, $4)
       ON CONFLICT (user_id, election_id) DO UPDATE
         SET status        = 'pending',
             started_at    = NOW(),
             nullifier_hash = EXCLUDED.nullifier_hash,
             candidate_id  = EXCLUDED.candidate_id,
             completed_at  = NULL,
             error_detail  = NULL
         WHERE vote_attempts.status = 'failed'`,
      [userId, electionId, nullifierHash, candidateId],
    );
    if ((res.rowCount ?? 0) === 0) throw new VoteConflictError();
  }

  async releaseVoteLock(
    userId: number,
    electionId: number,
    status: 'confirmed' | 'failed',
    errorDetail?: string,
  ): Promise<void> {
    await this.client.query(
      `UPDATE vote_attempts
       SET status = $3, completed_at = NOW(), error_detail = $4
       WHERE user_id = $1 AND election_id = $2`,
      [userId, electionId, status, errorDetail ?? null],
    );
  }

  // Las operaciones dentro de un callback de transaction() ya están en la tx.
  // Anidar transacciones no está soportado; ejecutamos el fn directamente.
  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async close(): Promise<void> {
    // No hacer nada: el PoolClient lo gestiona PgClient.transaction()
  }
}

// ── PgClient ────────────────────────────────────────────────────────────────

/** Lo que devuelve una consulta. Solo lo que esta capa mira de un QueryResult. */
export interface ResultadoConsulta {
  rows: unknown[];
  rowCount: number | null;
}

/**
 * Lo único que PgClient usa de un Pool de `pg`.
 *
 * Existe para poder inyectar un doble en los tests. Sin esto, PgClient creaba su
 * propio Pool en el constructor y su código no se podía ejecutar sin una base de
 * PostgreSQL delante — y los tests de este proyecto corren sobre SQLite en
 * memoria, por una razón que no se negocia: una ejecución contra Supabase llegó
 * a sobrescribir las contraseñas de administración.
 *
 * La consecuencia era que cleanupStaleVoteAttempts, que decide si un voto se da
 * por perdido, no tenía ni un test. Ahora sí lo tiene, sobre este mismo código.
 */
export interface PoolLike {
  query(text: string, values?: unknown[]): Promise<ResultadoConsulta>;
  connect(): Promise<pg.PoolClient>;
  end(): Promise<void>;
}

export class PgClient implements DbClient {
  private pool: PoolLike;

  /**
   * @param pool Solo para tests: sustituye el pool real. En producción se omite
   *        y se construye contra `connectionString`.
   */
  constructor(connectionString: string, pool?: PoolLike) {
    this.pool = pool ?? new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }

  async run<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(toPositional(sql), params);
    return res.rows as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.run<T>(sql, params))[0];
  }

  async exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
    const pgSql = normalizeSql(sql);
    const res = await this.pool.query(pgSql, params);
    // PoolLike tipa rows como unknown[]: el RETURNING id que añade normalizeSql
    // devuelve una fila con esa única columna.
    const fila = res.rows[0] as { id?: number } | undefined;
    return { lastID: fila?.id ?? 0, changes: res.rowCount ?? 0 };
  }

  async acquireVoteLock(
    userId: number,
    electionId: number,
    nullifierHash: string,
    candidateId: number | null,
  ): Promise<void> {
    const res = await this.pool.query(
      `INSERT INTO vote_attempts (user_id, election_id, status, nullifier_hash, candidate_id)
       VALUES ($1, $2, 'pending', $3, $4)
       ON CONFLICT (user_id, election_id) DO UPDATE
         SET status         = 'pending',
             started_at     = NOW(),
             nullifier_hash = EXCLUDED.nullifier_hash,
             candidate_id   = EXCLUDED.candidate_id,
             completed_at   = NULL,
             error_detail   = NULL
         WHERE vote_attempts.status = 'failed'`,
      [userId, electionId, nullifierHash, candidateId],
    );
    if ((res.rowCount ?? 0) === 0) throw new VoteConflictError();
  }

  async releaseVoteLock(
    userId: number,
    electionId: number,
    status: 'confirmed' | 'failed',
    errorDetail?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE vote_attempts
       SET status = $3, completed_at = NOW(), error_detail = $4
       WHERE user_id = $1 AND election_id = $2`,
      [userId, electionId, status, errorDetail ?? null],
    );
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient = new PgTransactionClient(client);
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Job de limpieza de intentos de voto huérfanos.
   * Llámalo desde index.ts con setInterval cada 30 minutos.
   *
   * Para cada intento 'pending' con más de 30 min de antigüedad se pregunta a la
   * cadena por su nullifier, y se actúa según lo que conteste:
   *
   *   'encontrado'    → reconstruye la fila de nullifier_audit con los datos del
   *                     evento VoteCast y marca el intento 'confirmed'
   *   'no-esta'       → marca 'failed' (permite reintentar; el contrato
   *                     rechazará el nullifier si en realidad ya se usó)
   *   'sin-respuesta' → NO TOCA NADA. El intento sigue 'pending' y se vuelve a
   *                     mirar en la pasada siguiente (BC-24)
   *
   * Esa tercera rama es la importante y es nueva. Antes checkOnChain devolvía
   * null tanto si el voto no estaba como si el RPC había fallado, así que un
   * fallo de red marcaba el voto como perdido. Y como la consulta iba sin rango
   * de bloques (BC-23), fallaba siempre: le pasaba a todos los intentos.
   */
  async cleanupStaleVoteAttempts(
    checkOnChain: (nullifierHash: string) => Promise<BusquedaDeVoto>,
  ): Promise<void> {
    const stale = await this.run<{
      id: number;
      user_id: number;
      election_id: number;
      nullifier_hash: string | null;
      candidate_id: number | null;
    }>(
      `SELECT id, user_id, election_id, nullifier_hash, candidate_id
       FROM vote_attempts
       WHERE status = 'pending'
         AND started_at < NOW() - INTERVAL '30 minutes'`,
    );

    for (const attempt of stale) {
      try {
        const respuesta: BusquedaDeVoto = attempt.nullifier_hash
          ? await checkOnChain(attempt.nullifier_hash)
          : { estado: 'no-esta' };

        // BC-24: si el nodo no ha respondido, NO sabemos si el voto está en la
        // cadena. Antes esto se trataba igual que "no está" y el intento se
        // marcaba 'failed': un voto que sí estaba registrado se daba por perdido
        // en silencio, y como el rango de bloques estaba mal (BC-23) la consulta
        // fallaba siempre, así que le pasaba a todos. Se deja 'pending' y se
        // vuelve a mirar en la pasada siguiente.
        if (respuesta.estado === 'sin-respuesta') {
          console.warn(
            `[cleanup] intento ${attempt.id}: la cadena no ha respondido, se deja pendiente (${respuesta.motivo})`,
          );
          continue;
        }

        const onChain = respuesta.estado === 'encontrado' ? respuesta.recibo : null;
        const newStatus: 'confirmed' | 'failed' = onChain ? 'confirmed' : 'failed';

        await this.pool.query(
          `UPDATE vote_attempts
           SET status = $1, completed_at = NOW()
           WHERE id = $2`,
          [newStatus, attempt.id],
        );

        if (onChain) {
          // Reconstruir la fila de nullifier_audit desde los datos del evento VoteCast.
          // ON CONFLICT DO NOTHING protege contra doble inserción si la ruta ya lo insertó.
          await this.pool.query(
            `INSERT INTO nullifier_audit
               (user_id, election_id, nullifier_hash, tx_hash, block_number, candidate_id, vote_choice)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, election_id) DO NOTHING`,
            [
              attempt.user_id,
              attempt.election_id,
              attempt.nullifier_hash,
              onChain.txHash,
              onChain.blockNumber,
              attempt.candidate_id,
              attempt.candidate_id != null ? String(attempt.candidate_id) : null,
            ],
          );
        }
      } catch (err) {
        console.error(`[cleanup] Error procesando intento ${attempt.id}:`, err);
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
