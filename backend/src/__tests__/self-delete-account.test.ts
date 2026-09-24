/**
 * Paso C, punto d: baja de cuenta con anonimización diferida (DELETE /auth/me).
 *
 * Contra el comportamiento real de la ruta y de la sesión (cookies), no
 * contra las funciones sueltas: se comprueba que la sesión queda inválida
 * de verdad (login y /auth/me fallan después), no solo que la fila cambió.
 */
import { describe, it, expect } from 'vitest';
import { getDatabase } from '../config/database.js';
import { createAndLogin } from './helpers/fixtures.js';

const db = getDatabase();

describe('DELETE /auth/me', () => {
  it('sin contraseña, responde 400 y no toca la cuenta', async () => {
    const user = await createAndLogin();

    const res = await user.agent.delete('/auth/me').set('X-CSRF-Token', user.csrf).send({});

    expect(res.status).toBe(400);
    const fila = await db.get<{ deleted_at: string | null }>('SELECT deleted_at FROM users WHERE id = ?', [user.id]);
    expect(fila?.deleted_at).toBeFalsy();
  });

  it('con la contraseña incorrecta, responde 401 y no toca la cuenta', async () => {
    const user = await createAndLogin();

    const res = await user.agent
      .delete('/auth/me')
      .set('X-CSRF-Token', user.csrf)
      .send({ password: 'esto-no-es-la-contraseña' });

    expect(res.status).toBe(401);
    const fila = await db.get<{ deleted_at: string | null }>('SELECT deleted_at FROM users WHERE id = ?', [user.id]);
    expect(fila?.deleted_at).toBeFalsy();
  });

  it('con la contraseña correcta: marca deleted_at, revoca la sesión y bloquea login', async () => {
    const user = await createAndLogin();

    const res = await user.agent
      .delete('/auth/me')
      .set('X-CSRF-Token', user.csrf)
      .send({ password: user.password });

    expect(res.status).toBe(200);

    const fila = await db.get<{ deleted_at: string | null }>('SELECT deleted_at FROM users WHERE id = ?', [user.id]);
    expect(fila?.deleted_at).toBeTruthy();

    // La cookie de sesión que ya tenía el agente queda inservible: /auth/me
    // debe rechazarla, no solo devolver datos "viejos" cacheados en el token.
    const meTrasBaja = await user.agent.get('/auth/me');
    expect(meTrasBaja.status).toBe(401);

    // Y un login nuevo con la misma contraseña ya no funciona (WHERE
    // deleted_at IS NULL en /auth/login).
    const reLogin = await user.agent.post('/auth/login').send({ email: user.email, password: user.password });
    expect(reLogin.status).toBe(401);
  });

  it('no anonimiza al momento: el nombre y el email siguen legibles justo después de la baja', async () => {
    const user = await createAndLogin({ name: 'Nombre Legible De Prueba' });

    await user.agent.delete('/auth/me').set('X-CSRF-Token', user.csrf).send({ password: user.password });

    const fila = await db.get<{ email: string; name: string; anonymized_at: string | null }>(
      'SELECT email, name, anonymized_at FROM users WHERE id = ?',
      [user.id],
    );
    expect(fila?.email).toBe(user.email);
    expect(fila?.name).toBe('Nombre Legible De Prueba');
    expect(fila?.anonymized_at).toBeFalsy();
  });

  it('con deleted_at ya puesto por otra vía (p. ej. un admin) mientras el JWT sigue vivo, responde 404', async () => {
    // El JWT de acceso es autocontenido y no consulta la base en cada
    // petición (requireAuth solo lo descodifica); la propia ruta es la que
    // comprueba deleted_at antes de tramitar la baja. Se simula el hueco de
    // hasta 15 minutos en el que la cuenta ya está de baja mientras el access
    // token todavía es válido.
    const user = await createAndLogin();
    await db.exec('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const res = await user.agent
      .delete('/auth/me')
      .set('X-CSRF-Token', user.csrf)
      .send({ password: user.password });

    expect(res.status).toBe(404);
  });
});
