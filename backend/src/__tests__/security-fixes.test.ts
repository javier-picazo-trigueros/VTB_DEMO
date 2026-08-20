/**
 * Regression tests for the security fixes applied in the audit session.
 * Each test creates its own data — no dependency on seeded users.
 *
 * Migrado de Authorization: Bearer a autenticación por cookie.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { hashPassword } from '../utils/auth.js';

describe('Security fixes regression', () => {
  let db: ReturnType<typeof getDatabase>;

  beforeAll(() => {
    db = getDatabase();
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  async function createUser(opts: {
    email: string;
    studentId: string;
    isEligible?: number;
    mustChangePassword?: number;
    role?: string;
  }): Promise<number> {
    const hash = await hashPassword('TestPass123!');
    const result = await db.exec(
      `INSERT OR IGNORE INTO users
         (email, password_hash, name, student_id, role,
          is_approved, is_eligible, must_change_password)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        opts.email,
        hash,
        'Regression Test User',
        opts.studentId,
        opts.role ?? 'student',
        opts.isEligible ?? 1,
        opts.mustChangePassword ?? 0,
      ]
    );
    if (result.lastID) return result.lastID;
    // Row existed (IGNORE) — fetch the id
    const row = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [opts.email]);
    return row!.id;
  }

  async function createElection(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db.exec(
      `INSERT INTO elections
         (election_id_blockchain, name, description, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [9998, 'Security Fix Regression Election', 'Created by security-fixes.test.ts', now - 3600, now + 3600]
    );
    return result.lastID;
  }

  /** Inicia sesión y devuelve {agent, csrf} para peticiones autenticadas. */
  async function loginAs(email: string, password: string) {
    const agent = request.agent(app);
    const res   = await agent.post('/auth/login').send({ email, password });
    if (res.status !== 200)
      throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
    const raw  = res.headers['set-cookie'];
    const list: string[] = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
    const csrf = list.find(c => c.startsWith('vtb_csrf='))
      ?.split(';')[0].split('=').slice(1).join('=') ?? '';
    return { agent, csrf };
  }

  // ── S1: Census and eligibility checked in register-vote ──────────────────

  describe('S1 — register-vote census check', () => {
    it('user NOT in election_voters gets 403', async () => {
      const email = `nocensus-${Date.now()}@test.vtb`;
      await createUser({ email, studentId: `TEST-S1A-${Date.now()}` });
      const electionId = await createElection();
      const { agent, csrf } = await loginAs(email, 'TestPass123!');

      const res = await agent
        .post('/api/elections/register-vote')
        .set('X-CSRF-Token', csrf)
        .send({ electionId, voteHash: '0x' + 'a'.repeat(64), candidateId: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/censo/i);
    });

    it('user with is_eligible = 0 gets 403 even when in census', async () => {
      const email = `ineligible-${Date.now()}@test.vtb`;
      const userId = await createUser({
        email,
        studentId: `TEST-S1B-${Date.now()}`,
        isEligible: 0,
      });
      const electionId = await createElection();

      await db.exec(
        'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
        [electionId, userId]
      );

      const { agent, csrf } = await loginAs(email, 'TestPass123!');

      const res = await agent
        .post('/api/elections/register-vote')
        .set('X-CSRF-Token', csrf)
        .send({ electionId, voteHash: '0x' + 'b'.repeat(64), candidateId: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/habilitad/i);
    });
  });

  // ── S2: IDOR endpoint removed ────────────────────────────────────────────

  describe('S2 — GET /auth/user/:id removed', () => {
    it('returns 404', async () => {
      const res = await request(app).get('/auth/user/1');
      expect(res.status).toBe(404);
    });
  });

  // ── S7: fix-blockchain-ids always requires admin auth ────────────────────

  describe('S7 — fix-blockchain-ids requires admin auth in all environments', () => {
    const savedEnv = process.env.NODE_ENV;
    afterEach(() => { process.env.NODE_ENV = savedEnv; });

    it('returns 401 without token', async () => {
      const res = await request(app).patch('/api/elections/fix-blockchain-ids');
      expect(res.status).toBe(401);
    });

    it('returns 403 with student cookie', async () => {
      // carlos@ufv.es es un estudiante seeded (role='student')
      const { agent } = await loginAs('carlos@ufv.es', 'demo123');
      const res = await agent.patch('/api/elections/fix-blockchain-ids');
      expect(res.status).toBe(403);
    });

    it('returns 401 without token even with NODE_ENV=development', async () => {
      process.env.NODE_ENV = 'development';
      const res = await request(app).patch('/api/elections/fix-blockchain-ids');
      expect(res.status).toBe(401);
    });

    it('returns 403 with student cookie even with NODE_ENV=development', async () => {
      process.env.NODE_ENV = 'development';
      const { agent } = await loginAs('carlos@ufv.es', 'demo123');
      const res = await agent.patch('/api/elections/fix-blockchain-ids');
      expect(res.status).toBe(403);
    });
  });

  // ── S8: must_change_password enforcement ─────────────────────────────────

  describe('S8 — must_change_password = 1 blocks protected endpoints', () => {
    it('blocks GET /api/elections and returns MUST_CHANGE_PASSWORD code', async () => {
      const email = `mustchange-${Date.now()}@test.vtb`;
      await createUser({ email, studentId: `TEST-S8A-${Date.now()}`, mustChangePassword: 1 });
      const { agent } = await loginAs(email, 'TestPass123!');

      const res = await agent.get('/api/elections');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MUST_CHANGE_PASSWORD');
    });

    it('allows GET /auth/me', async () => {
      const email = `mustchange2-${Date.now()}@test.vtb`;
      await createUser({ email, studentId: `TEST-S8B-${Date.now()}`, mustChangePassword: 1 });
      const { agent } = await loginAs(email, 'TestPass123!');

      const res = await agent.get('/auth/me');

      expect(res.status).toBe(200);
    });

    it('allows PATCH /auth/change-password (guard must not fire)', async () => {
      const email = `mustchange3-${Date.now()}@test.vtb`;
      await createUser({ email, studentId: `TEST-S8C-${Date.now()}`, mustChangePassword: 1 });
      const { agent, csrf } = await loginAs(email, 'TestPass123!');

      // Empty body → route handler returns 400; guard returning 403 would mean it fired
      const res = await agent
        .patch('/auth/change-password')
        .set('X-CSRF-Token', csrf)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
