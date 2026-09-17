/**
 * El job que decide si un voto se da por perdido.
 *
 * cleanupStaleVoteAttempts es el último recurso cuando la transacción entró en
 * la cadena pero el registro en la base no llegó a escribirse. Si se equivoca,
 * un voto legítimo desaparece del escrutinio sin que nadie se entere.
 *
 * No tenía ni un test, y no por descuido: vive en PgClient, que construía su
 * propio Pool en el constructor, así que no había forma de ejecutarlo sin una
 * base de PostgreSQL delante. Y los tests de este proyecto corren sobre SQLite
 * en memoria por una razón que no se negocia (una ejecución contra Supabase
 * llegó a sobrescribir las contraseñas de administración).
 *
 * PgClient acepta ahora un pool inyectado. Estos tests ejercitan el código real
 * del job —el mismo que corre en producción— con un pool falso que apunta las
 * consultas, sin tocar ninguna base de datos.
 */
import { describe, it, expect, vi } from 'vitest';
import { PgClient, type PoolLike, type ResultadoConsulta } from '../db/postgres.js';
import type { BusquedaDeVoto } from '../services/voteChain.js';

interface IntentoPendiente {
  id: number;
  user_id: number;
  election_id: number;
  nullifier_hash: string | null;
  candidate_id: number | null;
}

const intento = (over: Partial<IntentoPendiente> = {}): IntentoPendiente => ({
  id: 1,
  user_id: 10,
  election_id: 5,
  nullifier_hash: '0xnullifier',
  candidate_id: 7,
  ...over,
});

/**
 * Pool falso: devuelve los intentos pendientes a la consulta del job y apunta
 * todo lo que se le pida escribir.
 */
function poolFalso(pendientes: IntentoPendiente[]) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];

  const pool: PoolLike = {
    async query(sql: string, params: unknown[] = []): Promise<ResultadoConsulta> {
      consultas.push({ sql, params });
      if (/FROM vote_attempts/i.test(sql) && /'pending'/.test(sql)) {
        return { rows: pendientes, rowCount: pendientes.length };
      }
      return { rows: [], rowCount: 1 };
    },
    connect: async () => { throw new Error('transaction() no se usa en este job'); },
    end: async () => {},
  };

  const escrituras = () => consultas.filter(c => /UPDATE|INSERT/i.test(c.sql));
  const actualizaciones = () => consultas.filter(c => /UPDATE vote_attempts/i.test(c.sql));
  const inserciones = () => consultas.filter(c => /INSERT INTO nullifier_audit/i.test(c.sql));

  return { pool, consultas, escrituras, actualizaciones, inserciones };
}

const clienteCon = (pool: PoolLike) => new PgClient('postgresql://no-se-conecta', pool);

const respuesta = (r: BusquedaDeVoto) => vi.fn(async () => r);

describe('cleanupStaleVoteAttempts', () => {
  it('BC-24: si la cadena no responde, el intento se deja como estaba', async () => {
    // Lo que pasaba antes: un fallo del RPC era indistinguible de "no está en la
    // cadena", y el intento se marcaba 'failed'. El voto estaba registrado en la
    // cadena y quedaba descartado del escrutinio, en silencio.
    const { pool, escrituras } = poolFalso([intento()]);
    const checkOnChain = respuesta({ estado: 'sin-respuesta', motivo: 'could not coalesce error' });

    await clienteCon(pool).cleanupStaleVoteAttempts(checkOnChain);

    expect(checkOnChain).toHaveBeenCalledWith('0xnullifier');
    // Ni una escritura: ni marcarlo fallido, ni confirmarlo.
    expect(escrituras()).toEqual([]);
  });

  it('si el voto está en la cadena, lo confirma y reconstruye la fila de auditoría', async () => {
    const { pool, actualizaciones, inserciones } = poolFalso([intento()]);
    const checkOnChain = respuesta({
      estado: 'encontrado',
      recibo: { txHash: '0xtx', blockNumber: 987 },
    });

    await clienteCon(pool).cleanupStaleVoteAttempts(checkOnChain);

    expect(actualizaciones()).toHaveLength(1);
    expect(actualizaciones()[0].params[0]).toBe('confirmed');

    expect(inserciones()).toHaveLength(1);
    const [userId, electionId, nullifier, txHash, blockNumber, candidateId, voteChoice] =
      inserciones()[0].params;
    expect([userId, electionId, nullifier]).toEqual([10, 5, '0xnullifier']);
    expect([txHash, blockNumber]).toEqual(['0xtx', 987]);
    expect([candidateId, voteChoice]).toEqual([7, '7']);
    // Protege contra doble inserción si la ruta ya la había escrito.
    expect(inserciones()[0].sql).toMatch(/ON CONFLICT \(user_id, election_id\) DO NOTHING/);
  });

  it('si el voto no está en la cadena, lo marca fallido y no inventa una fila', async () => {
    const { pool, actualizaciones, inserciones } = poolFalso([intento()]);

    await clienteCon(pool).cleanupStaleVoteAttempts(respuesta({ estado: 'no-esta' }));

    expect(actualizaciones()).toHaveLength(1);
    expect(actualizaciones()[0].params[0]).toBe('failed');
    expect(inserciones()).toEqual([]);
  });

  it('con varios intentos, solo se deja pendiente el que no obtuvo respuesta', async () => {
    // El caso realista: el nodo responde a unos y a otros no.
    const { pool, actualizaciones } = poolFalso([
      intento({ id: 1, nullifier_hash: '0xa' }),
      intento({ id: 2, nullifier_hash: '0xb' }),
      intento({ id: 3, nullifier_hash: '0xc' }),
    ]);

    const checkOnChain = vi.fn(async (n: string): Promise<BusquedaDeVoto> => {
      if (n === '0xa') return { estado: 'encontrado', recibo: { txHash: '0xtx', blockNumber: 1 } };
      if (n === '0xb') return { estado: 'sin-respuesta', motivo: 'timeout' };
      return { estado: 'no-esta' };
    });

    await clienteCon(pool).cleanupStaleVoteAttempts(checkOnChain);

    expect(checkOnChain).toHaveBeenCalledTimes(3);
    const tocados = actualizaciones().map(c => c.params[1]);
    expect(tocados).toEqual([1, 3]);
    expect(tocados).not.toContain(2);
  });

  it('un intento que falla no impide procesar los siguientes', async () => {
    const { pool, actualizaciones } = poolFalso([
      intento({ id: 1, nullifier_hash: '0xa' }),
      intento({ id: 2, nullifier_hash: '0xb' }),
    ]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const checkOnChain = vi.fn(async (n: string): Promise<BusquedaDeVoto> => {
      if (n === '0xa') throw new Error('algo revienta al consultar');
      return { estado: 'no-esta' };
    });

    await clienteCon(pool).cleanupStaleVoteAttempts(checkOnChain);

    expect(actualizaciones()).toHaveLength(1);
    expect(actualizaciones()[0].params[1]).toBe(2);
  });

  it('un intento sin nullifier no se consulta y se marca fallido', async () => {
    // No hay nada que buscar en la cadena: sin nullifier no se puede localizar.
    const { pool, actualizaciones } = poolFalso([intento({ nullifier_hash: null })]);
    const checkOnChain = respuesta({ estado: 'no-esta' });

    await clienteCon(pool).cleanupStaleVoteAttempts(checkOnChain);

    expect(checkOnChain).not.toHaveBeenCalled();
    expect(actualizaciones()[0].params[0]).toBe('failed');
  });

  it('solo mira intentos pendientes de más de media hora', async () => {
    const { pool, consultas } = poolFalso([]);

    await clienteCon(pool).cleanupStaleVoteAttempts(respuesta({ estado: 'no-esta' }));

    expect(consultas).toHaveLength(1);
    expect(consultas[0].sql).toMatch(/status = 'pending'/);
    expect(consultas[0].sql).toMatch(/INTERVAL '30 minutes'/);
  });
});
