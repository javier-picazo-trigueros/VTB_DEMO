/**
 * Test para Punto 16:
 * Verifica el cumplimiento estricto de la regla de CLAUDE.md:
 * "Si chain_status no es synced, es 503 ELECTION_NOT_ON_CHAIN para todo el mundo,
 *  cuentas de demostración (@vtb.demo) incluidas. Un campo sin transacción real
 *  va a NULL, nunca a un dato con forma de prueba."
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDbClient } from '../db/index.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';
import {
  setVotePortForTesting,
  type VotePort,
  type VoteReceipt,
} from '../services/voteChain.js';

const db = getDbClient();

const RECIBO: VoteReceipt = { txHash: '0x' + 'ee'.repeat(32), blockNumber: 9999 };

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

async function crearEleccionConEstado(chainStatus: string, blockchainId = 7777) {
  const electionId = await createFixtureElection({
    blockchainId,
    name: `Eleccion ${chainStatus} ${Date.now()}`,
    candidates: ['Candidato A', 'Candidato B'],
  });
  await db.exec('UPDATE elections SET chain_status = ? WHERE id = ?', [chainStatus, electionId]);

  const candidatos = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );
  return { electionId, candidatos };
}

async function prepararVotante(electionId: number, email: string) {
  const user = await createFixtureUser({ email });
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);
  return user;
}

async function emitirVoto(
  user: { email: string; password: string },
  electionId: number,
  candidateId: number,
) {
  const { agent, csrf } = await loginAsFixture(user.email, user.password);
  return agent.post('/api/elections/register-vote').set('X-CSRF-Token', csrf).send({
    electionId,
    candidateId,
  });
}

function mockPuerto() {
  const port: VotePort = {
    castVote: vi.fn(async () => RECIBO),
    findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
    getTally: vi.fn(async () => [0, 0]),
  };
  setVotePortForTesting(port);
  return port;
}

describe('Punto 16: Regla 503 para elecciones pending en todas las cuentas (CLAUDE.md)', () => {
  it('usuario estándar recibe 503 ELECTION_NOT_ON_CHAIN si chain_status es pending', async () => {
    const port = mockPuerto();
    const { electionId, candidatos } = await crearEleccionConEstado('pending', 8001);
    const standardUser = await prepararVotante(electionId, `standard-${Date.now()}@ufv.es`);

    const res = await emitirVoto(standardUser, electionId, candidatos[0].id);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ELECTION_NOT_ON_CHAIN');
    expect(res.body.chainStatus).toBe('pending');
    expect(port.castVote).not.toHaveBeenCalled();

    const audit = await db.run('SELECT * FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(audit).toHaveLength(0);
  });

  it('usuario demo (@vtb.demo) TAMBIÉN recibe 503 si chain_status es pending (sin atajo)', async () => {
    const port = mockPuerto();
    const { electionId, candidatos } = await crearEleccionConEstado('pending', 8002);
    const demoUser = await prepararVotante(electionId, `demo-${Date.now()}@vtb.demo`);

    const res = await emitirVoto(demoUser, electionId, candidatos[0].id);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ELECTION_NOT_ON_CHAIN');
    expect(res.body.chainStatus).toBe('pending');
    expect(port.castVote).not.toHaveBeenCalled();

    const audit = await db.run('SELECT * FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(audit).toHaveLength(0);
  });

  it('usuario demo (@vtb.demo) TAMBIÉN recibe 503 si chain_status es failed', async () => {
    const port = mockPuerto();
    const { electionId, candidatos } = await crearEleccionConEstado('failed', 8003);
    const demoUser = await prepararVotante(electionId, `demo-fail-${Date.now()}@vtb.demo`);

    const res = await emitirVoto(demoUser, electionId, candidatos[0].id);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ELECTION_NOT_ON_CHAIN');
    expect(res.body.chainStatus).toBe('failed');
    expect(port.castVote).not.toHaveBeenCalled();

    const audit = await db.run('SELECT * FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(audit).toHaveLength(0);
  });

  it('cuando chain_status es synced, el voto procede normalmente', async () => {
    const port = mockPuerto();
    const { electionId, candidatos } = await crearEleccionConEstado('synced', 8004);
    const standardUser = await prepararVotante(electionId, `standard-ok-${Date.now()}@ufv.es`);

    const res = await emitirVoto(standardUser, electionId, candidatos[0].id);

    expect(res.status).toBe(200);
    expect(port.castVote).toHaveBeenCalled();

    const audit = await db.run('SELECT * FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(audit).toHaveLength(1);
  });
});
