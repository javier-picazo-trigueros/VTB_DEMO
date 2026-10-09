/**
 * `npm run migrate`: envuelve la CLI de node-pg-migrate para que verifique el
 * certificado de la base de datos con DATABASE_CA_CERT (ver src/db/ssl.ts).
 *
 * La CLI solo sabe leer el SSL de la URL, así que con la CA se escribe a un
 * fichero temporal y se le pasa una URL con `sslmode=verify-full&sslrootcert=…`
 * en lugar de la original. Sin la variable, la CLI corre exactamente como antes
 * y se avisa en el log. Todos los argumentos se pasan tal cual.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { migrationDatabaseUrl, readCaCertificate, resolvePgSsl } from '../src/db/ssl.js';

dotenv.config({ quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const env: NodeJS.ProcessEnv = { ...process.env };
let tempDir: string | null = null;

try {
  const ca = readCaCertificate(process.env);
  if (ca && databaseUrl) {
    tempDir = mkdtempSync(path.join(tmpdir(), 'vtb-migrate-'));
    const caFile = path.join(tempDir, 'ca.crt');
    writeFileSync(caFile, ca, { mode: 0o600 });
    env.DATABASE_URL = migrationDatabaseUrl(databaseUrl, caFile);
  } else if (databaseUrl) {
    const { warning } = resolvePgSsl(databaseUrl, process.env);
    if (warning) console.warn(`⚠️  [migrate] ${warning}`);
  }
} catch (error) {
  console.error(`[migrate] ${error instanceof Error ? error.message : 'error al preparar la conexión'}`);
  process.exit(1);
}

const cli = path.join(process.cwd(), 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env });

if (tempDir) rmSync(tempDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
