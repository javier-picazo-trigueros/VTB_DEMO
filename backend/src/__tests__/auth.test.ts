import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { createFixtureUser } from './helpers/fixtures.js';

describe('POST /auth/login', () => {
  let studentEmail: string;
  let studentPassword: string;
  let adminEmail: string;
  let adminPassword: string;

  beforeAll(async () => {
    const student = await createFixtureUser({ role: 'student' });
    studentEmail = student.email;
    studentPassword = student.password;

    const admin = await createFixtureUser({ role: 'admin', adminDomain: 'test.vtb' });
    adminEmail = admin.email;
    adminPassword = admin.password;
  });

  it('returns cookie for valid voter credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: studentPassword });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Login usa cookies httpOnly, no body token
    const raw = res.headers['set-cookie'];
    const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
    expect(cookies.some(c => c.startsWith('vtb_auth='))).toBe(true);
    expect(res.body.user.role).toBe('student');
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: `notexist-${Date.now()}@test.vtb`, password: 'demo123' });
    expect(res.status).toBe(401);
  });

  it('admin login returns admin role', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});
