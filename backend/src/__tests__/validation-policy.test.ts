/**
 * SCRUM-21 — Una sola política de validación de entrada.
 *
 * Criterio de aceptación: un valor rechazado en una ruta es rechazado en
 * todas. Por eso los casos están en tablas y se recorren ruta a ruta: si
 * alguien añade una ruta que crea o cambia contraseñas y no usa
 * utils/validation.ts, lo natural es añadirla aquí, y entonces falla.
 *
 * Antes: 6 caracteres en el registro público y en el cambio de contraseña, 8
 * en /auth/register y en el reset, y ningún mínimo en el alta por
 * administrador (M-4 de AUDITORIA_SEGURIDAD_3.md).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createAndLogin, loginAsFixture } from './helpers/fixtures.js';
import { PASSWORD_MIN_LENGTH } from '../utils/validation.js';

const SHORT = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);   // 7: la que antes pasaba en dos rutas
const OK = 'Valida-' + 'x'.repeat(PASSWORD_MIN_LENGTH);
const BAD_EMAILS = ['a.@b', 'sin-arroba.edu', 'ana@uni'];

let seq = 0;
const unique = (prefix: string) => `${prefix}-${Date.now()}-${++seq}@policy.test.vtb`;
const sid = () => `POL-${Date.now()}-${++seq}`;

type Sender = (fields: { email?: string; password: string }) => Promise<request.Response>;

let admin: Awaited<ReturnType<typeof createAndLogin>>;
let student: Awaited<ReturnType<typeof createAndLogin>>;

beforeAll(async () => {
  admin = await createAndLogin({ role: 'superadmin', email: unique('admin') });
  student = await createAndLogin({ email: unique('student') });
});

/** Todas las rutas que reciben una contraseña NUEVA. */
const passwordRoutes: Record<string, Sender> = {
  'POST /registration/request': ({ email, password }) =>
    request(app).post('/registration/request').send({
      fullName: 'Persona de Prueba', email: email ?? unique('reg'), studentId: sid(),
      password, acceptedTerms: true,
    }),
  'POST /auth/register': ({ email, password }) =>
    request(app).post('/auth/register').send({
      email: email ?? unique('auth-reg'), password, name: 'Persona de Prueba', student_id: sid(),
    }),
  'POST /admin/users': ({ email, password }) =>
    admin.agent.post('/admin/users').set('X-CSRF-Token', admin.csrf).send({
      email: email ?? unique('admin-alta'), password, name: 'Persona de Prueba', student_id: sid(),
    }),
  'PATCH /auth/change-password': ({ password }) =>
    student.agent.patch('/auth/change-password').set('X-CSRF-Token', student.csrf).send({
      currentPassword: student.password, newPassword: password,
    }),
  // Mismo endpoint que activa la cuenta desde la invitación del censo.
  'POST /auth/reset-password': ({ password }) =>
    request(app).post('/auth/reset-password').send({
      token: crypto.randomBytes(32).toString('hex'), password,
    }),
};

/** Las que además reciben el email de una cuenta nueva. */
const emailRoutes = ['POST /registration/request', 'POST /auth/register', 'POST /admin/users'];

describe('SCRUM-21 — la misma contraseña se rechaza en todas las rutas', () => {
  for (const [route, send] of Object.entries(passwordRoutes)) {
    it(`${route} rechaza ${PASSWORD_MIN_LENGTH - 1} caracteres con el mismo mensaje`, async () => {
      const res = await send({ password: SHORT });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);
    });

    it(`${route} no rechaza por longitud una de ${PASSWORD_MIN_LENGTH} o más`, async () => {
      // No todas acaban en 200 — el reset lleva un token inventado y responde
      // 400 por el token —, pero ninguna puede quejarse de la contraseña.
      const res = await send({ password: OK });
      expect(String(res.body.error ?? '')).not.toMatch(/contraseña debe tener/i);
    });
  }
});

describe('SCRUM-21 — el mismo email se rechaza en todas las rutas de alta', () => {
  for (const route of emailRoutes) {
    for (const bad of BAD_EMAILS) {
      it(`${route} rechaza "${bad}"`, async () => {
        const res = await passwordRoutes[route]({ email: bad, password: OK });
        expect(res.status).toBe(400);
      });
    }
  }
});

describe('SCRUM-21 — el email se guarda normalizado y la cuenta puede entrar', () => {
  it('POST /admin/users guarda en minúsculas y sin espacios, y el login funciona', async () => {
    const lower = unique('mayusculas');
    const res = await passwordRoutes['POST /admin/users']({ email: `  ${lower.toUpperCase()} `, password: OK });
    expect(res.status).toBe(200);

    const row = await getDatabase().get<{ email: string }>('SELECT email FROM users WHERE id = ?', [res.body.userId]);
    expect(row?.email).toBe(lower);
    // Antes se guardaba tal cual y el login, que busca en minúsculas, no la encontraba nunca.
    await expect(loginAsFixture(lower, OK)).resolves.toBeDefined();
  });

  it('POST /registration/request guarda la solicitud en minúsculas', async () => {
    const lower = unique('solicitud');
    const res = await passwordRoutes['POST /registration/request']({ email: lower.toUpperCase(), password: OK });
    expect(res.status).toBe(200);

    const row = await getDatabase().get<{ email: string }>(
      'SELECT email FROM registration_requests WHERE email = ?', [lower],
    );
    expect(row?.email).toBe(lower);
  });
});

describe('SCRUM-21 — resto del registro público', () => {
  it('rechaza un curso que no es un número, en vez de guardar NaN', async () => {
    const res = await request(app).post('/registration/request').send({
      fullName: 'Persona de Prueba', email: unique('curso'), studentId: sid(),
      password: OK, acceptedTerms: true, year: 'abc',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El curso no es válido');
  });

  it('sigue exigiendo la casilla de términos', async () => {
    const res = await request(app).post('/registration/request').send({
      fullName: 'Persona de Prueba', email: unique('terminos'), studentId: sid(), password: OK,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/aceptar los Términos/);
  });
});

describe('SCRUM-21 — la ruta duplicada de alta ya no existe', () => {
  it('POST /auth/admin/register responde 404', async () => {
    const res = await admin.agent.post('/auth/admin/register').set('X-CSRF-Token', admin.csrf).send({
      email: unique('legacy'), password: OK, name: 'Persona de Prueba', student_id: sid(),
    });
    expect(res.status).toBe(404);
  });
});

describe('SCRUM-21 — el frontend avisa con el mismo mínimo que aplica el servidor', () => {
  it('frontend/src/utils/passwordPolicy.js coincide con utils/validation.ts', () => {
    const file = path.resolve(__dirname, '../../../frontend/src/utils/passwordPolicy.js');
    const match = fs.readFileSync(file, 'utf8').match(/PASSWORD_MIN_LENGTH\s*=\s*(\d+)/);
    expect(Number(match?.[1])).toBe(PASSWORD_MIN_LENGTH);
  });

  it('ningún formulario del frontend lleva su propio mínimo escrito a mano', () => {
    const pages = ['ChangePassword.jsx', 'UserProfile.jsx', 'RegisterRequest.jsx', 'ResetPassword.jsx'];
    for (const page of pages) {
      const src = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/pages', page), 'utf8');
      expect(src, page).toContain('PASSWORD_MIN_LENGTH');
      expect(src, page).not.toMatch(/password\w*\.length\s*<\s*\d/i);
      expect(src, page).not.toMatch(/\.next\.length\s*<\s*\d/);
    }
  });
});
