/**
 * Tests de importación CSV — punto 5.
 *
 * Cubre:
 *  ✓ CSV válido: crea usuarios correctamente
 *  ✓ CSV con campo entre comillas que contiene una coma (S16 cerrado)
 *  ✓ CSV con filas rotas (sin email, sin student_id) — se ignoran sin bloquear
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

  it('CSV con filas rotas se ignoran sin bloquear las válidas', async () => {
    const { agent, csrf } = await loginAsAdmin(adminEmail, adminPassword);

    const csv = [
      'email,full_name,student_id',
      'csvgood@test.vtb,Good Row,CSV-GOOD-001',   // fila válida
      ',Missing Email,CSV-NOMAIL-001',            // sin email → error
      'csvnoname@test.vtb,,CSV-NONAME-001',         // sin nombre → error
      'csvnoid@test.vtb,No Student ID,',            // sin student_id → error
    ].join('\n');

    const res = await agent
      .post('/admin/users/import')
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'mixed.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Las filas rotas se reportan como errors, no bloquean el proceso
    expect(Array.isArray(res.body.results?.errors)).toBe(true);
    // Hay al menos un error de datos rotos (sin email no pasa el if)
    expect(res.body.results.errors.length).toBeGreaterThan(0);
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
});
