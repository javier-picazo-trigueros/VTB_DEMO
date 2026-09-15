/**
 * Crear elección sin esperar a la blockchain, y sincronización posterior.
 *
 * Antes, POST /admin/elections esperaba a que Sepolia confirmara (12-40 s). El
 * frontend corta a los 15 s: la elección quedaba creada sin candidatos y el
 * administrador veía un error. Y la sincronización renumeraba los ids de cadena
 * como 1..N, suponiendo que la elección i de la base era la i del contrato.
 *
 * Aquí se comprueba:
 *   - la elección y sus candidatos se crean juntos, en una transacción, y la
 *     respuesta no espera a la cadena;
 *   - un fallo a mitad no deja nada;
 *   - la sincronización toma el id del evento, no renumera, reintenta con
 *     backoff, recupera una transacción ya enviada y no duplica envíos;
 *   - un voto real no se envía a una elección que aún no está en la cadena.
 *
 * La cadena se sustituye por un puerto falso: los tests nunca tocan Sepolia
 * (setup.ts vacía CONTRACT_ADDRESS, PRIVATE_KEY y RPC_URL).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import {
  createAndLogin,
  createFixtureUser,
  createFixtureElection,
  loginAsFixture,
} from './helpers/fixtures.js';
import { getDbClient } from '../db/index.js';
import {
  syncElectionsToBlockchain,
  isChainConfigured,
  CHAIN_MAX_ATTEMPTS,
  type ElectionRegistryPort,
} from '../scripts/syncElections.js';

const db = getDbClient();
const nowSec = () => Math.floor(Date.now() / 1000);
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

type ElectionRow = {
  id: number;
  election_id_blockchain: number;
  chain_status: string;
  chain_tx_hash: string | null;
  chain_error: string | null;
  chain_attempts: number;
  chain_next_retry_at: string | null;
};

const electionByName = (name: string) =>
  db.get<ElectionRow>('SELECT * FROM elections WHERE name = ?', [name]);
const electionById = (id: number) =>
  db.get<ElectionRow>('SELECT * FROM elections WHERE id = ?', [id]);
const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);

afterEach(() => { vi.restoreAllMocks(); });

describe('POST /admin/elections — responde sin esperar a la blockchain', () => {
  let agent: Awaited<ReturnType<typeof createAndLogin>>['agent'];
  let csrf: string;

  beforeAll(async () => {
    ({ agent, csrf } = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' }));
  });

  it('los tests no tienen blockchain configurada (nunca tocan Sepolia)', () => {
    expect(isChainConfigured()).toBe(false);
  });

  it('crea la elección y sus candidatos en una sola petición, en estado pending', async () => {
    const name = `Chain OK ${Date.now()}`;
    const t0 = Date.now();
    const res = await agent.post('/admin/elections').set('X-CSRF-Token', csrf).send({
      name,
      description: 'creada por el test',
      start_time: nowSec() - 60,
      end_time: nowSec() + 3600,
      candidates: [{ name: 'Ana', description: 'primera' }, { name: 'Bruno' }],
    });

    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(res.body.chainStatus).toBe('pending');

    const e = await electionByName(name);
    expect(e?.chain_status).toBe('pending');
    const candidates = await db.run<{ name: string; description: string; position: number }>(
      'SELECT name, description, position FROM candidates WHERE election_id = ? ORDER BY position',
      [e!.id],
    );
    expect(candidates.map(c => [c.name, c.description, Number(c.position)])).toEqual([
      ['Ana', 'primera', 0],
      ['Bruno', '', 1],
    ]);
  });

  it('un candidato sin nombre se rechaza antes de crear nada (400)', async () => {
    const name = `Chain 400 ${Date.now()}`;
    const res = await agent.post('/admin/elections').set('X-CSRF-Token', csrf).send({
      name,
      start_time: nowSec() - 60,
      end_time: nowSec() + 3600,
      candidates: [{ name: 'Ana' }, { name: '   ' }],
    });
    expect(res.status).toBe(400);
    expect(await electionByName(name)).toBeUndefined();
  });

  it('si algo falla a mitad, no queda una elección huérfana (ROLLBACK)', async () => {
    const name = `Chain rollback ${Date.now()}`;
    const eleccionesAntes = await count('SELECT COUNT(*) AS n FROM elections');

    // Fallo real del motor en el INSERT del segundo candidato, dentro de la
    // transacción: la elección, sus targets, su acceso y su censo ya están escritos.
    const original = db.exec.bind(db);
    let candidatos = 0;
    vi.spyOn(db, 'exec').mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/INSERT INTO candidates/.test(sql) && ++candidatos === 2) {
        throw new Error('fallo simulado al insertar el segundo candidato');
      }
      return original(sql, params);
    });

    const res = await agent.post('/admin/elections').set('X-CSRF-Token', csrf).send({
      name,
      start_time: nowSec() - 60,
      end_time: nowSec() + 3600,
      candidates: [{ name: 'Uno' }, { name: 'Dos' }],
    });
    vi.restoreAllMocks();

    expect(res.status).toBe(500);
    expect(await electionByName(name)).toBeUndefined();
    expect(await count('SELECT COUNT(*) AS n FROM elections')).toBe(eleccionesAntes);
    for (const table of ['candidates', 'election_targets', 'election_access', 'election_voters']) {
      expect(
        await count(`SELECT COUNT(*) AS n FROM ${table} WHERE election_id NOT IN (SELECT id FROM elections)`),
        `${table} sin filas huérfanas`,
      ).toBe(0);
    }
  });
});

describe('sincronización con la cadena', () => {
  /** Puerto falso: cada nombre de elección tiene su id "del evento". */
  function fakePort(ids: Record<string, number>) {
    const sent: string[] = [];
    const port: ElectionRegistryPort = {
      send: vi.fn(async (name: string) => { sent.push(name); return `0xtx-${name}`; }),
      confirm: vi.fn(async (hash: string) => {
        const id = ids[hash.replace(/^0xtx-/, '')];
        if (id === undefined) throw new Error(`id desconocido para ${hash}`);
        return id;
      }),
    };
    return { port, sent };
  }

  /** Solo las elecciones de cada test quedan pendientes. */
  async function pendingElections(...names: string[]): Promise<number[]> {
    await db.exec("UPDATE elections SET chain_status = 'synced'");
    const ids: number[] = [];
    for (const name of names) {
      const id = await createFixtureElection({ name });
      await db.exec(
        "UPDATE elections SET chain_status = 'pending', election_id_blockchain = 0, chain_tx_hash = NULL, chain_attempts = 0, chain_next_retry_at = NULL WHERE id = ?",
        [id],
      );
      ids.push(id);
    }
    return ids;
  }

  it('sin blockchain configurada no hace nada', async () => {
    const summary = await syncElectionsToBlockchain();
    expect(summary.configured).toBe(false);
  });

  it('registra las pendientes con el id del evento, sin renumerar las demás ni reenviar', async () => {
    const s = Date.now();
    const [a, b] = await pendingElections(`Sync A ${s}`, `Sync B ${s}`);
    const otrasAntes = await db.run<{ id: number; election_id_blockchain: number }>(
      'SELECT id, election_id_blockchain FROM elections WHERE id NOT IN (?, ?) ORDER BY id', [a, b],
    );

    const { port, sent } = fakePort({ [`Sync A ${s}`]: 501, [`Sync B ${s}`]: 502 });
    const summary = await syncElectionsToBlockchain({ port });

    expect(summary.synced).toBe(2);
    for (const [id, chainId] of [[a, 501], [b, 502]]) {
      const e = await electionById(id);
      expect(e?.chain_status).toBe('synced');
      expect(Number(e?.election_id_blockchain)).toBe(chainId);
      expect(e?.chain_tx_hash).toMatch(/^0xtx-/);
    }
    const otrasDespues = await db.run<{ id: number; election_id_blockchain: number }>(
      'SELECT id, election_id_blockchain FROM elections WHERE id NOT IN (?, ?) ORDER BY id', [a, b],
    );
    expect(otrasDespues).toEqual(otrasAntes);

    await syncElectionsToBlockchain({ port });
    expect(sent).toHaveLength(2);
  });

  it('si el envío falla reintenta con espera; tras agotar intentos queda failed; el botón manual la recupera', async () => {
    const s = Date.now();
    const [id] = await pendingElections(`Sync falla ${s}`);
    const rota: ElectionRegistryPort = {
      send: vi.fn(async () => { throw new Error('insufficient funds for gas'); }),
      confirm: vi.fn(),
    };

    await syncElectionsToBlockchain({ port: rota });
    let e = await electionById(id);
    expect(e?.chain_status).toBe('pending');
    expect(Number(e?.chain_attempts)).toBe(1);
    expect(e?.chain_error).toMatch(/insufficient funds/);
    expect(new Date(e!.chain_next_retry_at!).getTime()).toBeGreaterThan(Date.now());

    // Mientras espera su turno, otra pasada no la toca.
    await syncElectionsToBlockchain({ port: rota });
    expect(rota.send).toHaveBeenCalledTimes(1);

    // Último intento.
    await db.exec('UPDATE elections SET chain_next_retry_at = ?, chain_attempts = ? WHERE id = ?',
      [isoAgo(1000), CHAIN_MAX_ATTEMPTS - 1, id]);
    await syncElectionsToBlockchain({ port: rota });
    e = await electionById(id);
    expect(e?.chain_status).toBe('failed');

    // El job periódico no reintenta las fallidas...
    const { port: sana } = fakePort({ [`Sync falla ${s}`]: 777 });
    await syncElectionsToBlockchain({ port: sana });
    expect((await electionById(id))?.chain_status).toBe('failed');

    // ...el botón "Sincronizar elecciones" sí.
    await syncElectionsToBlockchain({ port: sana, retryFailed: true });
    e = await electionById(id);
    expect(e?.chain_status).toBe('synced');
    expect(Number(e?.election_id_blockchain)).toBe(777);
  });

  it('una elección abandonada en syncing con la tx ya enviada se confirma, no se reenvía', async () => {
    const s = Date.now();
    const [id] = await pendingElections(`Sync abandonada ${s}`);
    await db.exec(
      "UPDATE elections SET chain_status = 'syncing', chain_tx_hash = '0xprevia', chain_claimed_at = ?, chain_attempts = 1 WHERE id = ?",
      [isoAgo(20 * 60 * 1000), id],
    );
    const port: ElectionRegistryPort = {
      send: vi.fn(async () => '0xnueva'),
      confirm: vi.fn(async (hash: string) => (hash === '0xprevia' ? 888 : 0)),
    };

    await syncElectionsToBlockchain({ port });

    expect(port.send).not.toHaveBeenCalled();
    expect(port.confirm).toHaveBeenCalledWith('0xprevia');
    const e = await electionById(id);
    expect(e?.chain_status).toBe('synced');
    expect(Number(e?.election_id_blockchain)).toBe(888);
  });

  it('una elección en syncing reciente no se toca (otro proceso la está enviando)', async () => {
    const s = Date.now();
    const [id] = await pendingElections(`Sync en vuelo ${s}`);
    await db.exec("UPDATE elections SET chain_status = 'syncing', chain_claimed_at = ? WHERE id = ?", [isoAgo(1000), id]);
    const { port } = fakePort({ [`Sync en vuelo ${s}`]: 999 });

    await syncElectionsToBlockchain({ port });

    expect(port.send).not.toHaveBeenCalled();
    expect((await electionById(id))?.chain_status).toBe('syncing');
  });
});

describe('register-vote en una elección que aún no está en blockchain', () => {
  it('una cuenta real recibe 503 ELECTION_NOT_ON_CHAIN y no se registra ningún voto', async () => {
    const user = await createFixtureUser();
    const electionId = await createFixtureElection({ name: `Sin cadena ${Date.now()}` });
    await db.exec("UPDATE elections SET chain_status = 'pending' WHERE id = ?", [electionId]);
    const candidate = await db.exec("INSERT INTO candidates (election_id, name) VALUES (?, 'Única')", [electionId]);
    await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);

    const { agent, csrf } = await loginAsFixture(user.email, user.password);
    const res = await agent.post('/api/elections/register-vote').set('X-CSRF-Token', csrf).send({
      electionId,
      voteHash: '0x' + 'ab'.repeat(32),
      candidateId: candidate.lastID,
    });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ELECTION_NOT_ON_CHAIN');
    expect(await count('SELECT COUNT(*) AS n FROM nullifier_audit WHERE user_id = ?', [user.id])).toBe(0);
  });
});
