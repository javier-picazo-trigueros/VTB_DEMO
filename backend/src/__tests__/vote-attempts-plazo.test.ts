/**
 * SCRUM-17: plazo máximo de vote_attempts.
 *
 * vote_attempts guarda usuario y nullifier mientras un voto está sin resolver.
 * Se borra al confirmarse, pero un intento 'failed' o un 'pending' cuyo nodo
 * nunca contesta se quedaban para siempre: el vínculo persona-nullifier, sin
 * fecha de caducidad. Ahora cada pasada del job de limpieza los borra pasado el
 * plazo. Pool falso, como en cleanup-vote-attempts.test.ts: sin base de datos.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PgClient,
  VOTE_ATTEMPT_FAILED_TTL_HOURS,
  VOTE_ATTEMPT_PENDING_TTL_HOURS,
  type PoolLike,
  type ResultadoConsulta,
} from '../db/postgres.js';

function poolFalso(caducados: unknown[] = []) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const handle = async (sql: string, params: unknown[] = []): Promise<ResultadoConsulta> => {
    consultas.push({ sql, params });
    if (/^\s*SELECT id, election_id, tx_hash FROM vote_attempts/i.test(sql)) {
      return { rows: caducados, rowCount: caducados.length };
    }
    return { rows: [], rowCount: 0 };
  };
  const pool: PoolLike = {
    query: handle,
    connect: async () => ({ query: handle, release: () => {} }),
    end: async () => {},
  };
  return { pool, consultas };
}

describe('caducidad de vote_attempts', () => {
  it('cada pasada del job borra los intentos fallidos y los colgados pasado su plazo', async () => {
    const { pool, consultas } = poolFalso();
    await new PgClient('postgresql://no-se-conecta', pool).cleanupStaleVoteAttempts(vi.fn());

    const purga = consultas.find(c => /DELETE FROM vote_attempts/i.test(c.sql) && /failed/.test(c.sql));
    expect(purga, 'no hay ninguna purga de vote_attempts caducados').toBeDefined();
    expect(purga!.sql).toMatch(/status\s*=\s*'failed'/);
    expect(purga!.sql).toMatch(/status\s*=\s*'pending'/);
    expect(purga!.sql).toContain(`${VOTE_ATTEMPT_FAILED_TTL_HOURS} hours`);
    expect(purga!.sql).toContain(`${VOTE_ATTEMPT_PENDING_TTL_HOURS} hours`);
  });

  it('el plazo de un pendiente es mayor que el ciclo de reconciliación (30 min)', () => {
    // Si caducara antes de que el job pueda resolverlo, se perdería el intento
    // de un voto que quizá sí está en la cadena.
    expect(VOTE_ATTEMPT_PENDING_TTL_HOURS).toBeGreaterThanOrEqual(24);
  });

  it('antes de borrar un pendiente caducado deja en el log intento, elección y tx, sin usuario', async () => {
    const { pool, consultas } = poolFalso([{ id: 42, election_id: 5, tx_hash: '0xabc' }]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await new PgClient('postgresql://no-se-conecta', pool).cleanupStaleVoteAttempts(vi.fn());

    const linea = error.mock.calls.map(c => c.join(' ')).find(l => l.includes('caducado'));
    error.mockRestore();
    expect(linea).toContain('intento=42');
    expect(linea).toContain('eleccion=5');
    expect(linea).toContain('0xabc');
    expect(linea).not.toMatch(/user/i);

    const iSelect = consultas.findIndex(c => /SELECT id, election_id, tx_hash/i.test(c.sql));
    const iDelete = consultas.findIndex(c => /DELETE FROM vote_attempts/i.test(c.sql) && /INTERVAL/.test(c.sql));
    expect(iSelect).toBeGreaterThanOrEqual(0);
    expect(iSelect).toBeLessThan(iDelete);
  });
});
