import { describe, it, expect, afterEach } from 'vitest';
import { verifyPassword } from '../utils/auth.js';
import { getDatabase } from '../config/database.js';

/**
 * A4 — el seed no debe tener contraseñas por defecto para cuentas privilegiadas.
 *
 * setup.ts define SEED_* antes de sembrar, así que la base de datos de test
 * tiene las contraseñas de test, no las antiguas del código.
 */

const OLD_DEFAULTS = ['superadmin123', 'admin123', 'password', 'admin'];

describe('A4 — contraseñas del seed', () => {
  it('ninguna cuenta privilegiada usa una contraseña histórica por defecto', async () => {
    const db = getDatabase();
    const rows = await db.run<{ email: string; role: string; password_hash: string }>(
      `SELECT email, role, password_hash FROM users
        WHERE role IN ('admin', 'superadmin')`,
    );
    expect(rows.length).toBeGreaterThan(0);

    for (const user of rows) {
      for (const weak of OLD_DEFAULTS) {
        const matches = await verifyPassword(weak, user.password_hash);
        expect(
          matches,
          `${user.email} (${user.role}) acepta la contraseña por defecto "${weak}"`,
        ).toBe(false);
      }
    }
  });

  it('el superadmin de plataforma usa la contraseña de SEED_SUPERADMIN_PASSWORD', async () => {
    const db = getDatabase();
    const row = await db.get<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = ?',
      ['superadmin@vtb.system'],
    );
    expect(row).toBeDefined();
    expect(
      await verifyPassword(process.env.SEED_SUPERADMIN_PASSWORD!, row!.password_hash),
    ).toBe(true);
  });
});

describe('A4 — el seed aborta si falta la variable', () => {
  const saved = process.env.SEED_SUPERADMIN_PASSWORD;
  afterEach(() => { process.env.SEED_SUPERADMIN_PASSWORD = saved; });

  it('lanza nombrando la variable que falta', async () => {
    delete process.env.SEED_SUPERADMIN_PASSWORD;
    const { seedDemoData } = await import('../scripts/seedDatabase.js');
    await expect(seedDemoData()).rejects.toThrow(/SEED_SUPERADMIN_PASSWORD/);
  });

  it('rechaza una contraseña demasiado corta en vez de aceptarla', async () => {
    process.env.SEED_SUPERADMIN_PASSWORD = 'corta';
    const { seedDemoData } = await import('../scripts/seedDatabase.js');
    await expect(seedDemoData()).rejects.toThrow(/al menos 12 caracteres/);
  });
});
