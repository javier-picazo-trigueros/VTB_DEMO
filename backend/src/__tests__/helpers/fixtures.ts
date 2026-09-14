/**
 * Fixtures compartidas para tests de backend.
 *
 * Cada test crea sus propios usuarios (con emails únicos por timestamp),
 * en vez de depender de cuentas del seed global. Esto evita que cambios
 * en seedDatabase.ts (nombres, dominios, universidad ficticia) rompan
 * los tests — y hace explícito, en el propio test, qué datos necesita.
 *
 * Patrón extraído de security-fixes.test.ts, que ya lo hacía bien.
 */
import request from 'supertest';
import { app } from '../../app.js';
import { getDatabase } from '../../config/database.js';
import { hashPassword } from '../../utils/auth.js';

let counter = 0;
function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

export interface FixtureUserOptions {
  email?: string;
  password?: string;
  studentId?: string;
  name?: string;
  role?: 'student' | 'admin' | 'superadmin';
  adminDomain?: string | null;
  isEligible?: number;
  mustChangePassword?: number;
}

export interface FixtureUser {
  id: number;
  email: string;
  password: string;
}

/**
 * Crea un usuario directamente en la base de datos de test (sin pasar por
 * el flujo de registro/aprobación). Email único por defecto, dominio
 * `test.vtb` — no colisiona con ninguna institución real ni con el seed.
 */
export async function createFixtureUser(opts: FixtureUserOptions = {}): Promise<FixtureUser> {
  const db = getDatabase();
  const suffix = uniqueSuffix();
  const email = opts.email ?? `fixture-${suffix}@test.vtb`;
  const password = opts.password ?? 'TestPass123!';
  const hash = await hashPassword(password);

  const result = await db.exec(
    `INSERT OR IGNORE INTO users
       (email, password_hash, name, student_id, role, admin_domain,
        is_approved, approved_at, is_eligible, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?)`,
    [
      email,
      hash,
      opts.name ?? 'Fixture User',
      opts.studentId ?? `FIX-${suffix}`,
      opts.role ?? 'student',
      opts.adminDomain ?? null,
      opts.isEligible ?? 1,
      opts.mustChangePassword ?? 0,
    ]
  );

  let id = result.lastID;
  if (!id) {
    // Row already existed (email collision) — fetch its id.
    const row = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
    id = row!.id;
  }
  return { id, email, password };
}

/** Inicia sesión y devuelve {agent, csrf} para peticiones autenticadas. */
export async function loginAsFixture(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAsFixture(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const raw = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
  const csrf = list.find(c => c.startsWith('vtb_csrf='))
    ?.split(';')[0].split('=').slice(1).join('=') ?? '';
  return { agent, csrf };
}

/** Crea un usuario fixture y lo loguea en un solo paso. */
export async function createAndLogin(opts: FixtureUserOptions = {}) {
  const user = await createFixtureUser(opts);
  const { agent, csrf } = await loginAsFixture(user.email, user.password);
  return { ...user, agent, csrf };
}

/**
 * Crea una elección de prueba mínima, activa, no ligada a ninguna
 * institución del seed.
 */
export async function createFixtureElection(opts: {
  name?: string;
  description?: string;
  blockchainId?: number;
} = {}): Promise<number> {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const result = await db.exec(
    `INSERT INTO elections
       (election_id_blockchain, name, description, start_time, end_time, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      opts.blockchainId ?? Math.floor(Math.random() * 1_000_000) + 9_000_000,
      opts.name ?? `Fixture Election ${uniqueSuffix()}`,
      opts.description ?? 'Created by test fixtures',
      now - 3600,
      now + 3600,
    ]
  );
  return result.lastID;
}
