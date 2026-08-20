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

export function getDbClient(): DbClient {
  if (instance) return instance;

  const clientType = process.env.DB_CLIENT ?? 'sqlite';

  if (clientType === 'postgres') {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DB_CLIENT=postgres requiere que DATABASE_URL esté definida');
    }
    instance = new PgClient(url);
    console.log('✅ Usando PostgreSQL como motor de BD');
  } else {
    instance = new SqliteAdapter(getDatabase());
    console.log('✅ Usando SQLite como motor de BD (legacy)');
  }

  return instance;
}

/** Solo para tests: reemplaza la instancia activa */
export function setDbClientForTesting(client: DbClient): void {
  instance = client;
}

export type { DbClient } from './client.js';
export { VoteConflictError } from './client.js';
