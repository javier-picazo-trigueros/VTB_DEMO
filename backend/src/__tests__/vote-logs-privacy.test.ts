/**
 * SCRUM-17: el log del camino del voto no une persona con voto.
 *
 * Un console.error con `userId=… electionId=…` (o con un txHash al lado) es un
 * fichero de texto que recrea el vínculo que la base ya no guarda. Se permite
 * loguear electionId y txHash; nunca junto al usuario.
 *
 * Dos comprobaciones: una ESTÁTICA sobre el código (ninguna llamada a console
 * del camino del voto menciona al usuario, ni una que se añada mañana) y otra
 * en EJECUCIÓN (lo que de verdad se escribe cuando el voto sale bien, cuando la
 * cadena falla y cuando falla la reconciliación).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getDbClient } from '../db/index.js';
import { PgClient, type PoolLike, type ResultadoConsulta } from '../db/postgres.js';
import { setVotePortForTesting, type BusquedaDeVoto, type VotePort } from '../services/voteChain.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';

const db = getDbClient();
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Ficheros del camino del voto y de su reconciliación. */
const CAMINO_DEL_VOTO = ['routes/elections.ts', 'db/postgres.ts', 'db/voteRecord.ts', 'services/voteChain.ts'];

/** Cada llamada `console.x(...)`, completa (con sus paréntesis anidados). */
function llamadasAConsole(codigo: string): string[] {
  const llamadas: string[] = [];
  const re = /console\.(log|error|warn|info|debug)\(/g;
  for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
    let prof = 1;
    let i = m.index + m[0].length;
    for (; i < codigo.length && prof > 0; i++) {
      if (codigo[i] === '(') prof++;
      else if (codigo[i] === ')') prof--;
    }
    llamadas.push(codigo.slice(m.index, i));
  }
  return llamadas;
}

// El usuario en el texto de un log: userId, user_id, decoded.userId, email...
const MENCIONA_AL_USUARIO = /user[_ ]?id|decoded\.|\.email|\bemail\b|attempt\.user/i;

describe('el camino del voto no loguea al usuario', () => {
  for (const fichero of CAMINO_DEL_VOTO) {
    it(`${fichero}: ninguna llamada a console menciona al usuario`, () => {
      const codigo = readFileSync(path.join(src, fichero), 'utf-8');
      const llamadas = llamadasAConsole(codigo);
      expect(llamadas.filter(l => MENCIONA_AL_USUARIO.test(l))).toEqual([]);
    });
  }

  it('el recorrido estático sí detecta una llamada que menciona al usuario', () => {
    const mala = "console.error('fallo', `userId=${decoded.userId}`, `electionId=${e}`);";
    expect(llamadasAConsole(mala).filter(l => MENCIONA_AL_USUARIO.test(l))).toHaveLength(1);
  });
});

// ── En ejecución ────────────────────────────────────────────────────────────

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

function capturarConsola() {
  const lineas: string[] = [];
  for (const nivel of ['log', 'error', 'warn', 'info'] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
      lineas.push(args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}\n${JSON.stringify(a)}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
  return lineas;
}

async function eleccionVotable(chainId: number) {
  const user = await createFixtureUser({});
  const electionId = await createFixtureElection({
    blockchainId: chainId,
    name: `Logs ${Date.now()}-${chainId}`,
    candidates: ['Ana', 'Bruno'],
  });
  await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);
  const candidatos = await db.run<{ id: number }>(
    'SELECT id FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );
  return { user, electionId, candidatos };
}

async function votar(user: { email: string; password: string }, electionId: number, candidateId: number) {
  const { agent, csrf } = await loginAsFixture(user.email, user.password);
  return agent.post('/api/elections/register-vote').set('X-CSRF-Token', csrf).send({ electionId, candidateId });
}

function sinUsuario(lineas: string[], user: { email: string }) {
  const dedicadas = lineas.filter(l => /vote|voto|blockchain|cleanup|audit/i.test(l));
  expect(dedicadas.length).toBeGreaterThan(0); // el test captura algo del camino del voto
  for (const l of dedicadas) {
    expect(l).not.toMatch(/user[_ ]?id/i);
    expect(l).not.toContain(user.email);
  }
}

describe('lo que se escribe en el log al votar', () => {
  it('un voto confirmado', async () => {
    const port: VotePort = {
      castVote: vi.fn(async () => ({ txHash: '0x' + 'ee'.repeat(32), blockNumber: 77 })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    };
    setVotePortForTesting(port);
    const { user, electionId, candidatos } = await eleccionVotable(7001);
    const lineas = capturarConsola();

    expect((await votar(user, electionId, candidatos[0].id)).status).toBe(200);

    sinUsuario(lineas, user);
  });

  it('un fallo de la cadena', async () => {
    const port: VotePort = {
      castVote: vi.fn(async () => { throw new Error('nodo caído'); }),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    };
    setVotePortForTesting(port);
    const { user, electionId, candidatos } = await eleccionVotable(7002);
    const lineas = capturarConsola();

    expect((await votar(user, electionId, candidatos[0].id)).status).toBe(500);

    sinUsuario(lineas, user);
  });

  it('un fallo al confirmar en la base tras una transacción correcta (AUDIT INSERT FAILED)', async () => {
    const port: VotePort = {
      castVote: vi.fn(async () => ({ txHash: '0x' + 'ff'.repeat(32), blockNumber: 78 })),
      findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
      getTally: vi.fn(async () => [0, 0]),
    };
    setVotePortForTesting(port);
    const { user, electionId, candidatos } = await eleccionVotable(7003);
    // Fuerza el fallo de la transacción de confirmación: la tabla de votos ya
    // tiene ese nullifier, así que el INSERT choca con la clave única.
    const { generateNullifier } = await import('../utils/auth.js');
    const eleccion = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?', [electionId],
    );
    await db.exec(
      "INSERT INTO nullifier_audit (id, election_id, nullifier_hash, vote_source) VALUES ('id-previo', ?, ?, 'legacy')",
      [electionId, generateNullifier(user.id, electionId, eleccion!.ephemeral_salt)],
    );
    const lineas = capturarConsola();

    expect((await votar(user, electionId, candidatos[0].id)).status).toBe(200);

    expect(lineas.some(l => /AUDIT INSERT FAILED/.test(l))).toBe(true);
    sinUsuario(lineas, user);
  });
});

describe('lo que se escribe en el log al reconciliar', () => {
  it('un error al confirmar un intento no vuelca al usuario', async () => {
    const handle = async (sql: string): Promise<ResultadoConsulta> => {
      if (/FROM vote_attempts/i.test(sql) && /'pending'/.test(sql) && !/72 hours/.test(sql)) {
        return {
          rows: [{ id: 9, user_id: 4242, election_id: 5, nullifier_hash: '0xn', candidate_id: 7, tx_hash: null, nonce: null }],
          rowCount: 1,
        };
      }
      if (/FROM candidates/i.test(sql)) return { rows: [{ id: 7, position: 0 }], rowCount: 1 };
      if (/INSERT INTO nullifier_audit/i.test(sql)) {
        // Un error de PostgreSQL real trae los valores de la clave en `detail`.
        throw Object.assign(new Error('insert or update violates foreign key'), {
          detail: 'Key (election_id, user_id)=(5, 4242) is not present',
        });
      }
      return { rows: [], rowCount: 1 };
    };
    const pool: PoolLike = {
      query: handle,
      connect: async () => ({ query: handle, release: () => {} }),
      end: async () => {},
    };
    const lineas = capturarConsola();
    const encontrado = async (): Promise<BusquedaDeVoto> => ({
      estado: 'encontrado',
      recibo: { txHash: '0xtx', blockNumber: 9, candidatePosition: 0 },
    });

    await new PgClient('postgresql://no-se-conecta', pool).cleanupStaleVoteAttempts(encontrado);

    const errores = lineas.filter(l => /cleanup/.test(l));
    expect(errores.length).toBeGreaterThan(0);
    for (const l of errores) expect(l).not.toContain('4242');
  });
});
