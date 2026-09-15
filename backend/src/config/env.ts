/**
 * Env validation — punto 4.
 *
 * Llamado una sola vez al arrancar (index.ts lo importa antes que nada, para
 * que un despliegue mal configurado aborte aquí y no a mitad de la primera
 * petición). Si falta una variable requerida en producción, lanza Error con
 * el nombre exacto de la variable y aborta el proceso. En desarrollo usa
 * defaults inseguros pero explícitos para poder levantar sin .env completo.
 */
import dotenv from 'dotenv';
// Idempotente: si index.ts (u otro módulo) ya llamó a dotenv.config(), esto
// no sobreescribe nada. Se repite aquí para que este fichero sea seguro de
// importar el primero, sin depender de qué otro módulo cargue el .env antes.
dotenv.config({ quiet: true });

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

/** Lanza si la variable no existe (solo en producción). */
function req(name: string, devFallback?: string): string {
  const val = process.env[name];
  if (val) return val;
  if (!IS_PROD && devFallback !== undefined) return devFallback;
  throw new Error(
    `FATAL: la variable de entorno "${name}" es obligatoria en producción y no está definida.\n` +
    `  → Añádela en backend/.env (local) o en las variables de entorno de tu proveedor (Render/Railway/…).`,
  );
}

/** Devuelve la variable o el valor por defecto sin lanzar nunca. */
function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  NODE_ENV:   opt('NODE_ENV', 'development'),
  IS_PROD,
  IS_TEST,

  // ── Auth ─────────────────────────────────────────────────────────────────
  JWT_SECRET:        req('JWT_SECRET',        'dev-jwt-secret-not-for-prod'),
  NULLIFIER_SECRET:  req('NULLIFIER_SECRET',  'dev-nullifier-secret-not-for-prod'),
  HMAC_SECRET:       req('HMAC_SECRET',       'dev-hmac-secret-not-for-prod'),
  CSRF_SECRET:       process.env.CSRF_SECRET ?? null,  // derivado de JWT_SECRET si no está

  // ── Base de datos ─────────────────────────────────────────────────────────
  DB_CLIENT:     (opt('DB_CLIENT', 'sqlite')) as 'sqlite' | 'postgres',
  DATABASE_PATH: opt('DATABASE_PATH', 'vtb.db'),
  DATABASE_URL:  process.env.DATABASE_URL ?? null,

  // ── Red / CORS ────────────────────────────────────────────────────────────
  PORT:          Number(opt('PORT', '3001')),
  CORS_ORIGINS:  opt('CORS_ORIGINS', '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  FRONTEND_URL:  opt('FRONTEND_URL', 'http://localhost:5173'),

  // ── Blockchain (opcionales; sin ellos las transacciones de voto no funcionan) ──
  RPC_URL:          opt('RPC_URL',          'http://localhost:8545'),
  CONTRACT_ADDRESS: opt('CONTRACT_ADDRESS', ''),
  PRIVATE_KEY:      opt('PRIVATE_KEY',      ''),
  EXPLORER_URL:     opt('EXPLORER_URL',     ''),

  // ── Email (opcional; sin él los emails se encolan pero no se envían) ──────
  RESEND_API_KEY: opt('RESEND_API_KEY', ''),

  // ── Rate limit ────────────────────────────────────────────────────────────
  RATE_LIMIT_MAX: Number(opt('RATE_LIMIT_MAX', '10')),
} as const;

// ── Validaciones cruzadas ─────────────────────────────────────────────────────

if (env.DB_CLIENT === 'postgres' && !env.DATABASE_URL) {
  throw new Error(
    'FATAL: DB_CLIENT=postgres requiere que DATABASE_URL esté definida.\n' +
    '  Ejemplo: DATABASE_URL=postgresql://user:pass@host:5432/dbname',
  );
}

// Sin esto, CORS_ORIGINS queda como [] en producción y el navegador bloquea
// toda petición del frontend — un fallo silencioso que solo se nota probando
// la app, no al arrancar.
if (IS_PROD && env.CORS_ORIGINS.length === 0) {
  throw new Error(
    'FATAL: la variable de entorno "CORS_ORIGINS" es obligatoria en producción y no está definida.\n' +
    '  → Lista de orígenes del frontend separados por comas, p. ej. https://tu-frontend.vercel.app',
  );
}

if (IS_PROD) {
  const warn = (msg: string) => console.warn(`⚠️  [env] ${msg}`);
  if (!env.CONTRACT_ADDRESS) warn('CONTRACT_ADDRESS no está definida. Las transacciones de blockchain no funcionarán.');
  if (!env.PRIVATE_KEY)      warn('PRIVATE_KEY no está definida. Las transacciones de blockchain no funcionarán.');
  if (!env.RESEND_API_KEY)   warn('RESEND_API_KEY no está definida. Los emails no se enviarán.');
}
