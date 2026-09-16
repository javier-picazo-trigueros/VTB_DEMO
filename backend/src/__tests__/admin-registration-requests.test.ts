/**
 * El listado de solicitudes de registro no puede llevar el hash de la
 * contraseña al cliente (H-2).
 *
 * La consulta era `SELECT * FROM registration_requests`, y el genérico de
 * `db.run<T>()` no filtra nada: se borra al compilar y el cliente devuelve la
 * fila entera. Así que `password_hash` — el hash bcrypt de la contraseña que la
 * persona eligió al registrarse — salía en la respuesta de
 * `GET /admin/registration-requests` para cualquier administrador.
 *
 * Un hash fuera del servidor se ataca offline, sin límite de intentos ni rate
 * limiting, contra contraseñas que el registro público admite de 6 caracteres.
 *
 * El test mira el JSON serializado y no solo las claves: si alguien vuelve a
 * poner `SELECT *`, el campo reaparece y esto lo caza.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase } from '../config/database.js';
import { createAndLogin } from './helpers/fixtures.js';

type Actor = Awaited<ReturnType<typeof createAndLogin>>;

const DOMAIN = `reqscope-${Date.now()}.test`;
const SOLICITANTE = `solicitante-${Date.now()}@${DOMAIN}`;
/** Marcador reconocible: si aparece en la respuesta, el hash se ha escapado. */
const HASH_MARCADOR = '$2b$12$MARCADOR.QUE.NO.DEBE.SALIR.NUNCA.AL.CLIENTE';

let admin: Actor;

beforeAll(async () => {
  await getDatabase().exec(
    `INSERT INTO registration_requests
       (full_name, email, student_id, password_hash, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
    ['Persona Solicitante', SOLICITANTE, `REQ-${Date.now()}`, HASH_MARCADOR],
  );

  admin = await createAndLogin({ role: 'admin', adminDomain: DOMAIN });
});

describe('H-2 — GET /admin/registration-requests', () => {
  it('devuelve la solicitud del propio dominio', async () => {
    const res = await admin.agent.get('/admin/registration-requests?status=pending');

    expect(res.status).toBe(200);
    const encontrada = res.body.requests.find((r: any) => r.email === SOLICITANTE);
    expect(encontrada, 'la solicitud sembrada no aparece en el listado').toBeTruthy();
  });

  it('no incluye password_hash en ninguna solicitud', async () => {
    const res = await admin.agent.get('/admin/registration-requests?status=pending');

    for (const solicitud of res.body.requests) {
      expect(Object.keys(solicitud)).not.toContain('password_hash');
      expect(Object.keys(solicitud)).not.toContain('approved_password');
    }
  });

  it('el hash no aparece en el cuerpo de la respuesta, mire donde mire', async () => {
    const res = await admin.agent.get('/admin/registration-requests?status=pending');

    expect(JSON.stringify(res.body)).not.toContain(HASH_MARCADOR);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]?\$\d{2}\$/);
  });

  it('sigue trayendo los campos que pinta el panel', async () => {
    // Si la lista explícita se queda corta, la pantalla de solicitudes se rompe
    // en silencio: estos son los campos que AdminPanel.jsx lee de verdad.
    const res = await admin.agent.get('/admin/registration-requests?status=pending');
    const solicitud = res.body.requests.find((r: any) => r.email === SOLICITANTE);

    for (const campo of ['id', 'email', 'full_name', 'student_id', 'status']) {
      expect(solicitud, `falta el campo ${campo}`).toHaveProperty(campo);
    }
    // reviewed_at es null mientras está pendiente, pero la clave debe existir.
    expect(solicitud).toHaveProperty('reviewed_at');
  });
});
