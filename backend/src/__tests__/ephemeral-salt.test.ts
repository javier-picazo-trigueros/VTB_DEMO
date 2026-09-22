/**
 * Parte 4: Sal efímera por elección.
 *
 * generateNullifier() acepta la sal como argumento puro (tests directos), pero
 * lo que importa es si la ruta real de voto (routes/elections.ts) la usa de
 * verdad y si el job de destrucción (services/electionSalt.ts) respeta un voto
 * pendiente de resolver. Por eso la mayoría de estos tests pasan por
 * POST /api/elections/register-vote con un VotePort simulado, no por las
 * funciones sueltas.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { generateNullifier } from '../utils/auth.js';
import { getDbClient } from '../db/index.js';
import { destroyElectionSaltIfComplete, destroyExpiredElectionSalts } from '../services/electionSalt.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';
import { setVotePortForTesting, type VotePort } from '../services/voteChain.js';

const db = getDbClient();

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

/** Elección votable con la sal indicada (o generada si no se pasa ninguna). */
async function eleccionVotable(chainId: number, ephemeralSalt?: string | null) {
  const user = await createFixtureUser();
  const electionId = await createFixtureElection({
    blockchainId: chainId,
    name: `Voto Sal ${Date.now()}-${chainId}`,
    candidates: ['Candidato Uno', 'Candidato Dos'],
    ephemeralSalt,
  });
  await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);
  const candidatos = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );
  const salt = await db.get<{ ephemeral_salt: string | null }>(
    'SELECT ephemeral_salt FROM elections WHERE id = ?',
    [electionId],
  );
  return { user, electionId, candidatos, ephemeralSalt: salt?.ephemeral_salt ?? null };
}

/** Puerto simulado que confirma el voto de inmediato (sin blockchain real). */
function puertoConfirmado(nullifiersVistos: string[]) {
  const port: VotePort = {
    castVote: vi.fn(async (_electionId: number, nullifier: string) => {
      nullifiersVistos.push(nullifier);
      return { txHash: '0x' + 'bb'.repeat(32), blockNumber: 123, status: 'confirmed' as const };
    }),
    findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
    getTally: vi.fn(async () => [0, 0]),
  };
  return port;
}

describe('Parte 4: Sal efímera — uso real en la ruta de voto', () => {
  it('generateNullifier() es determinista con la misma sal y distinto con otra (función pura)', () => {
    const salt1 = crypto.randomBytes(32).toString('hex');
    const salt2 = crypto.randomBytes(32).toString('hex');

    expect(generateNullifier(1, 10, salt1)).toBe(generateNullifier(1, 10, salt1));
    expect(generateNullifier(1, 10, salt1)).not.toBe(generateNullifier(1, 10, salt2));
    expect(generateNullifier(1, 10, salt1)).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('POST /register-vote calcula el nullifier CON la sal de la elección, no sin ella', async () => {
    const vistos: string[] = [];
    setVotePortForTesting(puertoConfirmado(vistos));

    const { user, electionId, candidatos, ephemeralSalt } = await eleccionVotable(301);
    expect(ephemeralSalt).not.toBeNull(); // createFixtureElection genera una sal por defecto

    const { agent, csrf } = await loginAsFixture(user.email, user.password);
    const res = await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });

    expect(res.status).toBe(200);
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toBe(generateNullifier(user.id, electionId, ephemeralSalt));
    expect(vistos[0]).not.toBe(generateNullifier(user.id, electionId)); // sin sal habría sido otro
  });

  it('POST /register-vote sin sal (elección creada antes de la migración) usa el cálculo legacy', async () => {
    const vistos: string[] = [];
    setVotePortForTesting(puertoConfirmado(vistos));

    const { user, electionId, candidatos, ephemeralSalt } = await eleccionVotable(302, null);
    expect(ephemeralSalt).toBeNull();

    const { agent, csrf } = await loginAsFixture(user.email, user.password);
    const res = await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });

    expect(res.status).toBe(200);
    expect(vistos[0]).toBe(generateNullifier(user.id, electionId)); // legacy, sin tercer argumento
  });
});

describe('Parte 4: Sal efímera — destrucción al cerrar (destroyElectionSaltIfComplete / destroyExpiredElectionSalts)', () => {
  it('no destruye la sal de una elección todavía abierta', async () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const salt = crypto.randomBytes(32).toString('hex');
    const res = await db.exec(
      `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, ephemeral_salt)
       VALUES (?, 'Elección Activa', 'Test', 1000, ?, 1, ?)`,
      [900301, futureTime, salt],
    );
    const electionId = res.lastID;

    expect(await destroyElectionSaltIfComplete(electionId, db)).toBe(false);
    const election = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?', [electionId],
    );
    expect(election?.ephemeral_salt).toBe(salt);
  });

  it('no destruye la sal mientras haya un voto pendiente real (acquireVoteLock) en esa elección', async () => {
    setVotePortForTesting({
      castVote: vi.fn(async () => ({ txHash: '0x' + 'aa'.repeat(32), blockNumber: null, status: 'pending_confirmation' as const })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    });

    const { user, electionId, candidatos } = await eleccionVotable(303);
    const { agent, csrf } = await loginAsFixture(user.email, user.password);
    const res = await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });
    expect(res.status).toBe(200);
    expect(res.body.pendingConfirmation).toBe(true);
    expect(await db.hasPendingVoteLock!(user.id, electionId)).toBe(true);

    // Cerrar la elección (end_time en el pasado) con el voto todavía 'pending'.
    await db.exec('UPDATE elections SET end_time = ? WHERE id = ?', [Math.floor(Date.now() / 1000) - 10, electionId]);

    expect(await destroyElectionSaltIfComplete(electionId, db)).toBe(false);
    const election = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?', [electionId],
    );
    expect(election?.ephemeral_salt).not.toBeNull();
  });

  it('destruye la sal en cuanto el voto pendiente se resuelve (releaseVoteLock), sin esperar más', async () => {
    setVotePortForTesting({
      castVote: vi.fn(async () => ({ txHash: '0x' + 'aa'.repeat(32), blockNumber: null, status: 'pending_confirmation' as const })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    });

    const { user, electionId, candidatos } = await eleccionVotable(304);
    const { agent, csrf } = await loginAsFixture(user.email, user.password);
    await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });
    await db.exec('UPDATE elections SET end_time = ? WHERE id = ?', [Math.floor(Date.now() / 1000) - 10, electionId]);

    // Todavía pendiente: no se destruye.
    expect(await destroyElectionSaltIfComplete(electionId, db)).toBe(false);

    // El job de reconciliación (cleanupStaleVoteAttempts en Postgres) resuelve el
    // intento llamando a releaseVoteLock — se simula aquí ese mismo paso.
    await db.releaseVoteLock(user.id, electionId, 'failed', 'transacción reemplazada');
    expect(await db.hasPendingVoteLock!(user.id, electionId)).toBe(false);

    expect(await destroyElectionSaltIfComplete(electionId, db)).toBe(true);
    const election = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?', [electionId],
    );
    expect(election?.ephemeral_salt).toBeNull();
  });

  it('destroyExpiredElectionSalts recorre todas las elecciones cerradas y solo destruye las que no tienen pendientes', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 100;

    const { electionId: sinVotos } = await eleccionVotable(305);
    await db.exec('UPDATE elections SET end_time = ? WHERE id = ?', [pastTime, sinVotos]);

    setVotePortForTesting({
      castVote: vi.fn(async () => ({ txHash: '0x' + 'aa'.repeat(32), blockNumber: null, status: 'pending_confirmation' as const })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    });
    const { user: user2, electionId: conPendiente, candidatos } = await eleccionVotable(306);
    const { agent, csrf } = await loginAsFixture(user2.email, user2.password);
    await agent.post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId: conPendiente, candidateId: candidatos[0].id });
    await db.exec('UPDATE elections SET end_time = ? WHERE id = ?', [pastTime, conPendiente]);

    const destruidas = await destroyExpiredElectionSalts(db);
    expect(destruidas).toBeGreaterThanOrEqual(1);

    const saltSinVotos = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?', [sinVotos],
    );
    expect(saltSinVotos?.ephemeral_salt).toBeNull();

    const saltConPendiente = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?', [conPendiente],
    );
    expect(saltConPendiente?.ephemeral_salt).not.toBeNull();
  });
});
