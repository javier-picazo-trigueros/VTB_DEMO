/**
 * Tests de control de acceso por rol.
 * Migrado de Authorization: Bearer a autenticación por cookie.
 * Usa usuarios fixture propios — no depende del seed global.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { createFixtureUser, loginAsFixture } from './helpers/fixtures.js';

describe('Role access control', () => {
  let studentAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const student = await createFixtureUser({ role: 'student' });
    const admin = await createFixtureUser({ role: 'admin', adminDomain: 'test.vtb' });

    ({ agent: studentAgent } = await loginAsFixture(student.email, student.password));
    ({ agent: adminAgent } = await loginAsFixture(admin.email, admin.password));
  });

  it('unauthenticated request to /api/elections returns 401', async () => {
    const res = await request(app).get('/api/elections');
    expect(res.status).toBe(401);
  });

  it('student cannot access /admin/users', async () => {
    const res = await studentAgent.get('/admin/users');
    expect(res.status).toBe(403);
  });

  it('admin can access /admin/users', async () => {
    const res = await adminAgent.get('/admin/users');
    expect(res.status).toBe(200);
  });

  it('GET /health returns OK without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
