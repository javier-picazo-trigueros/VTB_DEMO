/**
 * Endurecimiento del panel de administración (auditoría de seguridad, oct-2026).
 *
 * Cada caso nombra el agujero que cierra. Como en admin-election-scope, se prueba
 * también el lado legítimo: un guard que denegara a todos dejaría la suite igual
 * de verde.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createAndLogin, createFixtureUser, createFixtureElection } from './helpers/fixtures.js';

const db = getDatabase();
const DOMINIO = `hardening-${Date.now()}.test`;
const OTRO = `otro-${Date.now()}.test`;
const FUTURO = Math.floor(Date.now() / 1000) + 86_400;

type Actor = Awaited<ReturnType<typeof createAndLogin>>;
let admin: Actor;
let adminSinDominio: Actor;
let superadmin: Actor;
let eleccionFutura: number;

async function nuevaSolicitud(dominio: string) {
  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `sol-${sufijo}@${dominio}`;
  const res = await request(app).post('/registration/request').send({
    fullName: 'Solicitante', email, studentId: `HARD-${sufijo}`,
    password: 'contraseña-larga-123', acceptedTerms: true,
  });
  expect(res.status).toBeLessThan(300);
  const fila = await db.get<{ id: number }>('SELECT id FROM registration_requests WHERE email = ?', [email]);
  return { id: fila!.id, email };
}

beforeAll(async () => {
  admin = await createAndLogin({ role: 'admin', adminDomain: DOMINIO });
  adminSinDominio = await createAndLogin({ role: 'admin', adminDomain: null });
  superadmin = await createAndLogin({ role: 'superadmin', adminDomain: null });

  eleccionFutura = await createFixtureElection({ name: `Hardening ${Date.now()}`, startTime: FUTURO });
  await db.exec('UPDATE elections SET end_time = ? WHERE id = ?', [FUTURO + 3600, eleccionFutura]);
  await db.exec('INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)', [eleccionFutura, DOMINIO]);
});

describe('solicitudes de registro: estado y alcance', () => {
  it('no se aprueba una solicitud que ya no está pendiente → 409', async () => {
    const sol = await nuevaSolicitud(DOMINIO);
    await db.exec("UPDATE registration_requests SET status = 'rejected' WHERE id = ?", [sol.id]);

    const res = await admin.agent.patch(`/admin/registration-requests/${sol.id}`)
      .set('X-CSRF-Token', admin.csrf).send({ action: 'approve' });

    expect(res.status).toBe(409);
    const usuario = await db.get('SELECT id FROM users WHERE email = ?', [sol.email]);
    expect(usuario).toBeFalsy();
  });

  it('un admin sin admin_domain no gestiona solicitudes de nadie → 403', async () => {
    const sol = await nuevaSolicitud(DOMINIO);

    const aprobar = await adminSinDominio.agent.patch(`/admin/registration-requests/${sol.id}`)
      .set('X-CSRF-Token', adminSinDominio.csrf).send({ action: 'approve' });
    const rechazar = await adminSinDominio.agent.patch(`/admin/registration-requests/${sol.id}`)
      .set('X-CSRF-Token', adminSinDominio.csrf).send({ action: 'reject', reason: 'no' });

    expect(aprobar.status).toBe(403);
    expect(rechazar.status).toBe(403);
  });

  it('el admin de su dominio sí aprueba una solicitud pendiente', async () => {
    const sol = await nuevaSolicitud(DOMINIO);
    const res = await admin.agent.patch(`/admin/registration-requests/${sol.id}`)
      .set('X-CSRF-Token', admin.csrf).send({ action: 'approve' });
    expect(res.status).toBe(200);
  });

  it('un admin no gestiona solicitudes de otro dominio → 403', async () => {
    const sol = await nuevaSolicitud(OTRO);
    const res = await admin.agent.patch(`/admin/registration-requests/${sol.id}`)
      .set('X-CSRF-Token', admin.csrf).send({ action: 'reject', reason: 'no' });
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/elections/:id/domains', () => {
  const post = (a: Actor, domain: string, id = eleccionFutura) =>
    a.agent.post(`/admin/elections/${id}/domains`).set('X-CSRF-Token', a.csrf).send({ domain });

  it('un admin de dominio no abre su elección a otro dominio → 403', async () => {
    expect((await post(admin, OTRO)).status).toBe(403);
  });

  it("ni con '*' → 403", async () => {
    expect((await post(admin, '*')).status).toBe(403);
  });

  it('sí puede añadir un subdominio del suyo', async () => {
    expect((await post(admin, `sub.${DOMINIO}`)).status).toBe(200);
  });

  it('el superadmin puede añadir cualquier dominio', async () => {
    // Dominio propio de este caso: con OTRO dependería de que ningún otro test lo
    // hubiera insertado antes (daría 409).
    expect((await post(superadmin, `superadmin-${Date.now()}.test`)).status).toBe(200);
  });

  it('con la votación empezada, el censo está congelado → 409 CENSUS_FROZEN', async () => {
    const abierta = await createFixtureElection({ name: `Abierta ${Date.now()}` });
    await db.exec('INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)', [abierta, DOMINIO]);

    const res = await post(admin, `sub2.${DOMINIO}`, abierta);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CENSUS_FROZEN');
  });
});

describe('POST /admin/elections/:id/voters', () => {
  const post = (a: Actor, email: string) =>
    a.agent.post(`/admin/elections/${eleccionFutura}/voters`).set('X-CSRF-Token', a.csrf).send({ email });

  it('un admin de dominio no censa a una cuenta de otro dominio → 404', async () => {
    const ajeno = await createFixtureUser({ email: `ajeno-${Date.now()}@${OTRO}` });
    expect((await post(admin, ajeno.email)).status).toBe(404);
  });

  it('sí censa a una cuenta de su dominio', async () => {
    const propio = await createFixtureUser({ email: `propio-${Date.now()}@${DOMINIO}` });
    expect((await post(admin, propio.email)).status).toBe(200);
  });
});

describe('GET /admin/elections', () => {
  it('no devuelve la sal efímera, que es media clave del nullifier', async () => {
    const res = await superadmin.agent.get('/admin/elections');
    expect(res.status).toBe(200);
    const eleccion = res.body.elections.find((e: any) => e.id === eleccionFutura);
    expect(eleccion).toBeTruthy();
    expect(eleccion).not.toHaveProperty('ephemeral_salt');
  });
});
