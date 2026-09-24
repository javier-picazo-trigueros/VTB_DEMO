/**
 * SCRUM-20 — Registro de acciones de administración.
 *
 * Criterio de aceptación: toda ruta de escritura de /admin deja una entrada, y
 * un superadministrador puede reconstruir quién hizo qué en una elección.
 *
 * La primera mitad no lleva una lista de rutas escrita a mano: las saca del
 * propio router. Una ruta de escritura nueva queda cubierta sin tocar este
 * fichero, y si alguien monta un router de admin por fuera del middleware, el
 * test lo detecta.
 *
 * El registro se escribe en el evento 'finish' de la respuesta, así que puede
 * llegar unos milisegundos después de que supertest reciba la respuesta: de
 * ahí vi.waitFor en vez de leer la base inmediatamente.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../app.js';
import adminRouter from '../routes/admin/index.js';
import { getDatabase } from '../config/database.js';
import { getDbClient } from '../db/index.js';
import { createAndLogin, createFixtureElection } from './helpers/fixtures.js';
import { purgeOldAdminActionLog, ADMIN_ACTION_LOG_RETENTION_DAYS } from '../services/retention.js';

type Actor = Awaited<ReturnType<typeof createAndLogin>>;

const DOMAIN_A = `acciones-a-${Date.now()}.test`;
const DOMAIN_B = `acciones-b-${Date.now()}.test`;
const MISSING_ID = 987654321;

let superadmin: Actor;
let adminA: Actor;
let adminB: Actor;
let electionA: number;

interface LogRow {
  id: number;
  actor_user_id: number;
  actor_role: string;
  actor_domain: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  status_code: number;
  ip: string | null;
}

/** Espera a que aparezca la fila que cumple `where` y la devuelve. */
async function waitForLog(where: string, params: unknown[]): Promise<LogRow> {
  let row: LogRow | undefined;
  await vi.waitFor(async () => {
    row = await getDatabase().get<LogRow>(
      `SELECT * FROM admin_action_log WHERE ${where} ORDER BY id DESC LIMIT 1`, params,
    );
    expect(row).toBeTruthy();
  }, { timeout: 2000, interval: 20 });
  return row!;
}

async function maxLogId(): Promise<number> {
  const r = await getDatabase().get<{ m: number | null }>('SELECT MAX(id) AS m FROM admin_action_log');
  return Number(r?.m ?? 0);
}

/** Todas las rutas de escritura montadas bajo el router de /admin. */
function writeRoutes(): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          if (['post', 'put', 'patch', 'delete'].includes(m)) {
            out.push({ method: m, path: `/admin${layer.route.path}` });
          }
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((adminRouter as any).stack);
  return out;
}

beforeAll(async () => {
  superadmin = await createAndLogin({ role: 'superadmin', adminDomain: null });
  adminA = await createAndLogin({ role: 'admin', adminDomain: DOMAIN_A, email: `admin@${DOMAIN_A}` });
  adminB = await createAndLogin({ role: 'admin', adminDomain: DOMAIN_B, email: `admin@${DOMAIN_B}` });

  electionA = await createFixtureElection({ name: `Registro de acciones ${Date.now()}` });
  await getDatabase().exec(
    'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
    [electionA, DOMAIN_A],
  );
});

describe('SCRUM-20 — toda ruta de escritura de /admin deja una entrada', () => {
  const routes = writeRoutes();

  it('el router expone rutas de escritura (si esto da 0, el test de abajo no prueba nada)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(17);
  });

  // Un id que no existe y un cuerpo vacío: todas responden 400 o 404 sin
  // cambiar nada, pero la ruta se ha atendido y tiene que quedar registrada.
  for (const { method, path } of routes) {
    it(`${method.toUpperCase()} ${path}`, async () => {
      const url = path.replace(':id', String(MISSING_ID));
      const before = await maxLogId();
      const res = await (superadmin.agent as any)[method](url).set('X-CSRF-Token', superadmin.csrf).send({});

      const row = await waitForLog('id > ? AND action = ?', [before, `${method.toUpperCase()} ${path}`]);
      expect(row.actor_user_id).toBe(superadmin.id);
      expect(row.status_code).toBe(res.status);
    });
  }

  it('también la sincronización manual con blockchain, que vive fuera del router de /admin', async () => {
    const before = await maxLogId();
    const res = await superadmin.agent.post('/api/admin/sync-blockchain').set('X-CSRF-Token', superadmin.csrf);
    const row = await waitForLog('id > ? AND action = ?', [before, 'POST /api/admin/sync-blockchain']);
    expect(row.entity_type).toBe('blockchain_sync');
    expect(row.status_code).toBe(res.status);
  });
});

describe('SCRUM-20 — qué se guarda', () => {
  it('una edición guarda actor, rol, dominio, patrón de la ruta, elección afectada, resultado e IP', async () => {
    const before = await maxLogId();
    const res = await adminA.agent.patch(`/admin/elections/${electionA}`)
      .set('X-CSRF-Token', adminA.csrf).send({ description: 'editada por A' });
    expect(res.status).toBe(200);

    const row = await waitForLog('id > ? AND actor_user_id = ?', [before, adminA.id]);
    expect(row).toMatchObject({
      actor_role: 'admin',
      actor_domain: DOMAIN_A,
      action: 'PATCH /admin/elections/:id',
      entity_type: 'election',
      entity_id: String(electionA),
      status_code: 200,
    });
    expect(row.ip).toBeTruthy();
  });

  it('un alta sin id en la URL guarda el id creado', async () => {
    const before = await maxLogId();
    const res = await adminA.agent.post('/admin/users').set('X-CSRF-Token', adminA.csrf).send({
      email: `nueva-${Date.now()}@${DOMAIN_A}`, password: 'Contrasena-larga-1',
      name: 'Alta registrada', student_id: `ACC-${Date.now()}`,
    });
    expect(res.status).toBe(200);

    const row = await waitForLog('id > ? AND action = ?', [before, 'POST /admin/users']);
    expect(row.entity_type).toBe('user');
    expect(row.entity_id).toBe(String(res.body.userId));
  });

  it('un intento sobre la elección de otra institución queda registrado con su 404', async () => {
    const before = await maxLogId();
    const res = await adminB.agent.patch(`/admin/elections/${electionA}`)
      .set('X-CSRF-Token', adminB.csrf).send({ description: 'intruso' });
    expect(res.status).toBe(404);

    const row = await waitForLog('id > ? AND actor_user_id = ?', [before, adminB.id]);
    expect(row.status_code).toBe(404);
    expect(row.entity_id).toBe(String(electionA));
  });

  it('no guarda el cuerpo de la petición: ninguna contraseña llega a la tabla', async () => {
    const secreto = `NoDebeGuardarse-${Date.now()}`;
    const before = await maxLogId();
    await superadmin.agent.post('/admin/users').set('X-CSRF-Token', superadmin.csrf).send({
      email: `cuerpo-${Date.now()}@test.vtb`, password: secreto, name: 'Sin cuerpo', student_id: `ACC-B-${Date.now()}`,
    });
    await waitForLog('id > ? AND action = ?', [before, 'POST /admin/users']);

    const rows = await getDatabase().run<Record<string, unknown>>('SELECT * FROM admin_action_log WHERE id > ?', [before]);
    expect(JSON.stringify(rows)).not.toContain(secreto);
  });

  it('las lecturas no se registran', async () => {
    const before = await maxLogId();
    await superadmin.agent.get('/admin/elections');
    await superadmin.agent.get('/admin/dashboard');
    await new Promise((r) => setTimeout(r, 100));
    expect(await maxLogId()).toBe(before);
  });

  it('quien no es administrador no genera entradas', async () => {
    const student = await createAndLogin({ role: 'student' });
    const before = await maxLogId();
    const res = await student.agent.patch(`/admin/elections/${electionA}`)
      .set('X-CSRF-Token', student.csrf).send({ description: 'x' });
    expect(res.status).toBe(403);
    await new Promise((r) => setTimeout(r, 100));
    expect(await maxLogId()).toBe(before);
  });
});

describe('SCRUM-20 — GET /admin/action-log, filtrado por dominio', () => {
  let superOnA: number;
  let ownOfB: number;

  beforeAll(async () => {
    // Un superadministrador toca la elección de A: A tiene que verlo.
    let before = await maxLogId();
    await superadmin.agent.patch(`/admin/elections/${electionA}`)
      .set('X-CSRF-Token', superadmin.csrf).send({ description: 'tocada por superadmin' });
    superOnA = (await waitForLog('id > ? AND actor_user_id = ?', [before, superadmin.id])).id;

    // B hace algo en lo suyo: A no tiene que verlo.
    before = await maxLogId();
    await adminB.agent.post('/admin/org-units').set('X-CSRF-Token', adminB.csrf).send({});
    ownOfB = (await waitForLog('id > ? AND actor_user_id = ?', [before, adminB.id])).id;
  });

  async function idsFor(actor: Actor, query = ''): Promise<{ ids: number[]; body: any }> {
    const res = await actor.agent.get(`/admin/action-log?pageSize=100${query}`);
    expect(res.status).toBe(200);
    return { ids: res.body.entries.map((e: any) => e.id), body: res.body };
  }

  it('el admin de A ve lo que un superadministrador hizo sobre su elección', async () => {
    const { ids } = await idsFor(adminA, `&entityType=election&entityId=${electionA}`);
    expect(ids).toContain(superOnA);
  });

  it('el admin de A no ve lo que el admin de B hizo en lo suyo', async () => {
    const { ids } = await idsFor(adminA);
    expect(ids).not.toContain(ownOfB);
  });

  it('el admin de A no ve IPs; el superadministrador sí', async () => {
    const a = await idsFor(adminA);
    expect(a.body.entries.length).toBeGreaterThan(0);
    for (const e of a.body.entries) expect(e).not.toHaveProperty('ip');

    const s = await idsFor(superadmin, `&entityType=election&entityId=${electionA}`);
    expect(s.body.entries[0]).toHaveProperty('ip');
  });

  it('el superadministrador reconstruye quién hizo qué en una elección, en orden', async () => {
    const { body } = await idsFor(superadmin, `&entityType=election&entityId=${electionA}`);
    const actores = body.entries.map((e: any) => e.actor.id);
    // A editó, B lo intentó (404) y el superadministrador editó: los tres están.
    expect(actores).toEqual(expect.arrayContaining([adminA.id, adminB.id, superadmin.id]));
    const intento = body.entries.find((e: any) => e.actor.id === adminB.id);
    expect(intento.succeeded).toBe(false);
    // Más reciente primero.
    const fechas = body.entries.map((e: any) => e.createdAt);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it('un estudiante no puede consultarlo', async () => {
    const student = await createAndLogin({ role: 'student' });
    const res = await student.agent.get('/admin/action-log');
    expect(res.status).toBe(403);
  });

  it('sin sesión, 401', async () => {
    const res = await request(app).get('/admin/action-log');
    expect(res.status).toBe(401);
  });
});

describe('SCRUM-20 — la pestaña del panel sabe nombrar todas las acciones', () => {
  it('cada ruta de escritura tiene su nombre en ActionLogTab.jsx', () => {
    const file = path.resolve(__dirname, '../../../frontend/src/components/ActionLogTab.jsx');
    const src = fs.readFileSync(file, 'utf8');
    const patterns = [
      ...writeRoutes().map((r) => `${r.method.toUpperCase()} ${r.path}`),
      'POST /api/admin/sync-blockchain',
    ];
    const sinNombre = patterns.filter((p) => !src.includes(`'${p}'`));
    expect(sinNombre, 'rutas que la pestaña mostraría con el patrón crudo').toEqual([]);
  });
});

describe('SCRUM-20 — plazo de conservación', () => {
  it(`borra lo de hace más de ${ADMIN_ACTION_LOG_RETENTION_DAYS} días y conserva lo reciente`, async () => {
    const db = getDbClient();
    const hace = (dias: number) =>
      new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const marca = `retencion-${Date.now()}`;
    for (const [dias, entidad] of [[ADMIN_ACTION_LOG_RETENTION_DAYS + 1, 'vieja'], [ADMIN_ACTION_LOG_RETENTION_DAYS - 1, 'reciente']] as const) {
      await db.exec(
        `INSERT INTO admin_action_log (actor_user_id, actor_role, action, entity_type, entity_id, status_code, created_at)
         VALUES (?, 'admin', 'POST /admin/test', ?, ?, 200, ?)`,
        [superadmin.id, marca, entidad, hace(dias)],
      );
    }

    expect(await purgeOldAdminActionLog(db)).toBeGreaterThanOrEqual(1);
    const quedan = await db.run<{ entity_id: string }>(
      'SELECT entity_id FROM admin_action_log WHERE entity_type = ?', [marca],
    );
    expect(quedan.map((r) => r.entity_id)).toEqual(['reciente']);
  });

  it('la Política de Privacidad publica el mismo plazo que aplica el código', () => {
    // Si se cambia ADMIN_ACTION_LOG_RETENTION_DAYS, la política tiene que decir
    // lo mismo: una política que promete un plazo que el sistema no cumple es
    // peor que no tener ninguno.
    expect(ADMIN_ACTION_LOG_RETENTION_DAYS).toBe(365);
    const politica = fs.readFileSync(
      path.resolve(__dirname, '../../../frontend/src/pages/legal/PrivacyPolicy.jsx'), 'utf8',
    );
    expect(politica).toContain("['Registro de acciones de administración (incluye la IP)', 'Se elimina a los 12 meses']");
  });
});
