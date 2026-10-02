/**
 * Anonimizar una baja borra también su rastro en email_whitelist y
 * registration_requests (SCRUM-123, la parte que no depende del correo).
 *
 * El fallo, reproducido el 24-sep con el registro que está en producción:
 *   1. Importar un censo mete cada email en email_whitelist, sin marcarlo usado.
 *   2. A los 30 días de una baja, anonymizeDeletedAccounts cambia el email de
 *      la cuenta, pero dejaba la entrada de la lista blanca intacta: con el
 *      nombre y el identificador de la persona, y sin usar.
 *   3. Cualquiera registraba ese email con su propia contraseña y quedaba
 *      aprobado en el acto, metido en las próximas elecciones de su dominio.
 *
 * El último test es esa reproducción, y ahora tiene que fallar el ataque.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDbClient } from '../db/index.js';
import { createAndLogin, loginAsFixture } from './helpers/fixtures.js';
import { anonymizeDeletedAccounts } from '../services/retention.js';

const db = getDbClient();
const hace = (dias: number) =>
  new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');

/** Importa a una persona por CSV, la da de baja y la deja lista para anonimizar. */
async function bajaDeCenso(email: string, domain: string) {
  const admin = await createAndLogin({ role: 'admin', adminDomain: domain });
  const csv = `email,full_name,student_id\n${email},Ana Censo,ANON-${Date.now()}-${Math.random()}\n`;
  const imp = await admin.agent.post('/admin/users/import').set('X-CSRF-Token', admin.csrf)
    .attach('file', Buffer.from(csv), { filename: 'censo.csv', contentType: 'text/csv' });
  expect(imp.status).toBe(200);

  const user = await db.get<{ id: number }>('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  const del = await admin.agent.delete(`/admin/users/${user!.id}`).set('X-CSRF-Token', admin.csrf);
  expect(del.status).toBe(200);
  await db.exec('UPDATE users SET deleted_at = ? WHERE id = ?', [hace(31), user!.id]);
  return user!.id;
}

describe('anonimizar una baja no deja datos de la persona en ninguna tabla', () => {
  it('borra su entrada de la lista blanca y su solicitud de registro', async () => {
    const domain = `anon-${Date.now()}.test`;
    const email = `ana@${domain}`;
    await bajaDeCenso(email, domain);
    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, status, reviewed_at)
       VALUES ('Ana Censo', ?, ?, 'approved', CURRENT_TIMESTAMP)`,
      [email, `REQ-${Date.now()}`],
    );

    expect(await db.get('SELECT id FROM email_whitelist WHERE email = ?', [email])).toBeTruthy();
    expect(await anonymizeDeletedAccounts(db)).toBeGreaterThanOrEqual(1);

    expect(await db.get('SELECT id FROM email_whitelist WHERE email = ?', [email])).toBeFalsy();
    expect(await db.get('SELECT id FROM registration_requests WHERE email = ?', [email])).toBeFalsy();
  });

  it('también si la fila antigua guardó el email con mayúsculas', async () => {
    const domain = `anon-may-${Date.now()}.test`;
    const email = `ana@${domain}`;
    await bajaDeCenso(email, domain);
    await db.exec('UPDATE email_whitelist SET email = ? WHERE email = ?', [email.toUpperCase(), email]);

    await anonymizeDeletedAccounts(db);
    expect(await db.get('SELECT id FROM email_whitelist WHERE LOWER(email) = ?', [email])).toBeFalsy();
  });

  it('no toca la lista blanca de quien no se ha dado de baja', async () => {
    const domain = `anon-otro-${Date.now()}.test`;
    const otra = `otra@${domain}`;
    await db.exec(
      'INSERT INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)',
      [otra, 'Otra', `OTRA-${Date.now()}`, domain],
    );
    await anonymizeDeletedAccounts(db);
    expect(await db.get('SELECT id FROM email_whitelist WHERE email = ?', [otra])).toBeTruthy();
  });
});

describe('el fallo original ya no se reproduce', () => {
  it('tras anonimizar una baja, un tercero que registra ese email no queda aprobado', async () => {
    const domain = `anon-ataque-${Date.now()}.test`;
    const victima = `ana@${domain}`;
    await bajaDeCenso(victima, domain);
    await anonymizeDeletedAccounts(db);

    await request(app).post('/registration/request').send({
      fullName: 'Otra Persona', email: victima, studentId: `X-${Date.now()}`,
      password: 'Contrasena-del-tercero-1', acceptedTerms: true,
    });

    // Sin entrada en la lista blanca, la solicitud espera al administrador.
    expect(await db.get('SELECT id FROM users WHERE email = ?', [victima])).toBeFalsy();
    await expect(loginAsFixture(victima, 'Contrasena-del-tercero-1')).rejects.toThrow();
  });
});
