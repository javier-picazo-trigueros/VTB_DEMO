/**
 * El atajo de voto de las cuentas @vtb.demo (voto fuera de cadena, sin hash) solo
 * existe donde las cuentas de demostración están habilitadas. En producción esas
 * cuentas votan por el camino normal: en cadena o 503, nunca un voto sin
 * transacción presentado como válido.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDbClient } from '../db/index.js';
import { setVotePortForTesting, type VotePort } from '../services/voteChain.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  DEMO_LOGIN_ENABLED: process.env.DEMO_LOGIN_ENABLED,
};

afterEach(() => {
  for (const [clave, valor] of Object.entries(ORIGINAL_ENV)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

describe('atajo de voto @vtb.demo', () => {
  async function votoDemo() {
    const db = getDbClient();
    const user = await createFixtureUser({ email: `demo-${Date.now()}@vtb.demo` });
    const electionId = await createFixtureElection({ name: `Atajo demo ${Date.now()}` });
    await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
    await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);
    const candidato = await db.get<{ id: number }>(
      'SELECT id FROM candidates WHERE election_id = ? ORDER BY position LIMIT 1', [electionId],
    );
    const port: VotePort = {
      castVote: vi.fn(async () => ({ txHash: '0x' + 'cc'.repeat(32), blockNumber: 1, status: 'confirmed' as const })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    };
    setVotePortForTesting(port);
    const { agent, csrf } = await loginAsFixture(user.email, user.password);
    return { agent, csrf, electionId, candidatoId: candidato!.id, port };
  }

  const votar = (v: Awaited<ReturnType<typeof votoDemo>>) =>
    v.agent.post('/api/elections/register-vote').set('X-CSRF-Token', v.csrf)
      .send({ electionId: v.electionId, candidateId: v.candidatoId });

  it('con las cuentas demo habilitadas, el voto se guarda sin tocar la cadena', async () => {
    const v = await votoDemo();
    const res = await votar(v);
    expect(res.status).toBe(200);
    expect(res.body.isDemo).toBe(true);
    expect(res.body.txHash).toBeNull();
    expect(v.port.castVote).not.toHaveBeenCalled();
  });

  it('en producción, sin DEMO_LOGIN_ENABLED, la cuenta vota por el camino normal', async () => {
    const v = await votoDemo();                // sesión iniciada con el entorno de test
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_LOGIN_ENABLED;

    const res = await votar(v);

    expect(res.body.isDemo).not.toBe(true);
    expect(v.port.castVote).toHaveBeenCalledTimes(1);
  });
});
