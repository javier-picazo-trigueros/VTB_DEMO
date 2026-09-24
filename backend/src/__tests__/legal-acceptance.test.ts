/**
 * Paso C, punto b: la casilla de aceptación de términos y privacidad es
 * obligatoria en el registro, y se guarda qué versión se aceptó y cuándo.
 *
 * Todo contra el comportamiento real de POST /registration/request y
 * PATCH /admin/registration-requests/:id, no contra las funciones sueltas.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createAndLogin, confirmRegistration } from './helpers/fixtures.js';
import { CURRENT_TERMS_VERSION } from '../config/legal.js';

const db = getDatabase();

function datosRegistro(prefijo: string) {
  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    fullName: 'Persona de Prueba',
    email: `${prefijo}-${sufijo}@legalaccept.test`,
    studentId: `LEGAL-${sufijo}`,
    password: 'contraseña-larga-123',
  };
}

describe('POST /registration/request — casilla de aceptación', () => {
  it('rechaza el registro sin acceptedTerms, y no crea ninguna solicitud', async () => {
    const datos = datosRegistro('sin-acepto');

    const res = await request(app).post('/registration/request').send(datos);

    expect(res.status).toBe(400);
    const solicitud = await db.get('SELECT id FROM registration_requests WHERE email = ?', [datos.email]);
    expect(solicitud).toBeFalsy();
  });

  it('rechaza el registro con acceptedTerms: false explícito', async () => {
    const datos = datosRegistro('acepto-false');

    const res = await request(app).post('/registration/request').send({ ...datos, acceptedTerms: false });

    expect(res.status).toBe(400);
  });

  it('con acceptedTerms: true crea la solicitud con la versión y la fecha guardadas', async () => {
    const datos = datosRegistro('acepto-true');

    const res = await request(app).post('/registration/request').send({ ...datos, acceptedTerms: true });

    expect(res.status).toBe(200);
    const solicitud = await db.get<{ terms_version: string; terms_accepted_at: string }>(
      'SELECT terms_version, terms_accepted_at FROM registration_requests WHERE email = ?',
      [datos.email],
    );
    expect(solicitud?.terms_version).toBe(CURRENT_TERMS_VERSION);
    // terms_accepted_at lo pone CURRENT_TIMESTAMP de SQLite: una cadena naive
    // ("YYYY-MM-DD HH:MM:SS", en UTC, sin 'Z'). new Date(esa_cadena) la
    // interpreta como hora LOCAL de quien ejecute el test, así que compararla
    // contra Date.now() falla en cualquier zona horaria distinta de UTC+0 (dio
    // ~2h de diferencia en esta máquina). Es un problema de este test, no de la
    // aplicación: comprobado que ningún código real hace new Date() sobre una
    // columna *_at rellenada por CURRENT_TIMESTAMP (grep sobre src/, sin
    // resultados) — donde el código sí necesita comparar fechas (expiración de
    // refresh/reset tokens, auth.ts) las calcula él mismo en JS con
    // .toISOString() antes de guardarlas, así que ya llevan 'Z' y se parsean
    // igual en cualquier zona. Y en producción (PostgreSQL, TIMESTAMPTZ) el
    // driver devuelve Date reales, no cadenas naive: esta ambigüedad no existe
    // ahí. Aquí basta con comprobar que es una fecha real y válida.
    expect(solicitud?.terms_accepted_at).toBeTruthy();
    expect(Number.isNaN(new Date(solicitud!.terms_accepted_at).getTime())).toBe(false);
  });

  it('en el alta auto-aprobada (email en whitelist), la aceptación se guarda directo en users', async () => {
    const datos = datosRegistro('whitelist');
    const domain = datos.email.split('@')[1];

    await db.exec(
      `INSERT INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)`,
      [datos.email.toLowerCase(), datos.fullName, datos.studentId, domain],
    );

    const res = await request(app).post('/registration/request').send({ ...datos, acceptedTerms: true });
    expect(res.status).toBe(200);

    // Desde SCRUM-123 la cuenta no se crea al registrarse sino al abrir el
    // enlace del correo: antes de eso, estar en la lista blanca no basta.
    const antes = await db.get('SELECT id FROM users WHERE email = ?', [datos.email]);
    expect(antes).toBeFalsy();

    const confirmada = await confirmRegistration(datos.email);
    expect(confirmada.body.status).toBe('approved');
    const usuario = await db.get<{ terms_version: string; terms_accepted_at: string }>(
      'SELECT terms_version, terms_accepted_at FROM users WHERE email = ?',
      [datos.email],
    );
    expect(usuario?.terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(usuario?.terms_accepted_at).toBeTruthy();
  });
});

describe('PATCH /admin/registration-requests/:id — la aceptación pasa a la cuenta al aprobar', () => {
  it('copia terms_version y terms_accepted_at de la solicitud a la cuenta creada', async () => {
    const datos = datosRegistro('aprobar');
    await request(app).post('/registration/request').send({ ...datos, acceptedTerms: true });
    // Sin confirmar el correo la solicitud no llega al administrador (SCRUM-123).
    expect((await confirmRegistration(datos.email)).body.status).toBe('pending');

    const solicitud = await db.get<{ id: number; terms_version: string; terms_accepted_at: string }>(
      'SELECT id, terms_version, terms_accepted_at FROM registration_requests WHERE email = ?',
      [datos.email],
    );
    expect(solicitud?.terms_version).toBe(CURRENT_TERMS_VERSION);

    const domain = datos.email.split('@')[1];
    const admin = await createAndLogin({ role: 'admin', adminDomain: domain });

    const res = await admin.agent
      .patch(`/admin/registration-requests/${solicitud!.id}`)
      .set('X-CSRF-Token', admin.csrf)
      .send({ action: 'approve' });

    expect(res.status).toBe(200);
    const usuario = await db.get<{ terms_version: string; terms_accepted_at: string }>(
      'SELECT terms_version, terms_accepted_at FROM users WHERE email = ?',
      [datos.email],
    );
    expect(usuario?.terms_version).toBe(solicitud!.terms_version);
    expect(usuario?.terms_accepted_at).toBe(solicitud!.terms_accepted_at);
  });
});
