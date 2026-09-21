import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createFixtureUser, loginAsFixture } from './helpers/fixtures.js';
import { generateSecureToken, generateRefreshToken } from '../utils/auth.js';

describe('BLOQUE 1.3 — Refresh y reset reutilizables en concurrencia', () => {
  it('dos peticiones simultáneas con el mismo refresh token deben dar una 200 y la otra 401', async () => {
    const db = getDatabase();
    const user = await createFixtureUser({ email: `concurrent-refresh-${Date.now()}@vtb.demo` });

    // Insertar un refresh token válido para el usuario
    const { plaintext, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    await db.exec(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked) VALUES (?, ?, ?, FALSE)',
      [user.id, hash, expiresAt],
    );

    // Lanzar dos peticiones /auth/refresh concurrentes con la misma cookie
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/auth/refresh')
        .set('Cookie', [`vtb_refresh=${plaintext}`]),
      request(app)
        .post('/auth/refresh')
        .set('Cookie', [`vtb_refresh=${plaintext}`]),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Una debe ser 200 y la otra 401
    expect(statuses).toEqual([200, 401]);
  });

  it('dos peticiones simultáneas con el mismo reset token deben dar una 200 y la otra 400', async () => {
    const db = getDatabase();
    const user = await createFixtureUser({ email: `concurrent-reset-${Date.now()}@vtb.demo` });

    // Insertar un password reset token válido para el usuario
    const { plaintext, hash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    await db.exec(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, hash, expiresAt],
    );

    // Lanzar dos peticiones /auth/reset-password concurrentes con el mismo token
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/auth/reset-password')
        .send({ token: plaintext, password: 'NewPassword111!' }),
      request(app)
        .post('/auth/reset-password')
        .send({ token: plaintext, password: 'NewPassword222!' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Una debe ser 200 y la otra 400
    expect(statuses).toEqual([200, 400]);
  });
});
