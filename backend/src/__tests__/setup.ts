// Set env vars at module level so database.ts reads ':memory:' when first imported
process.env.NODE_ENV = 'test';
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

import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Initialize schema and seed demo data for tests
  const { getDatabase } = await import('../config/database.js');
  const { seedDemoData } = await import('../scripts/seedDatabase.js');
  const db = getDatabase();
  await db.initialize();
  await seedDemoData();
});
