/**
 * Atomicidad de la importación de censo cuando falla DENTRO de la transacción.
 *
 * Hay dos caminos de fallo y no son el mismo:
 *
 *   FASE 1 — validación. El CSV trae una fila mal formada. Se rechaza el fichero
 *            antes de tocar la base de datos. Cubierto en csv.test.ts.
 *
 *   FASE 2 — escritura. El CSV pasa la validación entera, se abre la
 *            transacción, y peta a mitad del bucle. Esto es lo que este fichero
 *            comprueba, porque es el único que ejercita el ROLLBACK de verdad.
 *
 * Para provocar un fallo real en fase 2 se usa un `student_id` repetido: la
 * columna es UNIQUE, y la fase 1 solo deduplica por email, así que dos filas con
 * emails distintos y el mismo student_id pasan la validación y revientan en el
 * INSERT de la segunda. Es un fallo del motor, no uno simulado con un mock, que
 * es justo lo que hay que probar.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  createFixtureUser,
  loginAsFixture,
  createFixtureElection,
} from './helpers/fixtures.js';
import { getDbClient } from '../db/index.js';

const db = getDbClient();

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

async function userExists(email: string): Promise<boolean> {
  const row = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  return row !== undefined;
}

async function censusSize(electionId: number): Promise<number> {
  const row = await db.get<{ n: number }>(
    'SELECT COUNT(*) as n FROM election_voters WHERE election_id = ?', [electionId],
  );
  return Number(row?.n ?? 0);
}

describe('import-voters — fallo a mitad de la transacción', () => {
  let adminEmail: string;
  let adminPassword: string;
  let electionId: number;

  beforeAll(async () => {
    const admin = await createFixtureUser({ role: 'admin', adminDomain: 'test.vtb' });
    adminEmail = admin.email;
    adminPassword = admin.password;
    electionId = await createFixtureElection({ name: 'Elección atomicidad' });

    // La elección tiene que pertenecer al dominio del admin: desde H-1, las
    // rutas que reciben el id por la URL comprueban el alcance y responden 404
    // si la elección no es suya. createFixtureElection no crea esta fila.
    await db.exec(
      'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
      [electionId, 'test.vtb'],
    );
  });

  it('un student_id repetido revienta en fase 2 y NO deja nada escrito', async () => {
    const { agent, csrf } = await loginAsFixture(adminEmail, adminPassword);
    const s = Date.now();

    // Las tres filas pasan la validación: emails distintos, todos los campos.
    // La tercera choca con la primera por student_id al insertarse.
    const csv = [
      'email,full_name,student_id',
      `mid-a-${s}@test.vtb,Mid A,MID-DUP-${s}`,
      `mid-b-${s}@test.vtb,Mid B,MID-B-${s}`,
      `mid-c-${s}@test.vtb,Mid C,MID-DUP-${s}`,   // ← mismo student_id que la primera
    ].join('\n');

    const censusBefore = await censusSize(electionId);

    const res = await agent
      .post(`/admin/elections/${electionId}/import-voters`)
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'mid.csv', contentType: 'text/csv' });

    // El fallo ocurre ya dentro de la transacción: responde 500, no 400.
    expect(res.status).toBe(500);

    // Y lo que importa: las dos filas que SÍ se habían insertado antes del
    // choque tienen que haber desaparecido.
    expect(await userExists(`mid-a-${s}@test.vtb`), 'la fila A se insertó antes del fallo y debe revertirse').toBe(false);
    expect(await userExists(`mid-b-${s}@test.vtb`), 'la fila B se insertó antes del fallo y debe revertirse').toBe(false);
    expect(await userExists(`mid-c-${s}@test.vtb`)).toBe(false);

    // El censo queda exactamente como estaba.
    expect(await censusSize(electionId)).toBe(censusBefore);
  });

  it('no encola invitaciones ni deja tokens para las altas revertidas', async () => {
    // Las invitaciones se encolan después del COMMIT. Si hay ROLLBACK no puede
    // quedar ningún correo, ni ningún enlace de "establece tu contraseña", para
    // usuarios que no existen.
    const { agent, csrf } = await loginAsFixture(adminEmail, adminPassword);
    const s = Date.now();

    const before = await db.get<{ n: number }>(
      "SELECT COUNT(*) as n FROM password_reset_tokens WHERE type = 'invitation'",
    );

    const csv = [
      'email,full_name,student_id',
      `tok-a-${s}@test.vtb,Tok A,TOK-DUP-${s}`,
      `tok-b-${s}@test.vtb,Tok B,TOK-DUP-${s}`,   // choca por student_id
    ].join('\n');

    await agent
      .post(`/admin/elections/${electionId}/import-voters`)
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'tok.csv', contentType: 'text/csv' });

    const after = await db.get<{ n: number }>(
      "SELECT COUNT(*) as n FROM password_reset_tokens WHERE type = 'invitation'",
    );
    expect(Number(after?.n ?? 0)).toBe(Number(before?.n ?? 0));

    const queued = await db.get<{ n: number }>(
      'SELECT COUNT(*) as n FROM email_log WHERE recipient LIKE ?', [`tok-%-${s}@test.vtb`],
    );
    expect(Number(queued?.n ?? 0)).toBe(0);
  });

  it('un CSV correcto escribe usuarios y censo, y encola una invitación por alta sin el enlace', async () => {
    // La contrapartida: comprobar que la transacción confirma y que, después,
    // se encola la invitación de cada alta nueva.
    const { agent, csrf } = await loginAsFixture(adminEmail, adminPassword);
    const s = Date.now();

    const censusBefore = await censusSize(electionId);

    const csv = [
      'email,full_name,student_id',
      `ok-a-${s}@test.vtb,Ok A,OK-A-${s}`,
      `ok-b-${s}@test.vtb,Ok B,OK-B-${s}`,
    ].join('\n');

    const res = await agent
      .post(`/admin/elections/${electionId}/import-voters`)
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 'ok.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.results.created).toBe(2);
    expect(res.body.results.added).toBe(2);

    expect(await userExists(`ok-a-${s}@test.vtb`)).toBe(true);
    expect(await userExists(`ok-b-${s}@test.vtb`)).toBe(true);
    expect(await censusSize(electionId)).toBe(censusBefore + 2);

    // P1-7: la invitación se encola con los datos para renderizarla, no con el
    // cuerpo. El token se emite al enviar, así que no está en email_log.
    for (const email of [`ok-a-${s}@test.vtb`, `ok-b-${s}@test.vtb`]) {
      const user = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);

      type Row = { html_body: string | null; text_body: string | null; template_data: string | null };
      let row: Row | undefined;
      await vi.waitFor(async () => {
        row = await db.get<Row>(
          "SELECT html_body, text_body, template_data FROM email_log WHERE recipient = ? AND template_name = 'invitation'",
          [email],
        );
        expect(row, `${email} debería tener su invitación encolada`).toBeTruthy();
      }, { timeout: 5000 });

      expect(row!.html_body).toBeNull();
      expect(row!.text_body).toBeNull();
      expect(JSON.parse(row!.template_data!)).toMatchObject({
        userId: user!.id,
        electionName: 'Elección atomicidad',
      });
      expect(row!.template_data).not.toMatch(/token/i);
    }
  });

  it('reimportar a alguien que ya está en el censo lo cuenta como skipped, no falla', async () => {
    const { agent, csrf } = await loginAsFixture(adminEmail, adminPassword);
    const s = Date.now();
    const csv = [
      'email,full_name,student_id',
      `re-${s}@test.vtb,Re Import,RE-${s}`,
    ].join('\n');

    const first = await agent
      .post(`/admin/elections/${electionId}/import-voters`)
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 're1.csv', contentType: 'text/csv' });
    expect(first.body.results.added).toBe(1);

    const second = await agent
      .post(`/admin/elections/${electionId}/import-voters`)
      .set('X-CSRF-Token', csrf)
      .attach('file', csvBuffer(csv), { filename: 're2.csv', contentType: 'text/csv' });

    expect(second.status).toBe(200);
    expect(second.body.results.created).toBe(0);
    expect(second.body.results.skipped).toBe(1);
  });
});
