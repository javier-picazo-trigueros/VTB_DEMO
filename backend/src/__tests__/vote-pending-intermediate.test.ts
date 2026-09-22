/**
 * Test de reproducción para Punto 1 del ajuste de Bloque 2:
 * Estado intermedio ("en proceso"), no confirmado, cuando tx.wait() agota el timeout.
 *
 * Si la transacción está en mempool y no se ha minado aún:
 * 1. NO se debe guardar en nullifier_audit (no está confirmada on-chain).
 * 2. NO se debe marcar vote_attempts como 'confirmed' (debe quedar en 'pending').
 * 3. La API responde 200 con pendingConfirmation = true.
 * 4. GET /api/elections/:id/eligibility indica que hay un voto en proceso ('vote_in_progress').
 * 5. Un intento inmediato de voto es bloqueado con 409 ("voto en curso").
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDbClient } from '../db/index.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';
import { setVotePortForTesting, type VotePort } from '../services/voteChain.js';

const db = getDbClient();

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

async function eleccionVotable(chainId: number) {
  const user = await createFixtureUser();
  const electionId = await createFixtureElection({
    blockchainId: chainId,
    name: `Voto Pendiente ${Date.now()}-${chainId}`,
    candidates: ['Candidato Uno', 'Candidato Dos'],
  });
  await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);

  const candidatos = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );
  return { user, electionId, candidatos };
}

describe('Punto 1: Estado intermedio pendiente (no confirmado) en timeout', () => {
  it('no inserta en nullifier_audit ni marca confirmed si la transacción no se ha minado', async () => {
    const fakeTxHash = '0x' + 'aa'.repeat(32);
    const mockPort: VotePort = {
      castVote: vi.fn(async () => ({
        txHash: fakeTxHash,
        blockNumber: null,
        status: 'pending_confirmation' as const,
      })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    };
    setVotePortForTesting(mockPort);

    const { user, electionId, candidatos } = await eleccionVotable(202);
    const { agent, csrf } = await loginAsFixture(user.email, user.password);

    const res = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pendingConfirmation).toBe(true);
    expect(res.body.status).toBe('pending_confirmation');

    // 1. nullifier_audit NO debe tener ninguna fila para esta elección
    const auditRows = await db.run(
      'SELECT id FROM nullifier_audit WHERE election_id = ? AND user_id = ?',
      [electionId, user.id],
    );
    expect(auditRows).toHaveLength(0);

    // 2. Si el motor tiene vote_attempts, debe estar 'pending', no 'confirmed'
    const hasTable = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='vote_attempts'",
    ).catch(() => null);
    if (hasTable) {
      const attempt = await db.get<{ status: string }>(
        'SELECT status FROM vote_attempts WHERE election_id = ? AND user_id = ?',
        [electionId, user.id],
      );
      expect(attempt?.status).toBe('pending');
    }
    if (db.hasPendingVoteLock) {
      expect(await db.hasPendingVoteLock(user.id, electionId)).toBe(true);
    }

    // 3. eligibility debe reportar que hay un voto en curso
    const eligRes = await agent.get(`/api/elections/${electionId}/eligibility`);
    expect(eligRes.status).toBe(200);
    expect(eligRes.body.eligible).toBe(false);
    expect(eligRes.body.reason).toBe('vote_in_progress');

    // 4. Intentar votar de nuevo inmediatamente devuelve 409
    const secondVote = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });
    expect(secondVote.status).toBe(409);
  });
});
