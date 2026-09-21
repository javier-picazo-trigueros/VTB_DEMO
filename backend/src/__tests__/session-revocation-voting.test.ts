import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createFixtureUser, loginAsFixture } from './helpers/fixtures.js';
import { generateSecureToken, hashSecureToken } from '../utils/auth.js';

function extractCookie(headers: Record<string, string | string[]>, name: string): string {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = list.find(c => c.startsWith(`${name}=`));
  return cookie ? cookie.split(';')[0].split('=').slice(1).join('=') : '';
}

const NOW = () => Math.floor(Date.now() / 1000);

async function createTestElection(): Promise<{ electionId: number; candidateId: number }> {
  const db = getDatabase();
  const elResult = await db.exec(
    `INSERT INTO elections
       (election_id_blockchain, name, description, start_time, end_time, is_active)
     VALUES (9999, 'Test Election Revocation', 'CI test', ?, ?, 1)`,
    [NOW() - 3600, NOW() + 3600],
  );
  const electionId = elResult.lastID;

  const cResult = await db.exec(
    `INSERT INTO candidates (election_id, name, description, position) VALUES (?, 'Candidate Test', '', 1)`,
    [electionId],
  );
  return { electionId, candidateId: cResult.lastID };
}

describe('BLOQUE 1.2 — Usuarios borrados o desaprobados que siguen votando, y cambio/reseteo de password que no revoca refresh tokens', () => {
  let electionId: number;
  let candidateId: number;

  beforeAll(async () => {
    const fixture = await createTestElection();
    electionId = fixture.electionId;
    candidateId = fixture.candidateId;
  });

  describe('Parte A: Usuarios borrados o desaprobados', () => {
    it('un usuario borrado (deleted_at marcado) no puede votar ni es elegible aunque conserve JWT activo (403)', async () => {
      const db = getDatabase();
      const user = await createFixtureUser({ email: `deleted-${Date.now()}@vtb.demo` });

      // Añadir al censo de la elección
      await db.exec(
        'INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)',
        [electionId, user.id],
      );

      // El usuario inicia sesión y obtiene cookies de sesión válidas
      const { agent, csrf } = await loginAsFixture(user.email, user.password);

      // Ahora el admin realiza borrado lógico del usuario
      await db.exec(
        'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id],
      );

      // 1. Comprobación de elegibilidad
      const eligRes = await agent.get(`/api/elections/${electionId}/eligibility`);
      expect(eligRes.body.eligible).toBe(false);

      // 2. Intento de voto con sesión activa
      const voteRes = await agent
        .post('/api/elections/register-vote')
        .set('X-CSRF-Token', csrf)
        .send({
          electionId,
          candidateId,
          voteHash: `0x${'a'.repeat(64)}`,
        });

      expect(voteRes.status).toBe(403);
      expect(voteRes.body.error).toMatch(/habilitada|activo|encontrado/i);
    });

    it('un usuario desaprobado (is_approved=false) no puede votar ni es elegible aunque conserve JWT activo (403)', async () => {
      const db = getDatabase();
      const user = await createFixtureUser({ email: `disapproved-${Date.now()}@vtb.demo` });

      // Añadir al censo de la elección
      await db.exec(
        'INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)',
        [electionId, user.id],
      );

      // El usuario inicia sesión y obtiene cookies de sesión válidas
      const { agent, csrf } = await loginAsFixture(user.email, user.password);

      // Ahora el admin revoca la aprobación
      await db.exec(
        'UPDATE users SET is_approved = FALSE, approved_by = NULL, approved_at = NULL WHERE id = ?',
        [user.id],
      );

      // 1. Comprobación de elegibilidad
      const eligRes = await agent.get(`/api/elections/${electionId}/eligibility`);
      expect(eligRes.body.eligible).toBe(false);

      // 2. Intento de voto con sesión activa
      const voteRes = await agent
        .post('/api/elections/register-vote')
        .set('X-CSRF-Token', csrf)
        .send({
          electionId,
          candidateId,
          voteHash: `0x${'b'.repeat(64)}`,
        });

      expect(voteRes.status).toBe(403);
      expect(voteRes.body.error).toMatch(/habilitada|activo|encontrado/i);
    });
  });

  describe('Parte B: Revocación de refresh tokens al cambiar o resetear contraseña', () => {
    it('cambiar la contraseña con PATCH /auth/change-password revoca todos los refresh tokens del usuario', async () => {
      const user = await createFixtureUser({ email: `change-pwd-${Date.now()}@vtb.demo`, password: 'OldPassword123!' });

      // 1. Iniciar sesión con agent (almacena cookies vtb_access, vtb_refresh, vtb_csrf)
      const { agent, csrf } = await loginAsFixture(user.email, 'OldPassword123!');

      // 2. Cambiar la contraseña
      const changeRes = await agent
        .patch('/auth/change-password')
        .set('X-CSRF-Token', csrf)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        });

      expect(changeRes.status).toBe(200);

      // 3. Intentar renovar sesión con el refresh token existente en la sesión: debe fallar con 401
      const refreshRes = await agent.post('/auth/refresh');
      expect(refreshRes.status).toBe(401);
    });

    it('resetear la contraseña con POST /auth/reset-password revoca todos los refresh tokens del usuario', async () => {
      const db = getDatabase();
      const user = await createFixtureUser({ email: `reset-pwd-${Date.now()}@vtb.demo`, password: 'OldPassword123!' });

      // 1. Iniciar sesión con agent (almacena cookies)
      const { agent } = await loginAsFixture(user.email, 'OldPassword123!');

      // 2. Generar un token de reseteo en password_reset_tokens
      const { plaintext, hash } = generateSecureToken();
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      await db.exec(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
        [user.id, hash, expiresAt],
      );

      // 3. Consumir el token de reseteo mediante POST público
      const resetRes = await request(app)
        .post('/auth/reset-password')
        .send({
          token: plaintext,
          password: 'BrandNewPassword123!',
        });

      expect(resetRes.status).toBe(200);

      // 4. Intentar renovar sesión con el refresh token de la sesión previa: debe fallar con 401
      const refreshRes = await agent.post('/auth/refresh');
      expect(refreshRes.status).toBe(401);
    });
  });
});
