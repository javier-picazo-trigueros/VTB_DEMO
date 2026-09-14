/**
 * Rotación de contraseñas de administrador débiles (A4).
 *
 * Cambiar el seed solo evita que se creen cuentas nuevas con contraseña por
 * defecto. Las que ya existen en una base de datos sembrada siguen siendo
 * válidas — este script las encuentra y las rota.
 *
 * Uso:
 *   npm run rotate-admin-passwords            # solo informa, no cambia nada
 *   npm run rotate-admin-passwords -- --apply # rota y muestra las nuevas
 *
 * Contra la base de datos que indique DATABASE_PATH (por defecto ./vtb.db).
 * Para PostgreSQL hay que adaptarlo: este script usa la capa SQLite directa.
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import { getDatabase } from '../src/config/database.js';
import { hashPassword, verifyPassword } from '../src/utils/auth.js';

dotenv.config({ quiet: true });

/** Contraseñas que el proyecto usó como valor por defecto en algún momento. */
const KNOWN_DEFAULTS = [
  'superadmin123',
  'admin123',
  'demo123',
  'password',
  'admin',
  '123456',
];

const APPLY = process.argv.includes('--apply');

function newPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

async function main(): Promise<void> {
  const db = getDatabase();
  await db.initialize();

  const users = await db.run<{
    id: number;
    email: string;
    role: string;
    admin_domain: string | null;
    deleted_at: string | null;
    password_hash: string;
  }>(
    `SELECT id, email, role, admin_domain, deleted_at, password_hash
       FROM users
      WHERE role IN ('admin', 'superadmin')
      ORDER BY role DESC, id ASC`,
  );

  const weak: { id: number; email: string; role: string; scope: string; found: string }[] = [];

  for (const u of users) {
    for (const candidate of KNOWN_DEFAULTS) {
      if (await verifyPassword(candidate, u.password_hash)) {
        weak.push({
          id: u.id,
          email: u.email,
          role: u.role,
          scope: u.admin_domain ?? 'GLOBAL',
          found: candidate,
        });
        break;
      }
    }
  }

  console.log(`\nCuentas privilegiadas analizadas: ${users.length}`);
  console.log(`Con contraseña por defecto conocida: ${weak.length}\n`);

  if (weak.length === 0) {
    console.log('✅ Nada que rotar.\n');
    await db.close();
    return;
  }

  for (const w of weak) {
    console.log(`  ❌ id=${w.id}  ${w.email}  role=${w.role}  ámbito=${w.scope}  ("${w.found}")`);
  }

  if (!APPLY) {
    console.log('\nModo informe. Para rotarlas:');
    console.log('  npm run rotate-admin-passwords -- --apply\n');
    await db.close();
    return;
  }

  console.log('\n🔄 Rotando…\n');
  const rotated: { email: string; password: string }[] = [];

  for (const w of weak) {
    const password = newPassword();
    const hash = await hashPassword(password);
    await db.exec(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hash, w.id],
    );
    // Mata cualquier sesión viva de esa cuenta: cambiar la contraseña no
    // revocaba los refresh tokens (ver P1-11 en AUDITORIA_2.md).
    await db.exec('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [w.id])
      .catch(() => { /* la tabla puede no existir en bases antiguas */ });
    rotated.push({ email: w.email, password });
  }

  console.log('='.repeat(64));
  console.log('NUEVAS CONTRASEÑAS — cópialas ahora, no se vuelven a mostrar');
  console.log('='.repeat(64));
  for (const r of rotated) {
    console.log(`  ${r.email.padEnd(34)} ${r.password}`);
  }
  console.log('='.repeat(64));
  console.log('\nSiguiente paso: guarda las de las cuentas del seed en');
  console.log('SEED_SUPERADMIN_PASSWORD / SEED_DEMO_ADMIN_PASSWORD /');
  console.log('SEED_DEMO_SUPERADMIN_PASSWORD para que el próximo `npm run seed`');
  console.log('no las revierta.\n');

  await db.close();
}

main().catch((err) => {
  console.error('❌ Error rotando contraseñas:', err instanceof Error ? err.message : err);
  process.exit(1);
});
