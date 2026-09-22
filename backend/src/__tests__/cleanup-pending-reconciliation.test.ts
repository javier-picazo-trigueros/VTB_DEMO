/**
 * Test de reproducción y verificación para Punto 2:
 * El job de reconciliación (cleanupStaleVoteAttempts) debe resolver los votos pendientes:
 * 1. Si la transacción se mina (encontrado): confirmarlo e insertar nullifier_audit.
 * 2. Si la transacción se revierte o desaparece (no-esta): marcarlo como failed con detalle,
 *    permitiendo al usuario votar de nuevo (acquireVoteLock vuelve a tener éxito).
 */
import { describe, it, expect, vi } from 'vitest';
import { PgClient, type PoolLike, type ResultadoConsulta } from '../db/postgres.js';
import type { BusquedaDeVoto } from '../services/voteChain.js';
import { VoteConflictError } from '../db/client.js';

interface AttemptRow {
  id: number;
  user_id: number;
  election_id: number;
  nullifier_hash: string | null;
  candidate_id: number | null;
  status: 'pending' | 'confirmed' | 'failed';
  error_detail?: string | null;
}

function createMockPg(initialAttempts: AttemptRow[]) {
  const attempts = [...initialAttempts];
  const auditRows: Array<Record<string, unknown>> = [];
  const queryLogs: Array<{ sql: string; params: unknown[] }> = [];

  const handleQuery = async (sql: string, params: unknown[] = []): Promise<ResultadoConsulta> => {
    queryLogs.push({ sql, params });

    // 1. SELECT stale pending attempts
    if (/FROM vote_attempts/i.test(sql) && /'pending'/.test(sql)) {
      const pending = attempts.filter(a => a.status === 'pending');
      return { rows: pending, rowCount: pending.length };
    }

    // 2. Candidates query
    if (/FROM candidates/i.test(sql)) {
      return { rows: [{ id: 10, position: 0 }], rowCount: 1 };
    }

    // 3. UPDATE vote_attempts to confirmed
    if (/UPDATE vote_attempts/i.test(sql) && /confirmed/i.test(String(params[0]))) {
      const id = Number(params[1]);
      const att = attempts.find(a => a.id === id);
      if (att) {
        att.status = 'confirmed';
      }
      return { rows: [], rowCount: 1 };
    }

    // 4. UPDATE vote_attempts to failed
    if (/UPDATE vote_attempts/i.test(sql) && /failed/i.test(String(params[0]))) {
      const id = Number(params[1]);
      const att = attempts.find(a => a.id === id);
      if (att) {
        att.status = 'failed';
        att.error_detail = String(params[2] ?? '');
      }
      return { rows: [], rowCount: 1 };
    }

    // 5. INSERT into nullifier_audit
    if (/INSERT INTO nullifier_audit/i.test(sql)) {
      auditRows.push({
        user_id: params[0],
        election_id: params[1],
        nullifier_hash: params[2],
        tx_hash: params[3],
        block_number: params[4],
        candidate_id: params[5],
        vote_source: params[7],
      });
      return { rows: [], rowCount: 1 };
    }

    // 6. acquireVoteLock simulation (INSERT ... ON CONFLICT ... DO UPDATE ... WHERE status='failed')
    if (/INSERT INTO vote_attempts/i.test(sql)) {
      const userId = Number(params[0]);
      const electionId = Number(params[1]);
      const nullifier = String(params[2]);
      const candId = Number(params[3]);

      const existing = attempts.find(a => a.user_id === userId && a.election_id === electionId);
      if (!existing) {
        const newAtt: AttemptRow = {
          id: attempts.length + 1,
          user_id: userId,
          election_id: electionId,
          nullifier_hash: nullifier,
          candidate_id: candId,
          status: 'pending',
        };
        attempts.push(newAtt);
        return { rows: [], rowCount: 1 };
      }

      if (existing.status === 'failed') {
        existing.status = 'pending';
        existing.nullifier_hash = nullifier;
        existing.candidate_id = candId;
        existing.error_detail = null;
        return { rows: [], rowCount: 1 };
      }

      // Conflict: status is pending or confirmed
      return { rows: [], rowCount: 0 };
    }

    // 7. hasPendingVoteLock query
    if (/SELECT id FROM vote_attempts WHERE user_id/i.test(sql) && /status = 'pending'/i.test(sql)) {
      const userId = Number(params[0]);
      const electionId = Number(params[1]);
      const isPending = attempts.some(a => a.user_id === userId && a.election_id === electionId && a.status === 'pending');
      return { rows: isPending ? [{ id: 1 }] : [], rowCount: isPending ? 1 : 0 };
    }

    return { rows: [], rowCount: 1 };
  };

  const pool: PoolLike = {
    query: handleQuery,
    connect: async () => ({
      query: handleQuery,
      release: () => {},
    }),
    end: async () => {},
  };

  const client = new PgClient('postgresql://no-se-conecta', pool);
  return { client, attempts, auditRows, queryLogs };
}

describe('Punto 2: Reconciliación de votos pendientes (cleanupStaleVoteAttempts)', () => {
  it('confirma el voto en base e inserta nullifier_audit cuando la tx se mina on-chain', async () => {
    const { client, attempts, auditRows } = createMockPg([
      {
        id: 42,
        user_id: 101,
        election_id: 5,
        nullifier_hash: '0xnullifier101',
        candidate_id: 10,
        status: 'pending',
      },
    ]);

    const checkOnChain = vi.fn(async (): Promise<BusquedaDeVoto> => ({
      estado: 'encontrado',
      recibo: { txHash: '0xmined123', blockNumber: 9999, candidatePosition: 0 },
    }));

    await client.cleanupStaleVoteAttempts(checkOnChain);

    expect(attempts[0].status).toBe('confirmed');
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].tx_hash).toBe('0xmined123');
    expect(auditRows[0].block_number).toBe(9999);
    expect(auditRows[0].vote_source).toBe('chain');

    // No debe haber cerrojo pendiente tras confirmarse
    const hasLock = await client.hasPendingVoteLock(101, 5);
    expect(hasLock).toBe(false);

    // Intentar volver a votar debe fallar con VoteConflictError
    await expect(client.acquireVoteLock(101, 5, '0xnew', 10)).rejects.toThrow(VoteConflictError);
  });

  it('Caso 1 (revertida): marca el intento como failed con detalle si hay recibo con status 0', async () => {
    const { client, attempts, auditRows } = createMockPg([
      {
        id: 43,
        user_id: 102,
        election_id: 5,
        nullifier_hash: '0xnullifier102',
        candidate_id: 10,
        status: 'pending',
      },
    ]);

    const checkOnChain = vi.fn(async (): Promise<BusquedaDeVoto> => ({
      estado: 'revertido',
      motivo: 'execution reverted (status 0)',
    }));

    await client.cleanupStaleVoteAttempts(checkOnChain);

    expect(attempts[0].status).toBe('failed');
    expect(attempts[0].error_detail).toMatch(/revertida/i);
    expect(auditRows).toHaveLength(0);

    // Permite reintento al quedar en failed
    await expect(client.acquireVoteLock(102, 5, '0xnullifier102_retry', 10)).resolves.not.toThrow();
    expect(attempts[0].status).toBe('pending');
  });

  it('Caso 2 (reemplazada): marca el intento como failed con detalle si el nonce ya lo consumió otra tx', async () => {
    const { client, attempts, auditRows } = createMockPg([
      {
        id: 44,
        user_id: 103,
        election_id: 5,
        nullifier_hash: '0xnullifier103',
        candidate_id: 10,
        status: 'pending',
      },
    ]);

    const checkOnChain = vi.fn(async (): Promise<BusquedaDeVoto> => ({
      estado: 'reemplazado',
      motivo: 'nonce consumido por otra transaccion',
    }));

    await client.cleanupStaleVoteAttempts(checkOnChain);

    expect(attempts[0].status).toBe('failed');
    expect(attempts[0].error_detail).toMatch(/reemplazada|nonce/i);
    expect(auditRows).toHaveLength(0);

    // Permite reintento al quedar en failed
    await expect(client.acquireVoteLock(103, 5, '0xnullifier103_retry', 10)).resolves.not.toThrow();
    expect(attempts[0].status).toBe('pending');
  });

  it('Caso 3 (no encontrada pero nonce sigue libre): DEBE SEGUIR EN PENDING (mempool o RPC con retraso)', async () => {
    const { client, attempts, auditRows, queryLogs } = createMockPg([
      {
        id: 45,
        user_id: 104,
        election_id: 5,
        nullifier_hash: '0xnullifier104',
        candidate_id: 10,
        status: 'pending',
      },
    ]);

    const checkOnChain = vi.fn(async (): Promise<BusquedaDeVoto> => ({
      estado: 'no-esta',
      definitivo: false,
    }));

    await client.cleanupStaleVoteAttempts(checkOnChain);

    // NO debe marcarse como failed; debe permanecer en 'pending'
    expect(attempts[0].status).toBe('pending');
    expect(attempts[0].error_detail).toBeFalsy();
    expect(auditRows).toHaveLength(0);

    // El cerrojo sigue activo como pendiente
    const hasLock = await client.hasPendingVoteLock(104, 5);
    expect(hasLock).toBe(true);

    // No debe haber ninguna query de UPDATE vote_attempts SET status='failed'
    const failedUpdates = queryLogs.filter(q => /UPDATE vote_attempts/i.test(q.sql) && /failed/i.test(String(q.params[0])));
    expect(failedUpdates).toHaveLength(0);
  });
});
