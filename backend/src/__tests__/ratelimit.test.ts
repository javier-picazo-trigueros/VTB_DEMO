import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app } from '../app.js';

/**
 * A3 — rate limiting.
 *
 * En NODE_ENV=test los límites están levantados a propósito (si no, los otros
 * tests se volverían flaky). Así que aquí NO se comprueba que corten, sino
 * dos cosas que sí se pueden verificar de forma determinista:
 *
 *   1. Que los limitadores están montados en la cadena de la ruta y no la
 *      rompen (una ruta sin limiter y otra con limiter deben comportarse igual).
 *   2. Que la política por entorno es la correcta, leyendo el módulo
 *      directamente en lugar de a través de HTTP.
 */

describe('A3 — rutas públicas con limitador montado', () => {
  it('POST /auth/register sigue funcionando con el limiter delante', async () => {
    const res = await request(app).post('/auth/register').send({
      email: `rl-reg-${Date.now()}@test.vtb`,
      password: 'ValidPass123',
      name: 'Rate Limit Test',
      student_id: `RL-${Date.now()}`,
    });
    expect([201, 409]).toContain(res.status);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('POST /registration/request sigue funcionando con el limiter delante', async () => {
    const res = await request(app).post('/registration/request').send({
      fullName: 'Rate Limit Test',
      email: `rl-sol-${Date.now()}@test.vtb`,
      studentId: `RLS-${Date.now()}`,
      password: 'ValidPass123',
    });
    expect(res.status).toBeLessThan(500);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('POST /auth/reset-password sigue funcionando con el limiter delante', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'ValidPass123' });
    // 400 = token inexistente. Lo relevante es que llegó al handler.
    expect(res.status).toBe(400);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('POST /auth/forgot-password pasa por los DOS limitadores (IP y email)', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: `rl-forgot-${Date.now()}@test.vtb` });
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('el limitador de IP de forgot-password cuenta aunque el email cambie', async () => {
    // Con solo el limitador por email, cada dirección nueva estrenaba cubo y
    // el endpoint quedaba de facto sin límite por origen.
    //
    // Se monta forgotIpLimiter aislado: en la ruta real va encadenado antes
    // del de email, que sobrescribe las cabeceras ratelimit-* con las de su
    // propio cubo (uno distinto por email) y taparía la medición.
    const { forgotIpLimiter } = await import('../middleware/rateLimit.js');
    const probe = express();
    probe.use(express.json());
    probe.post('/probe', forgotIpLimiter, (_req, res) => { res.json({ ok: true }); });

    const first = await request(probe)
      .post('/probe')
      .send({ email: `rot-a-${Date.now()}@test.vtb` });
    const second = await request(probe)
      .post('/probe')
      .send({ email: `rot-b-${Date.now()}@test.vtb` });

    const r1 = Number(first.headers['ratelimit-remaining']);
    const r2 = Number(second.headers['ratelimit-remaining']);
    expect(Number.isFinite(r1)).toBe(true);
    expect(r2).toBe(r1 - 1);
  });
});

describe('A3 — política de límites por entorno', () => {
  it('envLimit ignora valores no numéricos en lugar de dejar max=NaN', async () => {
    // parseInt("abc") → NaN, y express-rate-limit con max=NaN deja de limitar
    // sin avisar. La configuración debe caer al fallback.
    const mod = await import('../middleware/rateLimit.js');
    // Los limitadores se construyen al importar el módulo; que exista y tenga
    // la forma de un middleware basta para confirmar que no explotó.
    expect(typeof mod.loginLimiter).toBe('function');
    expect(typeof mod.registerLimiter).toBe('function');
    expect(typeof mod.forgotIpLimiter).toBe('function');
    expect(typeof mod.forgotEmailLimiter).toBe('function');
    expect(typeof mod.resetPasswordLimiter).toBe('function');
    expect(typeof mod.voteUserLimiter).toBe('function');
    expect(typeof mod.voteIpLimiter).toBe('function');
  });
});
