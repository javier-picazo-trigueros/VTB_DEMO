/**
 * Tests de flujo de voto completo — punto 5.
 *
 * Usa cuentas @vtb.demo para evitar dependencia de blockchain:
 * el backend detecta el dominio y registra un tx sintético.
 *
 * Cubre:
 *  ✓ Voto normal de principio a fin
 *  ✓ No se puede votar dos veces (409)
 *  ✓ No se puede votar sin estar en el censo (403 — S1 cerrado)
 *  ✓ No se puede votar fuera de la ventana temporal (403)
 *  ✓ is_eligible = 0 bloquea el voto (403)
 *  ✓ /auth/me exige autenticación (401 — S2 cerrado)
 *  ✓ Admin de un dominio no puede tocar usuarios de otro dominio
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createFixtureUser, loginAsFixture } from './helpers/fixtures.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extrae el valor de una cookie de los headers Set-Cookie. */
function extractCookie(headers: Record<string, string | string[]>, name: string): string {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = list.find(c => c.startsWith(`${name}=`));
  return cookie ? cookie.split(';')[0].split('=').slice(1).join('=') : '';
}

/** Abre sesión con agent y devuelve {agent, csrfToken}. */
async function loginAs(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  const csrf = extractCookie(res.headers as Record<string, string | string[]>, 'vtb_csrf');
  return { agent, csrf };
}

// ── Fixtures de test ───────────────────────────────────────────────────────────

let testElectionId = 0;
let testCandidateId = 0;
const NOW = () => Math.floor(Date.now() / 1000);

async function createTestElection(): Promise<{ electionId: number; candidateId: number }> {
  const db = getDatabase();
  const elResult = await db.exec(
    `INSERT INTO elections
       (election_id_blockchain, name, description, start_time, end_time, is_active)
     VALUES (9999, 'Test Election', 'CI test', ?, ?, 1)`,
    [NOW() - 3600, NOW() + 3600],
  );
  const electionId = elResult.lastID;

  const cResult = await db.exec(
    `INSERT INTO candidates (election_id, name, description, position) VALUES (?, 'Candidate A', '', 1)`,
    [electionId],
  );
  return { electionId, candidateId: cResult.lastID };
}

async function addVoterToCensus(electionId: number, email: string) {
  const db = getDatabase();
  const row = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  if (!row) throw new Error(`User ${email} not found in DB`);
  await db.exec(
    'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
    [electionId, row.id],
  );
  return row.id;
}

async function cleanTestElection(electionId: number) {
  const db = getDatabase();
  await db.exec('DELETE FROM nullifier_audit     WHERE election_id = ?', [electionId]);
  await db.exec('DELETE FROM election_voters     WHERE election_id = ?', [electionId]);
  await db.exec('DELETE FROM candidates          WHERE election_id = ?', [electionId]);
  await db.exec('DELETE FROM elections           WHERE id = ?',          [electionId]);
}

// ── Suite de voto ──────────────────────────────────────────────────────────────

describe('Vote flow (vtb.demo accounts — no blockchain needed)', () => {
  beforeEach(async () => {
    const fx = await createTestElection();
    testElectionId  = fx.electionId;
    testCandidateId = fx.candidateId;
    await addVoterToCensus(testElectionId, 'student@vtb.demo');
  });

  afterEach(async () => {
    await cleanTestElection(testElectionId);
    // Restaurar is_eligible por si algún test lo dejó a 0
    const db = getDatabase();
    await db.exec("UPDATE users SET is_eligible = 1 WHERE email = 'student@vtb.demo'");
  });

  it('voto completo de principio a fin', async () => {
    const { agent, csrf } = await loginAs('student@vtb.demo', 'demo123');

    const res = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({
        electionId:  testElectionId,
        voteHash:    '0x' + '1'.repeat(64),
        candidateId: testCandidateId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.txHash).toBe('string');
  });

  it('no se puede votar dos veces (409)', async () => {
    const { agent, csrf } = await loginAs('student@vtb.demo', 'demo123');
    const payload = {
      electionId:  testElectionId,
      voteHash:    '0x' + '2'.repeat(64),
      candidateId: testCandidateId,
    };

    const first = await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf).send(payload);
    expect(first.status).toBe(200);

    const second = await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf).send(payload);
    expect(second.status).toBe(409);
  });

  it('tras votar con cuenta demo, la elegibilidad NO dice que el voto esté en la cadena (C1)', async () => {
    // La pantalla de "ya has votado" afirmaba "Tu voto ha sido registrado en la
    // blockchain" también a las cuentas @vtb.demo, que toman un atajo sintético
    // y nunca llegan a Sepolia. El frontend elige ahora el texto con estos campos.
    const { agent, csrf } = await loginAs('student@vtb.demo', 'demo123');
    const voto = await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId: testElectionId, voteHash: '0x' + '3'.repeat(64), candidateId: testCandidateId });
    expect(voto.status).toBe(200);
    expect(voto.body.isDemo).toBe(true);

    const elig = await agent.get(`/api/elections/${testElectionId}/eligibility`);
    expect(elig.status).toBe(200);
    expect(elig.body.eligible).toBe(false);
    expect(elig.body.reason).toBe('already_voted');
    expect(elig.body.onChain).toBe(false);
    expect(elig.body.isDemo).toBe(true);
  });

  it('no se puede votar sin estar en el censo — S1 cerrado (403)', async () => {
    // student2@vtb.demo NO está añadido al censo de esta elección
    const { agent, csrf } = await loginAs('student2@vtb.demo', 'demo123');

    const res = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({
        electionId:  testElectionId,
        voteHash:    '0x' + '3'.repeat(64),
        candidateId: testCandidateId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/censo/i);
  });

  it('no se puede votar fuera de la ventana temporal (403)', async () => {
    const db = getDatabase();
    // Elección cerrada: end_time en el pasado
    await db.exec(
      'UPDATE elections SET start_time = ?, end_time = ? WHERE id = ?',
      [NOW() - 7200, NOW() - 3600, testElectionId],
    );

    const { agent, csrf } = await loginAs('student@vtb.demo', 'demo123');
    const res = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({
        electionId:  testElectionId,
        voteHash:    '0x' + '4'.repeat(64),
        candidateId: testCandidateId,
      });

    expect(res.status).toBe(403);
  });

  it('is_eligible = 0 impide votar (403)', async () => {
    const db = getDatabase();
    await db.exec("UPDATE users SET is_eligible = 0 WHERE email = 'student@vtb.demo'");

    const { agent, csrf } = await loginAs('student@vtb.demo', 'demo123');
    const res = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({
        electionId:  testElectionId,
        voteHash:    '0x' + '5'.repeat(64),
        candidateId: testCandidateId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/habilitada/i);
  });
});

// ── Suite de autenticación de rutas ───────────────────────────────────────────

describe('Protección de rutas', () => {
  it('/auth/me sin cookie devuelve 401 — S2 cerrado', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('/admin/dashboard sin cookie devuelve 401', async () => {
    const res = await request(app).get('/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('/api/elections/register-vote sin cookie devuelve 401', async () => {
    const res = await request(app)
      .post('/api/elections/register-vote')
      .send({ electionId: 1, voteHash: '0x' + '0'.repeat(64) });
    expect(res.status).toBe(401);
  });
});

// ── Suite de aislamiento de dominio ───────────────────────────────────────────

describe('Aislamiento de dominio admin', () => {
  it('un admin no puede ver usuarios de un dominio distinto al suyo', async () => {
    // Segunda "institución" creada solo para este test, no depende del seed
    // global — así el aislamiento se comprueba con datos propios y no se ve
    // afectado si la universidad ficticia del seed cambia de nombre o dominio.
    const domainA = `dept-a-${Date.now()}.test`;
    const domainB = `dept-b-${Date.now()}.test`;

    const admin = await createFixtureUser({ role: 'admin', adminDomain: domainA });
    const otherDomainUser = await createFixtureUser({ email: `student@${domainB}`, role: 'student' });

    const { agent, csrf } = await loginAsFixture(admin.email, admin.password);

    const res = await agent
      .get('/admin/users?approved=true')
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(200);
    const emails: string[] = (res.body.users ?? []).map((u: { email: string }) => u.email);
    expect(emails).not.toContain(otherDomainUser.email);
  });
});
