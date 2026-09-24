/**
 * SCRUM-123 — El registro público confirma el email antes de crear o aprobar
 * nada.
 *
 * Criterio de aceptación: ninguna cuenta queda aprobada sin que alguien haya
 * demostrado controlar su email, y la anonimización no deja datos de la
 * persona en ninguna tabla.
 *
 * El último bloque es la reproducción del fallo original, que ahora tiene que
 * fallar: tras anonimizar una baja, un tercero registraba ese email y quedaba
 * aprobado con su propia contraseña.
 */
import crypto from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDbClient } from '../db/index.js';
import {
  createAndLogin, createFixtureUser, loginAsFixture,
  confirmRegistration, issueRegistrationVerifyToken,
} from './helpers/fixtures.js';
import {
  anonymizeDeletedAccounts, purgeUnverifiedRegistrationRequests, UNVERIFIED_REQUESTS_RETENTION_HOURS,
} from '../services/retention.js';

const db = getDbClient();
const PASSWORD = 'Contrasena-de-prueba-1';

let seq = 0;
const email = (prefix: string, domain = 'verif.test') => `${prefix}-${Date.now()}-${++seq}@${domain}`;
const register = (address: string, password = PASSWORD) =>
  request(app).post('/registration/request').send({
    fullName: 'Persona de Prueba', email: address, studentId: `VER-${Date.now()}-${++seq}`,
    password, acceptedTerms: true,
  });

const hace = (horas: number) =>
  new Date(Date.now() - horas * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

describe('SCRUM-123 — el registro responde lo mismo pase lo que pase', () => {
  it('email nuevo, cuenta existente, en lista blanca, solicitud pendiente y sin confirmar: misma respuesta', async () => {
    const nuevo = email('nuevo');

    const conCuenta = (await createFixtureUser({ email: email('con-cuenta') })).email;

    const enLista = email('lista', 'listablanca.test');
    await db.exec(
      'INSERT INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)',
      [enLista, 'Censo', `WL-${seq}`, 'listablanca.test'],
    );

    const pendiente = email('pendiente');
    await register(pendiente);
    await confirmRegistration(pendiente);

    const sinConfirmar = email('sin-confirmar');
    await register(sinConfirmar);

    const respuestas = [];
    for (const address of [nuevo, conCuenta, enLista, pendiente, sinConfirmar]) {
      const res = await register(address);
      respuestas.push({ status: res.status, body: res.body });
    }
    expect(respuestas[0].status).toBe(200);
    for (const r of respuestas) expect(r).toEqual(respuestas[0]);
    // Siete registros con bcrypt: con la suite entera en paralelo en una
    // máquina cargada se acerca al límite por defecto de 20 s.
  }, 60_000);

  it('a quien ya tiene cuenta le llega un aviso, no un enlace', async () => {
    const user = await createFixtureUser({ email: email('aviso') });
    await register(user.email);
    await vi.waitFor(async () => {
      const row = await db.get<{ template_name: string }>(
        "SELECT template_name FROM email_log WHERE recipient = ? AND template_name = 'account_exists'",
        [user.email],
      );
      expect(row).toBeTruthy();
    }, { timeout: 2000, interval: 20 });
  });

  it('el correo del enlace se encola sin cuerpo: el token no se guarda en claro', async () => {
    const address = email('cola');
    await register(address);
    let row: { html_body: string | null; text_body: string | null; template_data: string | null } | undefined;
    await vi.waitFor(async () => {
      row = await db.get(
        "SELECT html_body, text_body, template_data FROM email_log WHERE recipient = ? AND template_name = 'registration_verify'",
        [address],
      );
      expect(row).toBeTruthy();
    }, { timeout: 2000, interval: 20 });
    expect(row!.html_body).toBeNull();
    expect(row!.text_body).toBeNull();
    expect(row!.template_data).not.toMatch(/token/i);
  });
});

describe('SCRUM-123 — nada se crea hasta confirmar el correo', () => {
  it('estar en la lista blanca ya no basta: sin confirmar, no hay cuenta', async () => {
    const address = email('lista', 'lista2.test');
    await db.exec(
      'INSERT INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)',
      [address, 'Censo', `WL2-${seq}`, 'lista2.test'],
    );
    await register(address);
    expect(await db.get('SELECT id FROM users WHERE email = ?', [address])).toBeFalsy();
    await expect(loginAsFixture(address, PASSWORD)).rejects.toThrow();
  });

  it('en lista blanca + confirmado: cuenta activa con su contraseña, y la entrada queda usada', async () => {
    const address = email('aprobada', 'lista3.test');
    await db.exec(
      'INSERT INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)',
      [address, 'Censo', `WL3-${seq}`, 'lista3.test'],
    );
    await register(address);
    const res = await confirmRegistration(address);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');

    await expect(loginAsFixture(address, PASSWORD)).resolves.toBeDefined();
    const wl = await db.get<{ used: number | boolean }>('SELECT used FROM email_whitelist WHERE email = ?', [address]);
    expect(Boolean(Number(wl!.used))).toBe(true);
  });

  it('fuera de la lista blanca + confirmado: pasa al administrador, sin cuenta todavía', async () => {
    const address = email('pendiente');
    await register(address);
    const res = await confirmRegistration(address);
    expect(res.body.status).toBe('pending');
    expect(await db.get('SELECT id FROM users WHERE email = ?', [address])).toBeFalsy();
  });
});

describe('SCRUM-123 — el enlace', () => {
  it('es de un solo uso', async () => {
    const address = email('un-uso');
    await register(address);
    const token = await issueRegistrationVerifyToken(address);
    expect((await request(app).post('/registration/verify').send({ token })).status).toBe(200);
    expect((await request(app).post('/registration/verify').send({ token })).status).toBe(400);
  });

  it('caduca', async () => {
    const address = email('caduca');
    await register(address);
    const token = await issueRegistrationVerifyToken(address);
    await db.exec(
      'UPDATE registration_requests SET verify_expires_at = ? WHERE email = ?',
      [new Date(Date.now() - 1000).toISOString(), address],
    );
    const res = await request(app).post('/registration/verify').send({ token });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caducado/);
  });

  it('un token inventado o mal formado no sirve', async () => {
    for (const token of [crypto.randomBytes(32).toString('hex'), 'abc', undefined]) {
      expect((await request(app).post('/registration/verify').send({ token })).status).toBe(400);
    }
  });

  it('reenviar el correo invalida el enlace anterior', async () => {
    const address = email('reenvio');
    await register(address);
    const primero = await issueRegistrationVerifyToken(address);
    const segundo = await issueRegistrationVerifyToken(address);
    expect((await request(app).post('/registration/verify').send({ token: primero })).status).toBe(400);
    expect((await request(app).post('/registration/verify').send({ token: segundo })).status).toBe(200);
  });

  it('una solicitud vigente no se sustituye: un tercero no puede cambiarle la contraseña', async () => {
    const address = email('no-pisar', 'lista4.test');
    await db.exec(
      'INSERT INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)',
      [address, 'Censo', `WL4-${seq}`, 'lista4.test'],
    );
    await register(address, 'La-de-la-persona-1');
    await register(address, 'La-del-tercero-22');
    await confirmRegistration(address);
    await expect(loginAsFixture(address, 'La-de-la-persona-1')).resolves.toBeDefined();
    await expect(loginAsFixture(address, 'La-del-tercero-22')).rejects.toThrow();
  });

  it('una solicitud rechazada se puede volver a presentar (antes daba 500)', async () => {
    const address = email('rechazada');
    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, status, reviewed_at)
       VALUES ('Rechazada', ?, ?, 'rejected', CURRENT_TIMESTAMP)`,
      [address, `REJ-${seq}`],
    );
    const res = await register(address);
    expect(res.status).toBe(200);
    const row = await db.get<{ status: string }>('SELECT status FROM registration_requests WHERE email = ?', [address]);
    expect(row!.status).toBe('unverified');
  });
});

describe('SCRUM-123 — el panel no ve lo que nadie ha confirmado', () => {
  it('sin confirmar no aparece ni con status=all, y no se puede aprobar', async () => {
    const domain = `panel-${Date.now()}.test`;
    const admin = await createAndLogin({ role: 'admin', adminDomain: domain });
    const address = email('panel', domain);
    await register(address);
    const { id } = (await db.get<{ id: number }>('SELECT id FROM registration_requests WHERE email = ?', [address]))!;

    const lista = await admin.agent.get('/admin/registration-requests?status=all');
    expect(lista.body.requests.map((r: any) => r.email)).not.toContain(address);

    const aprobar = await admin.agent.patch(`/admin/registration-requests/${id}`)
      .set('X-CSRF-Token', admin.csrf).send({ action: 'approve' });
    expect(aprobar.status).toBe(404);
    expect(await db.get('SELECT id FROM users WHERE email = ?', [address])).toBeFalsy();

    // Confirmada, sí llega, y solo se revisa una vez.
    await confirmRegistration(address);
    const lista2 = await admin.agent.get('/admin/registration-requests?status=pending');
    expect(lista2.body.requests.map((r: any) => r.email)).toContain(address);
    const ok = await admin.agent.patch(`/admin/registration-requests/${id}`)
      .set('X-CSRF-Token', admin.csrf).send({ action: 'approve' });
    expect(ok.status).toBe(200);
    const otraVez = await admin.agent.patch(`/admin/registration-requests/${id}`)
      .set('X-CSRF-Token', admin.csrf).send({ action: 'approve' });
    expect(otraVez.status).toBe(409);
  });
});

describe('SCRUM-123 — conservación', () => {
  it(`borra las solicitudes sin confirmar de hace más de ${UNVERIFIED_REQUESTS_RETENTION_HOURS} horas`, async () => {
    const vieja = email('vieja');
    const reciente = email('reciente');
    await register(vieja);
    await register(reciente);
    await db.exec('UPDATE registration_requests SET created_at = ? WHERE email = ?',
      [hace(UNVERIFIED_REQUESTS_RETENTION_HOURS + 1), vieja]);

    expect(await purgeUnverifiedRegistrationRequests(db)).toBeGreaterThanOrEqual(1);
    expect(await db.get('SELECT id FROM registration_requests WHERE email = ?', [vieja])).toBeFalsy();
    expect(await db.get('SELECT id FROM registration_requests WHERE email = ?', [reciente])).toBeTruthy();
  });
});

describe('SCRUM-123 — el fallo original ya no se reproduce', () => {
  it('tras anonimizar una baja no queda nada de la persona, y un tercero no ocupa su sitio', async () => {
    const domain = `baja-${Date.now()}.test`;
    const admin = await createAndLogin({ role: 'admin', adminDomain: domain });
    const victima = `ana@${domain}`;
    const csv = `email,full_name,student_id\n${victima},Ana Censo,BAJA-${Date.now()}\n`;
    const imp = await admin.agent.post('/admin/users/import').set('X-CSRF-Token', admin.csrf)
      .attach('file', Buffer.from(csv), { filename: 'censo.csv', contentType: 'text/csv' });
    expect(imp.status).toBe(200);

    const { id } = (await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [victima]))!;
    await admin.agent.delete(`/admin/users/${id}`).set('X-CSRF-Token', admin.csrf);
    await db.exec('UPDATE users SET deleted_at = ? WHERE id = ?', [hace(31 * 24), id]);
    expect(await anonymizeDeletedAccounts(db)).toBeGreaterThanOrEqual(1);

    // La anonimización ya no deja el nombre de Ana en la lista blanca.
    expect(await db.get('SELECT id FROM email_whitelist WHERE email = ?', [victima])).toBeFalsy();

    // Un tercero se registra con su email: no hay cuenta, y aunque consiguiera
    // abrir el enlace (llega al buzón de Ana), sin lista blanca iría al
    // administrador, no aprobado.
    const res = await register(victima, 'Contrasena-del-tercero-1');
    expect(res.status).toBe(200);
    expect(await db.get('SELECT id FROM users WHERE email = ?', [victima])).toBeFalsy();
    const confirmada = await confirmRegistration(victima);
    expect(confirmada.body.status).toBe('pending');
    await expect(loginAsFixture(victima, 'Contrasena-del-tercero-1')).rejects.toThrow();
  });
});
