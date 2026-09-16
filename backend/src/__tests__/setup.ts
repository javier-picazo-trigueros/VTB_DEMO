// Set env vars at module level so database.ts reads ':memory:' when first imported
process.env.NODE_ENV = 'test';

// ── Aislamiento de la base de datos: OBLIGATORIO, no quitar ─────────────────
//
// app.ts y utils/auth.ts llaman a dotenv.config(), que carga backend/.env. dotenv
// NO sobrescribe variables que ya existen, pero SÍ rellena las que faltan. Si el
// .env de quien ejecuta los tests apunta a una base real (DB_CLIENT=postgres +
// DATABASE_URL de Supabase), sin estas líneas los tests se ejecutan CONTRA ESA
// BASE: el beforeAll de abajo la vuelve a sembrar con las contraseñas de test y
// cada test inserta usuarios, elecciones y votos de prueba en ella.
//
// Pasó de verdad el 15-sep-2026 contra la base de Supabase del proyecto. Se
// fijan aquí, antes de cualquier import, para que dotenv no pueda rellenarlas.
// DATABASE_URL se define vacía (y no se borra) precisamente para que exista y
// dotenv la deje en paz.
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_URL = '';
process.env.RESEND_API_KEY = '';
// Lo mismo con la blockchain. Sin estas tres, dotenv rellenaría CONTRACT_ADDRESS,
// PRIVATE_KEY y RPC_URL desde el .env local, y crear una elección en un test
// lanzaría la sincronización con transacciones REALES en Sepolia.
process.env.CONTRACT_ADDRESS = '';
process.env.PRIVATE_KEY = '';
process.env.RPC_URL = '';
process.env.JWT_SECRET = 'test_jwt_secret_for_vitest';
process.env.HMAC_SECRET = 'test_hmac_secret';
process.env.NULLIFIER_SECRET = 'test_nullifier_secret';
process.env.DATABASE_PATH = ':memory:';
process.env.CORS_ORIGINS = 'http://localhost:5173';

// A4: el seed ya no tiene contraseñas por defecto para cuentas privilegiadas.
// Se definen aquí explícitamente en lugar de dar al seed una vía de escape por
// NODE_ENV=test — así el camino de producción no tiene ninguna excepción.
process.env.SEED_SUPERADMIN_PASSWORD = 'test-only-superadmin-password';
process.env.SEED_DEMO_ADMIN_PASSWORD = 'test-only-demoadmin-password';
process.env.SEED_DEMO_SUPERADMIN_PASSWORD = 'test-only-demosuper-password';
// Explícita también: si faltara, dotenv la rellenaría desde el .env local y los
// tests dependerían de la máquina de quien los ejecuta. Vale 'demo123' — el
// mismo valor por defecto del seed — porque vote.test.ts y csrf.test.ts entran
// como student@vtb.demo con esa contraseña.
process.env.SEED_DEMO_STUDENT_PASSWORD = 'demo123';
// demo-login está deshabilitada salvo que se pida explícitamente. Los tests que
// ejercitan el camino feliz la necesitan activa; el que comprueba la puerta
// cerrada la quita y la restaura.
process.env.DEMO_LOGIN_ENABLED = 'true';

import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Initialize schema and seed demo data for tests
  const { getDatabase } = await import('../config/database.js');
  const { seedDemoData } = await import('../scripts/seedDatabase.js');
  const db = getDatabase();
  await db.initialize();
  await seedDemoData();
});
