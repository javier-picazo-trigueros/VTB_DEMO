/**
 * Tests de concurrencia del relayer y timeout en confirmación de voto.
 *
 * Cubre el Punto 9 del Bloque 2:
 * 1. Serialización de envíos de la cuenta del relayer con gestión de nonce
 *    para evitar colisiones entre votos simultáneos.
 * 2. Timeout explícito en tx.wait() (inferior al timeout del cliente) que
 *    devuelve 'pending_confirmation' en vez de colgar la petición.
 * 3. Integración en POST /api/elections/register-vote: distingue "en proceso"
 *    de "fallido", persiste la auditoría con hash real y no deja al votante en limbo.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDbClient } from '../db/index.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';
import {
  setVotePortForTesting,
  type VotePort,
  type VoteReceipt,
  createVotePort,
  resetRelayerForTesting,
} from '../services/voteChain.js';

const db = getDbClient();

afterEach(() => {
  setVotePortForTesting(null);
  resetRelayerForTesting?.();
  vi.restoreAllMocks();
});

async function eleccionVotable(chainId: number) {
  const user = await createFixtureUser();
  const electionId = await createFixtureElection({
    blockchainId: chainId,
    name: `Voto Concurrente ${Date.now()}-${chainId}`,
    candidates: ['Candidato A', 'Candidato B'],
  });
  await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);

  const candidatos = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );
  return { user, electionId, candidatos };
}

describe('Punto 9: Concurrencia de relayer y timeout de confirmación', () => {
  it('serializa los envíos concurrentes con gestión de nonce secuencial', async () => {
    // Verificamos que al llamar concurrentemente a castVote en createVotePort,
    // se gestiona el nonce secuencialmente en lugar de enviar sin nonce o colisionar.
    const noncesUsados: number[] = [];
    const llamadasContrato: any[] = [];

    // Mockeamos la construcción de provider y wallet a nivel interno o probamos la serialización
    const fakeContract = {
      castVote: vi.fn(async (_id: any, _nullifier: any, _cand: any, overrides?: { nonce?: number }) => {
        llamadasContrato.push(overrides);
        if (overrides?.nonce !== undefined) {
          noncesUsados.push(overrides.nonce);
        }
        return {
          hash: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
          wait: vi.fn(async () => ({ blockNumber: 999 })),
        };
      }),
      deploymentBlock: vi.fn(async () => 1),
    };

    const port = createVotePort({
      rpcUrl: 'http://localhost:8545',
      contractAddress: '0x1111111111111111111111111111111111111111',
      privateKey: '0x' + '1'.repeat(64),
      // Inyección de contrato mock para inspeccionar overrides.nonce y concurrencia
      mockContract: fakeContract as any,
      mockInitialNonce: 42,
    });

    // Lanzar dos votos simultáneos
    const [res1, res2] = await Promise.all([
      port.castVote(1, '0x123', 0),
      port.castVote(1, '0x456', 1),
    ]);

    expect(res1.status).toBe('confirmed');
    expect(res2.status).toBe('confirmed');
    // Ambos deben haber recibido un nonce explícito y secuencial (42 y 43)
    expect(noncesUsados).toEqual([42, 43]);
  });

  it('tx.wait() con timeout explícito devuelve pending_confirmation en vez de colgarse', async () => {
    // Si tx.wait() tarda más que el timeout configurado, no debe colgar indefinidamente
    // ni lanzar error: debe retornar status 'pending_confirmation' con el txHash.
    const fakeContract = {
      castVote: vi.fn(async () => {
        return {
          hash: '0x' + 'cd'.repeat(32),
          // Simular que tx.wait nunca termina o tarda más que el timeout
          wait: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 5000))),
        };
      }),
      deploymentBlock: vi.fn(async () => 1),
    };

    const port = createVotePort({
      rpcUrl: 'http://localhost:8545',
      contractAddress: '0x1111111111111111111111111111111111111111',
      privateKey: '0x' + '1'.repeat(64),
      mockContract: fakeContract as any,
      mockInitialNonce: 10,
      waitTimeoutMs: 50, // Timeout ultracorto para el test
    });

    const res = await port.castVote(1, '0x123', 0);
    expect(res.status).toBe('pending_confirmation');
    expect(res.txHash).toBe('0x' + 'cd'.repeat(32));
    expect(res.blockNumber).toBeNull();
  });

  it('register-vote responde éxito con pendingConfirmation=true y persiste nullifier_audit sin bloquear', async () => {
    const fakeHash = '0x' + 'fe'.repeat(32);
    const mockPort: VotePort = {
      castVote: vi.fn(async () => ({
        txHash: fakeHash,
        blockNumber: null,
        status: 'pending_confirmation' as const,
      })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    };
    setVotePortForTesting(mockPort);

    const { user, electionId, candidatos } = await eleccionVotable(101);
    const { agent, csrf } = await loginAsFixture(user.email, user.password);

    const res = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pendingConfirmation).toBe(true);
    expect(res.body.txHash).toBe(fakeHash);
    expect(res.body.blockNumber).toBeNull();

    // Comprobar que en nullifier_audit se guardó el tx_hash y vote_source='chain'
    const auditRows = await db.run<{ tx_hash: string; block_number: number | null; vote_source: string }>(
      'SELECT tx_hash, block_number, vote_source FROM nullifier_audit WHERE election_id = ? AND user_id = ?',
      [electionId, user.id],
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].tx_hash).toBe(fakeHash);
    expect(auditRows[0].block_number).toBeNull();
    expect(auditRows[0].vote_source).toBe('chain');

    // Comprobar que un segundo intento de voto devuelve 409 (no permite doble voto)
    const res2 = await agent
      .post('/api/elections/register-vote')
      .set('X-CSRF-Token', csrf)
      .send({ electionId, candidateId: candidatos[0].id });
    expect(res2.status).toBe(409);
  });
});
