// Set env vars at module level so database.ts reads ':memory:' when first imported
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_vitest';
process.env.HMAC_SECRET = 'test_hmac_secret';
process.env.NULLIFIER_SECRET = 'test_nullifier_secret';
process.env.DATABASE_PATH = ':memory:';
process.env.CORS_ORIGINS = 'http://localhost:5173';

import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Initialize schema and seed demo data for tests
  const { getDatabase } = await import('../config/database.js');
  const { seedDemoData } = await import('../scripts/seedDatabase.js');
  const db = getDatabase();
  await db.initialize();
  await seedDemoData();
});
