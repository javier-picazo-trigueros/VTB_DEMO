import { describe, it, expect } from 'vitest';
import { PgClient, type PoolLike, type ResultadoConsulta } from '../db/postgres.js';

function createMockPool() {
  const executedQueries: Array<{ sql: string; params: unknown[] }> = [];

  const handleQuery = async (sql: string, params: unknown[] = []): Promise<ResultadoConsulta> => {
    executedQueries.push({ sql, params });

    if (/FROM vote_attempts/i.test(sql) && /'pending'/.test(sql)) {
      return {
        rows: [
          {
            id: 1,
            user_id: 101,
            election_id: 5,
            nullifier_hash: '0xabc',
            candidate_id: 2,
            election_id_blockchain: 1,
            chain_contract_address: '0xcontract',
          },
        ],
        rowCount: 1,
      };
    }
    if (/FROM candidates/i.test(sql)) {
      return { rows: [{ id: 2, position: 0 }], rowCount: 1 };
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

  return { pool, executedQueries };
}

describe('Borrado de vote_attempts al confirmarse el voto', () => {
  it('elimina la fila de vote_attempts en releaseVoteLock cuando el voto se confirma (camino normal)', async () => {
    const { pool, executedQueries } = createMockPool();
    const client = new PgClient('postgresql://no-se-conecta', pool);

    await client.releaseVoteLock(101, 5, 'confirmed');

    // Debe ejecutar DELETE, no UPDATE
    const deleteQuery = executedQueries.find(q => /DELETE FROM vote_attempts/i.test(q.sql));
    const updateQuery = executedQueries.find(q => /UPDATE vote_attempts/i.test(q.sql));

    expect(deleteQuery).toBeDefined();
    expect(deleteQuery?.params).toEqual([101, 5]);
    expect(updateQuery).toBeUndefined();
  });

  it('elimina la fila de vote_attempts en cleanupStaleVoteAttempts cuando se confirma un voto pendiente', async () => {
    const { pool, executedQueries } = createMockPool();
    const client = new PgClient('postgresql://no-se-conecta', pool);

    await client.cleanupStaleVoteAttempts(async () => ({
      estado: 'encontrado',
      recibo: {
        txHash: '0xtx',
        blockNumber: 12345,
        candidatePosition: 0,
      },
    }));

    // Debe eliminar el intento confirmado de vote_attempts
    const deleteAttempt = executedQueries.find(q =>
      /DELETE FROM vote_attempts/i.test(q.sql) && q.params.includes(1)
    );
    expect(deleteAttempt).toBeDefined();
  });
});
