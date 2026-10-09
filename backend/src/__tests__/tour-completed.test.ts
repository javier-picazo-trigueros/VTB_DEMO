/**
 * La marca "ya has visto el tutorial" vive en el usuario (users.tour_completed_at),
 * no en localStorage: antes la clave `vtb-tour-done-{usuario}` llevaba un
 * identificador de la cuenta en el navegador y no seguía a la persona entre
 * dispositivos.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createAndLogin, loginAsFixture } from './helpers/fixtures.js';

describe('PATCH /auth/me/tour y GET /auth/me', () => {
  it('una cuenta nueva no ha completado el tutorial (/auth/me y login)', async () => {
    const user = await createAndLogin();
    const me = await user.agent.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.tourCompleted).toBe(false);

    const login = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
    expect(login.body.user.tourCompleted).toBe(false);
  });

  it('completed:true lo marca, /auth/me y el siguiente login lo devuelven, y la columna queda rellena', async () => {
    const user = await createAndLogin();

    const res = await user.agent.patch('/auth/me/tour').set('X-CSRF-Token', user.csrf).send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tourCompleted: true });

    expect((await user.agent.get('/auth/me')).body.user.tourCompleted).toBe(true);
    const row = await getDatabase().get<{ tour_completed_at: string | null }>(
      'SELECT tour_completed_at FROM users WHERE id = ?', [user.id],
    );
    expect(row?.tour_completed_at).not.toBeNull();

    const again = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
    expect(again.body.user.tourCompleted).toBe(true);
  });

  it('completed:false lo reinicia (botón "Reiniciar guía de bienvenida")', async () => {
    const user = await createAndLogin();
    await user.agent.patch('/auth/me/tour').set('X-CSRF-Token', user.csrf).send({ completed: true });

    const res = await user.agent.patch('/auth/me/tour').set('X-CSRF-Token', user.csrf).send({ completed: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tourCompleted: false });
    expect((await user.agent.get('/auth/me')).body.user.tourCompleted).toBe(false);
  });

  it('marcarlo dos veces no cambia la fecha de la primera vez', async () => {
    const user = await createAndLogin();
    await user.agent.patch('/auth/me/tour').set('X-CSRF-Token', user.csrf).send({ completed: true });
    const first = await getDatabase().get<{ tour_completed_at: string }>('SELECT tour_completed_at FROM users WHERE id = ?', [user.id]);
    await new Promise((r) => setTimeout(r, 1100));

    await user.agent.patch('/auth/me/tour').set('X-CSRF-Token', user.csrf).send({ completed: true });

    const second = await getDatabase().get<{ tour_completed_at: string }>('SELECT tour_completed_at FROM users WHERE id = ?', [user.id]);
    expect(second?.tour_completed_at).toBe(first?.tour_completed_at);
  });

  it('solo afecta a quien lo pide: otra cuenta sigue sin completarlo', async () => {
    const a = await createAndLogin();
    const b = await createAndLogin();

    await a.agent.patch('/auth/me/tour').set('X-CSRF-Token', a.csrf).send({ completed: true });

    expect((await a.agent.get('/auth/me')).body.user.tourCompleted).toBe(true);
    expect((await b.agent.get('/auth/me')).body.user.tourCompleted).toBe(false);
    const login = await loginAsFixture(b.email, b.password);
    expect((await login.agent.get('/auth/me')).body.user.tourCompleted).toBe(false);
  });

  it('sin cabecera CSRF → 403 y no cambia nada', async () => {
    const user = await createAndLogin();
    const res = await user.agent.patch('/auth/me/tour').send({ completed: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_MISMATCH');
    expect((await user.agent.get('/auth/me')).body.user.tourCompleted).toBe(false);
  });

  it('sin sesión → 401', async () => {
    const res = await request(app).patch('/auth/me/tour').send({ completed: true });
    expect(res.status).toBe(401);
  });

  it('cuerpo inválido → 400', async () => {
    const user = await createAndLogin();
    for (const body of [{}, { completed: 'si' }, { completed: 1 }, { completed: null }]) {
      const res = await user.agent.patch('/auth/me/tour').set('X-CSRF-Token', user.csrf).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await user.agent.get('/auth/me')).body.user.tourCompleted).toBe(false);
  });
});

describe('el frontend ya no guarda la marca en localStorage', () => {
  const src = path.resolve(__dirname, '../../../frontend/src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = path.join(dir, n);
      return statSync(full).isDirectory() ? files(full) : [full];
    }).filter((f) => /\.(jsx?|tsx?)$/.test(f));

  it('ninguna clave vtb-tour-done se escribe ni se lee; solo se borra la antigua al arrancar', () => {
    const mentions = files(src).filter((f) => /vtb-tour-done/.test(readFileSync(f, 'utf-8')));
    expect(mentions.map((f) => path.relative(src, f).replace(/\\/g, '/'))).toEqual(['utils/auth.js']);
    const auth = readFileSync(path.join(src, 'utils/auth.js'), 'utf-8');
    expect(auth).not.toMatch(/(setItem|getItem)\([^)]*vtb-tour-done/);
    expect(auth).toMatch(/LEGACY_TOUR_KEY_PREFIX = 'vtb-tour-done-'/);
    expect(auth).toMatch(/startsWith\(LEGACY_TOUR_KEY_PREFIX\)[\s\S]*removeItem/);
  });

  it('el tutorial pide la marca al servidor (AuthContext), no al navegador', () => {
    const tour = readFileSync(path.join(src, 'components/OnboardingTour.jsx'), 'utf-8');
    expect(tour).not.toMatch(/localStorage/);
    expect(tour).toMatch(/tourCompleted/);
    expect(tour).toMatch(/markTourCompleted\(true\)/);
    const context = readFileSync(path.join(src, 'context/AuthContext.jsx'), 'utf-8');
    expect(context).toMatch(/\/auth\/me\/tour/);
  });
});
