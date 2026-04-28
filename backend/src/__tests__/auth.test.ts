import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('POST /auth/login', () => {
  it('returns token for valid voter credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'carlos@ufv.es', password: 'demo123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('student');
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'carlos@ufv.es', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'notexist@ufv.es', password: 'demo123' });
    expect(res.status).toBe(401);
  });

  it('admin login returns admin role', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@ufv.es', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});
