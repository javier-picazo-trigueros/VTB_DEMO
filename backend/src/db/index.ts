/**
 * Factory que devuelve el DbClient correcto según el entorno.
 *
 * DB_CLIENT=postgres + DATABASE_URL → PgClient
 * DB_CLIENT=sqlite  (o vacío)       → SqliteAdapter (comportamiento actual)
 *
 * Uso en rutas:
 *   import { getDbClient } from '../db/index.js';
 *   const db = getDbClient();
 */
import { PgClient } from './postgres.js';
import { SqliteAdapter } from './sqlite-adapter.js';
import { getDatabase } from '../config/database.js';
import type { DbClient } from './client.js';

let instance: DbClient | null = null;

/** ¿Está el proceso configurado para hablar con PostgreSQL? */
export function isPostgres(): boolean {
  return (process.env.DB_CLIENT ?? 'sqlite') === 'postgres';
}

export function getDbClient(): DbClient {
  if (instance) return instance;

  if (isPostgres()) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DB_CLIENT=postgres requiere que DATABASE_URL esté definida');
    }
    // Un error frecuente al migrar: DATABASE_URL heredada del modo SQLite con una
    // ruta de fichero. El Pool de pg la acepta y falla mucho más tarde con un
    // error de red que no se parece en nada a la causa.
    if (!/^postgres(ql)?:\/\//i.test(url)) {
      throw new Error(
        `DB_CLIENT=postgres pero DATABASE_URL no es una cadena de conexión de PostgreSQL ` +
        `(recibido: "${url.slice(0, 40)}"). Debe empezar por postgresql://`,
      );
    }
    instance = new PgClient(url);
    console.log('✅ Usando PostgreSQL como motor de BD');
  } else {
    instance = new SqliteAdapter(getDatabase());
    console.log('✅ Usando SQLite como motor de BD (legacy)');
  }

  return instance;
}

/**
 * Deja el esquema listo para usar, sea cual sea el motor.
 *
 * SQLite: crea las tablas desde `config/database.ts`, como hasta ahora.
 * PostgreSQL: no hace nada. El esquema lo crean las migraciones
 *   (`npm run migrate`), que es donde viven los tipos correctos (BOOLEAN,
 *   TIMESTAMPTZ, claves foráneas con enforcement real).
 *
 * Existe para que el arranque y los scripts no tengan que llamar a
 * `getDatabase().initialize()`, que es específico de SQLite y, sobre PostgreSQL,
 * dejaba además un `vtb.db` vacío en el disco que confundía al diagnosticar.
 */
export async function ensureSchema(): Promise<void> {
  if (isPostgres()) {
    console.log('ℹ️  PostgreSQL: el esquema lo gestionan las migraciones (npm run migrate)');
    return;
  }
  await getDatabase().initialize();
  console.log('✅ Base de datos SQLite inicializada');
}

/**
 * Ejecuta un bloque de escrituras como una sola unidad atómica.
 *
 *   await withTransaction(async (tx) => {
 *     const u = await tx.exec('INSERT INTO users …', [...]);
 *     await tx.exec('INSERT INTO election_voters …', [electionId, u.lastID]);
 *   });
 *
 * O todo, o nada. En PostgreSQL es un BEGIN/COMMIT real sobre una conexión
 * dedicada; en SQLite, un BEGIN IMMEDIATE serializado sobre la única conexión.
 *
 * ── REGLA, y no es una recomendación ────────────────────────────────────────
 *
 * Dentro del callback hay que usar **`tx`**, nunca `db` ni `getDbClient()`.
 *
 * En PostgreSQL, `tx` es una conexión concreta tomada del pool, la misma en la
 * que se ejecutó el BEGIN. Una consulta lanzada contra el cliente general coge
 * OTRA conexión del pool, queda fuera de la transacción y **el ROLLBACK no la
 * deshace**: se confirma sola, aunque el resto del bloque se revierta.
 *
 * Es un error fácil de cometer porque el código compila, pasa los tests sobre
 * SQLite (donde solo hay una conexión y da igual) y solo se manifiesta en
 * producción como datos a medias. Ya ocurre así en
 * `scripts/migrate-sqlite-to-pg.ts`, que abre BEGIN en una conexión y hace los
 * INSERT por el pool.
 *
 * Hay un test estático en `pg-sql.test.ts` que recorre el código y falla si
 * dentro de un callback de transacción aparece una llamada al cliente general.
 */
export function withTransaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  return getDbClient().transaction(fn);
}

/** Solo para tests: reemplaza la instancia activa */
export function setDbClientForTesting(client: DbClient): void {
  instance = client;
}

export type { DbClient } from './client.js';
export { VoteConflictError, isUniqueViolation } from './client.js';
