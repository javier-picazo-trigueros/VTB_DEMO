/**
 * Tests de control de acceso por rol.
 * Migrado de Authorization: Bearer a autenticación por cookie.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Role access control', () => {
  // Supertest agents mantienen el jar de cookies entre peticiones
  let studentAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    studentAgent = request.agent(app);
    await studentAgent.post('/auth/login').send({ email: 'carlos@ufv.es', password: 'demo123' });

    adminAgent = request.agent(app);
    await adminAgent.post('/auth/login').send({ email: 'admin@ufv.es', password: 'admin123' });
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
