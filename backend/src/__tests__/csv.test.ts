/**
 * Tests de importación CSV — punto 5.
 *
 * Cubre:
 *  ✓ CSV válido: crea usuarios correctamente
 *  ✓ CSV con campo entre comillas que contiene una coma (S16 cerrado)
 *  ✓ CSV con filas rotas — se rechaza el fichero entero (atomicidad)
 *  ✓ CSV vacío — devuelve 0 creados
 *  ✓ Requiere autenticación (401 sin cookie)
 *
 * La respuesta del endpoint tiene la forma:
 *   { success: true, results: { created: number, skipped: number, errors: string[] } }
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { createFixtureUser, loginAsFixture } from './helpers/fixtures.js';
import { getDbClient } from '../db/index.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('POST /admin/users/import — CSV import', () => {
  let adminEmail: string;
  let adminPassword: string;

  beforeAll(async () => {
    const admin = await createFixtureUser({ role: 'admin', adminDomain: 'test.vtb' });
    adminEmail = admin.email;
    adminPassword = admin.password;
  });

  async function loginAsAdmin(email: string, password: string) {
    return loginAsFixture(email, password);
  }

  it('CSV válido crea usuarios correctamente', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);

    const csv = [
      'email,full_name,student_id',
      'csvtest1@test.vtb,CSV Test User One,CSV-TEST-001',
      'csvtest2@test.vtb,CSV Test User Two,CSV-TEST-002',
    ].join('\n');

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.results?.created).toBe('number');
    expect(res.body.results.created).toBeGreaterThan(0);
  });

  it('S16 — campo con coma entre comillas se parsea correctamente', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);

    // "García, Juan" tiene una coma dentro de las comillas.
    // Un split(',') simple rompería esta fila en tres columnas dando
    // email=csv.quoted@test.vtb, full_name="García", student_id=" Juan" → error de datos.
    // Con csv-parse el campo se procesa correctamente.
    const csv = [
      'email,full_name,student_id',
      '"csv.quoted@test.vtb","García, Juan",CSV-QUOTED-001',
    ].join('\n');

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'quoted.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // El usuario se crea o queda skipped (no errores de parse) → S16 OK
    expect(res.body.results.created + res.body.results.skipped).toBeGreaterThan(0);
  });

  // ── Atomicidad ────────────────────────────────────────────────────────────
  //
  // La importación pasó de "salta las filas rotas y sigue" a "o entra el fichero
  // entero, o no entra nada". El motivo: con el bucle anterior, un CSV de 800
  // personas que fallara en la 300 dejaba 299 cuentas creadas y el censo a
  // medias, sin forma de saber desde fuera por dónde se había quedado.
  //
  // El precio es que una sola fila mala aborta el fichero. A cambio, el estado
  // tras un error es siempre el mismo: el de antes de empezar.

  const CSV_CON_FILAS_ROTAS = [
    'email,full_name,student_id',
    'csvgood@test.vtb,Good Row,CSV-GOOD-001',   // fila válida
    ',Missing Email,CSV-NOMAIL-001',            // sin email      → error
    'csvnoname@test.vtb,,CSV-NONAME-001',       // sin nombre     → error
    'csvnoid@test.vtb,No Student ID,',          // sin student_id → error
  ].join('\n');

  it('un CSV con filas rotas se rechaza entero y reporta TODOS los errores', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(CSV_CON_FILAS_ROTAS), { filename: 'mixed.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    // Las tres, no solo la primera: la validación recorre el fichero completo
    // antes de decidir, así que el administrador las corrige de una sola pasada.
    expect(res.body.errors.length).toBe(3);
    // Y con el número de línea del CSV, para poder localizarlas.
    expect(res.body.errors.every((e: string) => /^Línea \d+:/.test(e))).toBe(true);
  });

  it('la fila válida de un CSV rechazado NO llega a crearse', async () => {
    // Este es el test que de verdad prueba la atomicidad: csvgood@test.vtb es
    // una fila perfectamente válida que va ANTES de las rotas. Con el bucle
    // anterior se creaba igual. Ahora no debe existir.
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);

    await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(CSV_CON_FILAS_ROTAS), { filename: 'mixed.csv', contentType: 'text/csv' });

    const db = getDbClient();
    const row = await db.get('SELECT id FROM users WHERE email = ?', ['csvgood@test.vtb']);
    expect(row, 'csvgood@test.vtb no debería existir: el CSV se rechazó entero').toBeUndefined();
  });

  it('un CSV correcto entero sí se importa y queda en base de datos', async () => {
    // Contrapartida: comprobar que el camino feliz sigue escribiendo.
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);
    const suffix = Date.now();
    const csv = [
      'email,full_name,student_id',
      `atomic-a-${suffix}@test.vtb,Atomic A,ATOM-A-${suffix}`,
      `atomic-b-${suffix}@test.vtb,Atomic B,ATOM-B-${suffix}`,
    ].join('\n');

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'ok.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.results.created).toBe(2);

    const db = getDbClient();
    for (const e of [`atomic-a-${suffix}@test.vtb`, `atomic-b-${suffix}@test.vtb`]) {
      const row = await db.get('SELECT id FROM users WHERE email = ?', [e]);
      expect(row, `${e} debería existir`).toBeDefined();
    }
  });

  it('un email repetido dentro del mismo fichero se rechaza', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);
    const suffix = Date.now();
    const csv = [
      'email,full_name,student_id',
      `dup-${suffix}@test.vtb,Dup One,DUP-1-${suffix}`,
      `dup-${suffix}@test.vtb,Dup Two,DUP-2-${suffix}`,
    ].join('\n');

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'dup.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => /repetido/.test(e))).toBe(true);
  });

  it('CSV vacío (solo cabecera) devuelve 0 creados', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);

    const csv = 'email,full_name,student_id\n'; // solo cabecera, sin filas

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'empty.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results?.created).toBe(0);
  });

  it('requiere autenticación (401 sin cookie)', async () => {
    const csv = csvBuffer('email,full_name,student_id\ntest@test.vtb,T,T-001');

    const res = await request(app)
      .post('/admin/users/import')
      .attach('file', csv, { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(401);
  });

  // ── Invitaciones (SCRUM-11) ───────────────────────────────────────────────
  //
  // Esta ruta creaba las cuentas con `must_change_password` y una contraseña
  // temporal aleatoria, y no enviaba nada: 800 altas sin una sola forma de
  // entrar. La hermana /elections/:id/import-voters sí invitaba desde el
  // principio, y ese hueco es lo que estos tests fijan.

  it('encola una invitación por alta nueva, y ninguna para quien ya existía', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);
    const db = getDbClient();
    const s = Date.now();

    // La primera importación crea a A. La segunda repite A y añade B: A ya
    // existe, así que solo B debe recibir invitación.
    const primera = [
      'email,full_name,student_id',
      `inv-a-${s}@test.vtb,Inv A,INV-A-${s}`,
    ].join('\n');

    const res1 = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(primera), { filename: 'inv1.csv', contentType: 'text/csv' });

    expect(res1.status).toBe(200);
    expect(res1.body.results.created).toBe(1);
    expect(res1.body.results.invited).toBe(1);

    const segunda = [
      'email,full_name,student_id',
      `inv-a-${s}@test.vtb,Inv A,INV-A-${s}`,
      `inv-b-${s}@test.vtb,Inv B,INV-B-${s}`,
    ].join('\n');

    const res2 = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(segunda), { filename: 'inv2.csv', contentType: 'text/csv' });

    expect(res2.status).toBe(200);
    expect(res2.body.results.created).toBe(1);
    expect(res2.body.results.skipped).toBe(1);
    expect(res2.body.results.invited, 'a quien ya tenía cuenta no se le reinvita').toBe(1);

    // Una invitación por persona, ni más ni menos.
    for (const email of [`inv-a-${s}@test.vtb`, `inv-b-${s}@test.vtb`]) {
      const row = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM email_log WHERE recipient = ? AND template_name = 'invitation'",
        [email],
      );
      expect(Number(row?.n ?? 0), `${email} debería tener exactamente 1 invitación`).toBe(1);
    }
  });

  it('la invitación del censo general va sin elección y sin el enlace en email_log', async () => {
    // P1-7: en la cola solo van los datos para renderizar; el token lo emite el
    // worker al enviar. Y sin electionName, porque esta ruta importa el censo de
    // la institución entera, no una elección concreta.
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);
    const db = getDbClient();
    const s = Date.now();

    const csv = [
      'email,full_name,student_id',
      `noelec-${s}@test.vtb,Sin Eleccion,NOELEC-${s}`,
    ].join('\n');

    await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'noelec.csv', contentType: 'text/csv' });

    const user = await db.get<{ id: number }>(
      'SELECT id FROM users WHERE email = ?', [`noelec-${s}@test.vtb`],
    );

    const row = await db.get<{
      html_body: string | null; text_body: string | null; template_data: string | null; subject: string;
    }>(
      "SELECT html_body, text_body, template_data, subject FROM email_log WHERE recipient = ? AND template_name = 'invitation'",
      [`noelec-${s}@test.vtb`],
    );

    expect(row, 'debería haber una invitación encolada').toBeTruthy();
    expect(row!.html_body).toBeNull();
    expect(row!.text_body).toBeNull();
    expect(row!.template_data).not.toMatch(/token/i);

    const data = JSON.parse(row!.template_data!);
    expect(data.userId).toBe(user!.id);
    expect(data.electionName, 'el censo general no nombra ninguna elección').toBeUndefined();

    // El asunto se guarda al encolar, así que ya refleja la variante sin elección.
    expect(row!.subject).not.toMatch(/votar en ""/);
    expect(row!.subject).toMatch(/acceso a VoteTrustBlock/i);
  });

  it('un CSV rechazado en validación no encola ninguna invitación', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);
    const db = getDbClient();
    const s = Date.now();

    const csv = [
      'email,full_name,student_id',
      `rej-a-${s}@test.vtb,Rej A,REJ-A-${s}`,   // válida, pero el fichero cae entero
      `,Sin Email,REJ-B-${s}`,                  // → error de validación
    ].join('\n');

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'rej.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);

    const row = await db.get<{ n: number }>(
      'SELECT COUNT(*) as n FROM email_log WHERE recipient LIKE ?', [`rej-%-${s}@test.vtb`],
    );
    expect(Number(row?.n ?? 0), 'no se importó nada, así que no debe salir ningún correo').toBe(0);
  });
});
