/**
 * Test para Punto 4:
 * Registro explícito de discrepancia si el candidato del evento on-chain
 * no coincide con el candidato registrado en el intento.
 *
 * Si el intento tenía candidate_id=10 pero el evento on-chain tiene posición 1 (candidate_id=20):
 * - NO se debe sobrescribir en silencio.
 * - vote_attempts.error_detail debe registrar la discrepancia explícita:
 *   e.g. "DISCREPANCY: candidato on-chain (20) no coincide con intento (10)".
 * - Se emite advertencia en logs.
 * - nullifier_audit refleja el candidato real de la cadena (20).
 */
import { describe, it, expect, vi } from 'vitest';
import { PgClient, type PoolLike, type ResultadoConsulta } from '../db/postgres.js';
import type { BusquedaDeVoto } from '../services/voteChain.js';

interface AttemptRow {
  id: number;
  user_id: number;
  election_id: number;
  nullifier_hash: string | null;
  candidate_id: number | null;
  status: 'pending' | 'confirmed' | 'failed';
  error_detail?: string | null;
}

function createDiscrepancyMockPg(
  attempt: AttemptRow,
  candidates: Array<{ id: number; position: number }> = [
    { id: 10, position: 0 },
    { id: 20, position: 1 },
  ],
) {
  const attempts = [attempt];
  const auditRows: Array<Record<string, unknown>> = [];
  const queryLogs: Array<{ sql: string; params: unknown[] }> = [];

  const handleQuery = async (sql: string, params: unknown[] = []): Promise<ResultadoConsulta> => {
    queryLogs.push({ sql, params });

    if (/FROM vote_attempts/i.test(sql) && /'pending'/.test(sql)) {
      return { rows: attempts.filter(a => a.status === 'pending'), rowCount: 1 };
    }

    if (/FROM candidates/i.test(sql)) {
      const pos = params[1];
      const match = candidates.find(c => c.position === pos);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (/UPDATE vote_attempts/i.test(sql) && /confirmed/i.test(String(params[0]))) {
      const id = Number(params[1]);
      const att = attempts.find(a => a.id === id);
      if (att) {
        att.status = 'confirmed';
        // error_detail puede ser params[2] en consultas posicionales
        att.error_detail = params[2] ? String(params[2]) : null;
      }
      return { rows: [], rowCount: 1 };
    }

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

describe('Punto 4: Detección y registro de discrepancia de candidato en recuperación', () => {
  it('registra discrepancia explícita en vote_attempts.error_detail cuando el candidato on-chain difiere del intento', async () => {
    // Intento registró candidate_id=10
    const { client, attempts, auditRows } = createDiscrepancyMockPg({
      id: 50,
      user_id: 200,
      election_id: 1,
      nullifier_hash: '0xnullifier200',
      candidate_id: 10,
      status: 'pending',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Evento on-chain indica candidatePosition: 1 (que mapea a candidate_id=20, ¡diferente de 10!)
    const checkOnChain = vi.fn(async (): Promise<BusquedaDeVoto> => ({
      estado: 'encontrado',
      recibo: { txHash: '0xdiscrepant_tx', blockNumber: 1234, candidatePosition: 1 },
    }));

    await client.cleanupStaleVoteAttempts(checkOnChain);

    expect(attempts[0].status).toBe('confirmed');
    // Debe haber registrado discrepancia explícita en error_detail
    expect(attempts[0].error_detail).toMatch(/DISCREPANC/i);
    expect(attempts[0].error_detail).toContain('20');
    expect(attempts[0].error_detail).toContain('10');

    // Debe haber emitido advertencia por consola
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/DISCREPANC/i),
    );

    // nullifier_audit debe contener el candidato verificado on-chain (20)
    expect(auditRows[0].candidate_id).toBe(20);

    warnSpy.mockRestore();
  });

  it('no registra discrepancia si el candidato on-chain coincide con el del intento', async () => {
    // Intento registró candidate_id=10
    const { client, attempts } = createDiscrepancyMockPg({
      id: 51,
      user_id: 201,
      election_id: 1,
      nullifier_hash: '0xnullifier201',
      candidate_id: 10,
      status: 'pending',
    });

    // Evento on-chain indica candidatePosition: 0 (mapea a candidate_id=10, coincide)
    const checkOnChain = vi.fn(async (): Promise<BusquedaDeVoto> => ({
      estado: 'encontrado',
      recibo: { txHash: '0xmatching_tx', blockNumber: 1235, candidatePosition: 0 },
    }));

    await client.cleanupStaleVoteAttempts(checkOnChain);

    expect(attempts[0].status).toBe('confirmed');
    expect(attempts[0].error_detail).toBeNull();
  });
});
