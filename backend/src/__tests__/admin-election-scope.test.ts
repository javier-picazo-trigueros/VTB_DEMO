/**
 * Alcance por dominio en las rutas de /admin que operan sobre `:id` (H-1).
 *
 * Los listados ya filtraban por dominio, pero las rutas que reciben el id por la
 * URL no comprobaban nada: cualquier administrador podía editar, abrir, cerrar o
 * repoblar el censo de la elección de otra institución sin más que acertar el
 * id — un entero correlativo, y además visible sin autenticar en
 * `/elections/blockchain-sync-status`.
 *
 * Se cubren las DOS direcciones a propósito. Un guard que denegara a todo el
 * mundo, administrador legítimo incluido, dejaría la suite igual de verde que
 * uno correcto: un test que solo comprueba el 404 no distingue un arreglo de una
 * avería. De ahí el bloque "el dueño legítimo sigue pasando".
 *
 * Se espera 404 y no 403: un 403 confirmaría que esa elección existe, y con ids
 * correlativos eso es un inventario de las elecciones de las demás instituciones.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase } from '../config/database.js';
import {
  createAndLogin,
  createFixtureUser,
  createFixtureElection,
} from './helpers/fixtures.js';

type Actor = Awaited<ReturnType<typeof createAndLogin>>;

interface Ruta {
  nombre: string;
  metodo: 'get' | 'post' | 'put' | 'patch';
  path: (id: number) => string;
  /** Perezoso: el cuerpo puede depender de datos creados en beforeAll. */
  body: () => Record<string, unknown> | null;
}

const OWNER_DOMAIN = `owner-${Date.now()}.test`;
const OTHER_DOMAIN = `other-${Date.now()}.test`;

let owner: Actor;
let intruder: Actor;
let superadmin: Actor;
let electionId: number;
let votanteEmail: string;

/** PNG de un píxel: lo justo para que multer acepte la subida. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Las rutas con cuerpo JSON. La imagen y el CSV van aparte porque suben fichero.
 *
 * `path` y `body` son funciones porque este array se construye al recolectar los
 * tests, cuando electionId y votanteEmail todavía no existen.
 */
const RUTAS: Ruta[] = [
  { nombre: 'PUT elections/:id',             metodo: 'put',   path: id => `/admin/elections/${id}`,               body: () => ({ is_active: 1 }) },
  { nombre: 'PATCH elections/:id',           metodo: 'patch', path: id => `/admin/elections/${id}`,               body: () => ({ description: 'marca del intruso' }) },
  { nombre: 'POST elections/:id/domains',    metodo: 'post',  path: id => `/admin/elections/${id}/domains`,       body: () => ({ domain: `anadido-${Date.now()}.test` }) },
  { nombre: 'POST elections/:id/voters',     metodo: 'post',  path: id => `/admin/elections/${id}/voters`,        body: () => ({ email: votanteEmail }) },
  { nombre: 'POST elections/:id/candidates', metodo: 'post',  path: id => `/admin/elections/${id}/candidates`,    body: () => ({ name: `Candidata ${Date.now()}` }) },
  { nombre: 'GET elections/:id/stats',       metodo: 'get',   path: id => `/admin/elections/${id}/stats`,         body: () => null },
  { nombre: 'POST elections/:id/notify-open',  metodo: 'post', path: id => `/admin/elections/${id}/notify-open`,  body: () => ({}) },
  { nombre: 'POST elections/:id/notify-close', metodo: 'post', path: id => `/admin/elections/${id}/notify-close`, body: () => ({}) },
];

async function lanzar(actor: Actor, ruta: Ruta) {
  const req = (actor.agent as any)[ruta.metodo](ruta.path(electionId))
    .set('X-CSRF-Token', actor.csrf);
  const body = ruta.body();
  return body === null ? await req : await req.send(body);
}

beforeAll(async () => {
  electionId = await createFixtureElection({ name: `Alcance por dominio ${Date.now()}` });

  // Lo que decide el alcance es election_access, y createFixtureElection no crea
  // ninguna fila: hay que declarar de quién es la elección.
  await getDatabase().exec(
    'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
    [electionId, OWNER_DOMAIN],
  );

  // Un votante que existe de verdad: con un email inventado, POST /voters
  // devolvería 404 ("Usuario no encontrado") también al dueño legítimo, y ese
  // 404 se confundiría con el del guard — el bloque de abajo dejaría de probar
  // nada.
  const votante = await createFixtureUser({});
  votanteEmail = votante.email;

  owner      = await createAndLogin({ role: 'admin',      adminDomain: OWNER_DOMAIN });
  intruder   = await createAndLogin({ role: 'admin',      adminDomain: OTHER_DOMAIN });
  superadmin = await createAndLogin({ role: 'superadmin', adminDomain: null });
});

describe('H-1 — un admin de otra institución no alcanza la elección', () => {
  for (const ruta of RUTAS) {
    it(`${ruta.nombre} → 404`, async () => {
      const res = await lanzar(intruder, ruta);
      expect(res.status).toBe(404);
    });
  }

  it('POST elections/:id/image → 404', async () => {
    const res = await intruder.agent
      .post(`/admin/elections/${electionId}/image`)
      .set('X-CSRF-Token', intruder.csrf)
      .attach('file', PIXEL, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
  });

  it('POST elections/:id/import-voters → 404', async () => {
    // Esta ruta validaba el dominio de cada fila del CSV, pero no el de la
    // elección: un admin podía meter a su propia gente en el censo de otra
    // institución. Las filas van con SU dominio a propósito, para que lo único
    // que pueda rechazarlas sea el alcance de la elección.
    const csv = Buffer.from(
      `email,full_name,student_id\ncensado-${Date.now()}@${OTHER_DOMAIN},Censado,X-${Date.now()}\n`,
      'utf-8',
    );
    const res = await intruder.agent
      .post(`/admin/elections/${electionId}/import-voters`)
      .set('X-CSRF-Token', intruder.csrf)
      .attach('file', csv, { filename: 'censo.csv', contentType: 'text/csv' });
    expect(res.status).toBe(404);
  });

  it('el 404 es una negativa, no un fallo después de escribir', async () => {
    const fila = await getDatabase().get<{ description: string | null }>(
      'SELECT description FROM elections WHERE id = ?',
      [electionId],
    );
    expect(fila?.description).not.toBe('marca del intruso');

    const censo = await getDatabase().get<{ n: number }>(
      'SELECT COUNT(*) as n FROM election_voters WHERE election_id = ?',
      [electionId],
    );
    expect(Number(censo?.n ?? 0)).toBe(0);
  });
});

describe('H-1 — el dueño legítimo sigue pasando', () => {
  for (const ruta of RUTAS) {
    it(`${ruta.nombre} no devuelve 404 en su propio dominio`, async () => {
      const res = await lanzar(owner, ruta);
      // No se exige 200: cada ruta tiene su semántica de éxito (409 si el
      // dominio ya estaba, por ejemplo). Lo que se vigila es que el guard de
      // alcance no esté cortando al administrador legítimo.
      expect(res.status).not.toBe(404);
    });
  }
});

describe('H-1 — el superadmin no tiene alcance limitado', () => {
  it('GET elections/:id/stats → no 404 pese a no tener admin_domain', async () => {
    const res = await superadmin.agent.get(`/admin/elections/${electionId}/stats`);
    expect(res.status).not.toBe(404);
  });

  it('PATCH elections/:id → no 404', async () => {
    const res = await superadmin.agent
      .patch(`/admin/elections/${electionId}`)
      .set('X-CSRF-Token', superadmin.csrf)
      .send({ description: 'el superadmin sí puede' });
    expect(res.status).not.toBe(404);
  });
});
