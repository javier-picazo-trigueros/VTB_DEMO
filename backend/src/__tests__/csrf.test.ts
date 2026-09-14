import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { createAndLogin, createFixtureUser } from './helpers/fixtures.js';

/**
 * A2 — cobertura del middleware CSRF.
 *
 * Fija empíricamente qué rutas y qué métodos están protegidos, para que una
 * refactorización del orden de los middlewares en app.ts rompa un test en
 * lugar de abrir un agujero en silencio.
 */

describe('A2 — CSRF: rutas mutantes con sesión', () => {
  it('POST /admin/users sin cabecera CSRF → 403', async () => {
    const { agent } = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' });
    const res = await agent.post('/admin/users').send({
      email: 'csrf-probe@test.vtb', password: 'x'.repeat(12),
      name: 'Probe', student_id: 'CSRF-1',
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_MISMATCH');
  });

  it('POST /admin/users con cabecera CSRF correcta → pasa el middleware', async () => {
    const { agent, csrf } = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' });
    const res = await agent
      .post('/admin/users')
      .set('X-CSRF-Token', csrf)
      .send({
        email: `csrf-ok-${Date.now()}@test.vtb`, password: 'x'.repeat(12),
        name: 'Probe', student_id: `CSRF-OK-${Date.now()}`,
      });
    expect(res.status).not.toBe(403);
  });

  it('PATCH /auth/me/profile sin cabecera CSRF → 403', async () => {
    const { agent } = await createAndLogin();
    const res = await agent.patch('/auth/me/profile').send({ name: 'Nuevo Nombre' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_MISMATCH');
  });

  it('PUT /admin/elections/:id sin cabecera CSRF → 403', async () => {
    const { agent } = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' });
    const res = await agent.put('/admin/elections/1').send({ is_active: 0 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_MISMATCH');
  });

  it('DELETE /admin/users/:id sin cabecera CSRF → 403', async () => {
    const { agent } = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' });
    const victim = await createFixtureUser();
    const res = await agent.delete(`/admin/users/${victim.id}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_MISMATCH');
  });

  it('POST /api/elections/register-vote sin cabecera CSRF → 403', async () => {
    const { agent } = await createAndLogin();
    const res = await agent.post('/api/elections/register-vote').send({
      electionId: 1, voteHash: '0x' + 'ab'.repeat(32),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_MISMATCH');
  });

  it('una cookie CSRF de otro usuario no sirve (anti cookie-stuffing)', async () => {
    const victim = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' });
    const attacker = await createAndLogin();

    // Cabecera y cookie coinciden entre sí, pero pertenecen al atacante,
    // no al usuario de la cookie de sesión.
    const res = await victim.agent
      .post('/admin/users')
      .set('Cookie', `vtb_csrf=${attacker.csrf}`)
      .set('X-CSRF-Token', attacker.csrf)
      .send({
        email: 'stuffed@test.vtb', password: 'x'.repeat(12),
        name: 'Stuffed', student_id: 'STUFF-1',
      });
    expect(res.status).toBe(403);
  });
});

describe('A2 — CSRF: exenciones necesarias', () => {
  it('POST /auth/login funciona sin cabecera CSRF (nadie tiene cookie aún)', async () => {
    const user = await createFixtureUser();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
  });

  it('POST /auth/register funciona sin cabecera CSRF', async () => {
    const res = await request(app).post('/auth/register').send({
      email: `reg-${Date.now()}@test.vtb`,
      password: 'ValidPass123',
      name: 'Registro Test',
      student_id: `REG-${Date.now()}`,
    });
    expect(res.status).not.toBe(403);
  });

  it('POST /registration/request funciona sin cabecera CSRF', async () => {
    const res = await request(app).post('/registration/request').send({
      fullName: 'Solicitud Test',
      email: `sol-${Date.now()}@test.vtb`,
      studentId: `SOL-${Date.now()}`,
      password: 'ValidPass123',
    });
    expect(res.status).not.toBe(403);
  });

  it('POST /auth/forgot-password funciona sin cabecera CSRF', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'desconocido@test.vtb' });
    expect(res.status).not.toBe(403);
  });

  it('GET no requiere CSRF aunque haya sesión', async () => {
    const { agent } = await createAndLogin();
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
  });
});

describe('A2 — CSRF: logout debe seguir siendo posible', () => {
  it('POST /auth/logout con cabecera CSRF → 200', async () => {
    const { agent, csrf } = await createAndLogin();
    const res = await agent.post('/auth/logout').set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
  });
});
