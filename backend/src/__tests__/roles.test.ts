import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Role access control', () => {
  let studentToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const studentRes = await request(app)
      .post('/auth/login')
      .send({ email: 'carlos@ufv.es', password: 'demo123' });
    studentToken = studentRes.body.token;

    const adminRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@ufv.es', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  it('unauthenticated request to /api/elections returns 401', async () => {
    const res = await request(app).get('/api/elections');
    expect(res.status).toBe(401);
  });

  it('student cannot access /admin/users', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can access /admin/users', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('GET /health returns OK without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
