/**
 * SCRUM-17, opción A: "esta persona ha votado" y "hay un voto para este
 * candidato" viven en tablas distintas y ninguna fila une a una persona con su
 * candidato, su nullifier o su transacción.
 *
 * El recorrido del esquema es el test que importa: no comprueba un sitio
 * concreto, sino que NINGUNA tabla —ni una que se añada mañana— vuelva a
 * guardar user_id junto a nullifier_hash, candidate_id o tx_hash.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDbClient } from '../db/index.js';
import { getDatabase } from '../config/database.js';
import { PgClient, type PoolLike, type ResultadoConsulta } from '../db/postgres.js';
import { recordConfirmedVote } from '../db/voteRecord.js';
import { setVotePortForTesting, type BusquedaDeVoto, type VotePort } from '../services/voteChain.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';

const db = getDbClient();

// ── Recorrido del esquema ───────────────────────────────────────────────────

const COLUMNAS_QUE_DELATAN = ['nullifier_hash', 'candidate_id', 'tx_hash'];

/**
 * La ÚNICA tabla exenta es vote_attempts. Es el cerrojo del voto en curso:
 * guarda usuario, nullifier y candidato MIENTRAS el voto está pendiente, porque
 * la reconciliación necesita saber de quién es para confirmarlo. Se borra en la
 * misma transacción que confirma el voto y caduca a las 24 h (fallidos) o 72 h
 * (colgados). SEGURIDAD.md lo recoge como lo que sigue sin cubrirse.
 */
const EXENTAS = new Set(['vote_attempts']);

/** Tablas que guardan user_id junto a alguna de las columnas que delatan. */
function culpables(columnasPorTabla: Map<string, string[]>): string[] {
  const res: string[] = [];
  for (const [tabla, cols] of columnasPorTabla) {
    if (EXENTAS.has(tabla)) continue;
    if (cols.includes('user_id') && cols.some(c => COLUMNAS_QUE_DELATAN.includes(c))) res.push(tabla);
  }
  return res;
}

async function esquemaSqlite(): Promise<Map<string, string[]>> {
  const tablas = await db.run<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const res = new Map<string, string[]>();
  for (const { name } of tablas) {
    const cols = await db.run<{ name: string }>(`PRAGMA table_info(${name})`);
    res.set(name, cols.map(c => c.name));
  }
  return res;
}

describe('esquema: ninguna tabla une persona con voto', () => {
  it('SQLite: ninguna tabla tiene user_id junto a nullifier_hash, candidate_id o tx_hash (salvo vote_attempts)', async () => {
    expect(culpables(await esquemaSqlite())).toEqual([]);
  });

  it('el recorrido detecta una tabla nueva que vuelva a mezclarlos', async () => {
    const raw = getDatabase();
    await raw.exec('CREATE TABLE tabla_mala_scrum17 (user_id INTEGER, tx_hash TEXT)');
    try {
      expect(culpables(await esquemaSqlite())).toEqual(['tabla_mala_scrum17']);
    } finally {
      await raw.exec('DROP TABLE tabla_mala_scrum17');
    }
  });

  it('la tabla de votos no tiene user_id, y la de participación no tiene nada del voto', async () => {
    const esquema = await esquemaSqlite();
    const votos = esquema.get('nullifier_audit')!;
    expect(votos).not.toContain('user_id');
    expect(votos).not.toContain('vote_choice');
    expect([...esquema.get('election_participations')!].sort()).toEqual(['election_id', 'user_id']);
  });

  // La misma comprobación contra information_schema de un PostgreSQL LOCAL (p. ej.
  // el de Docker donde se prueba la migración 016). Nunca contra Supabase: exige
  // host local y solo corre si se pide expresamente.
  const urlPg = process.env.VTB_SCHEMA_TEST_PG_URL;
  it.skipIf(!urlPg)('PostgreSQL: lo mismo, sobre information_schema', async () => {
    const host = new URL(urlPg!).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      throw new Error(`VTB_SCHEMA_TEST_PG_URL debe apuntar a un PostgreSQL local, no a ${host}`);
    }
    const cliente = new PgClient(urlPg!);
    try {
      const filas = await cliente.run<{ table_name: string; column_name: string }>(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
      );
      const esquema = new Map<string, string[]>();
      for (const f of filas) esquema.set(f.table_name, [...(esquema.get(f.table_name) ?? []), f.column_name]);
      expect(culpables(esquema)).toEqual([]);
    } finally {
      await cliente.close();
    }
  });
});

// ── Camino normal del voto ──────────────────────────────────────────────────

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

async function eleccionVotable(chainId: number) {
  const user = await createFixtureUser({});
  const electionId = await createFixtureElection({
    blockchainId: chainId,
    name: `Participacion ${Date.now()}-${chainId}`,
    candidates: ['Ana', 'Bruno'],
  });
  await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);
  const candidatos = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );
  return { user, electionId, candidatos };
}

function puertoConfirmado() {
  const port: VotePort = {
    castVote: vi.fn(async () => ({ txHash: '0x' + 'cd'.repeat(32), blockNumber: 4321 })),
    findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
    getTally: vi.fn(async () => [0, 0]),
  };
  setVotePortForTesting(port);
  return port;
}

async function votar(user: { email: string; password: string }, electionId: number, candidateId: number) {
  const { agent, csrf } = await loginAsFixture(user.email, user.password);
  return agent.post('/api/elections/register-vote').set('X-CSRF-Token', csrf).send({ electionId, candidateId });
}

describe('un voto confirmado', () => {
  it('deja la participación y el voto, y no deja ninguna fila en vote_attempts', async () => {
    puertoConfirmado();
    const { user, electionId, candidatos } = await eleccionVotable(6001);

    const res = await votar(user, electionId, candidatos[0].id);
    expect(res.status).toBe(200);
    expect(res.body.pendingConfirmation).toBe(false);

    const participacion = await db.run(
      'SELECT * FROM election_participations WHERE election_id = ? AND user_id = ?',
      [electionId, user.id],
    );
    expect(participacion).toEqual([{ election_id: electionId, user_id: user.id }]);

    const votos = await db.run<Record<string, unknown>>('SELECT * FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(votos).toHaveLength(1);
    expect(votos[0].vote_source).toBe('chain');
    expect(votos[0]).not.toHaveProperty('user_id');
    // Id aleatorio (UUID), nunca un autoincremental que empareje por orden.
    expect(String(votos[0].id)).toMatch(/^[0-9a-f-]{36}$/);
    // Hora al minuto: sin segundos.
    expect(String(votos[0].generated_at)).toMatch(/:00$/);

    const intentos = await db.run('SELECT * FROM vote_attempts WHERE election_id = ?', [electionId]);
    expect(intentos).toEqual([]);
  });

  it('no crea ninguna fila en email_log: ni correo de confirmación ni hash por correo', async () => {
    // La fila (destinatario + plantilla + created_at) se cruza con la hora del
    // voto y reconstruye el vínculo; el correo llevaba además el hash de la
    // transacción, que quedaría copiado en Resend y en el buzón.
    puertoConfirmado();
    const { user, electionId, candidatos } = await eleccionVotable(6005);

    const res = await votar(user, electionId, candidatos[0].id);
    expect(res.status).toBe(200);
    await new Promise(r => setTimeout(r, 50)); // el envío era fire-and-forget

    const filas = await db.run(
      "SELECT id FROM email_log WHERE recipient = ? OR template_name = 'vote_confirmation'",
      [user.email],
    );
    expect(filas).toEqual([]);
  });

  it('el doble voto sigue rechazado, y no escribe un segundo voto', async () => {
    puertoConfirmado();
    const { user, electionId, candidatos } = await eleccionVotable(6002);

    expect((await votar(user, electionId, candidatos[0].id)).status).toBe(200);
    expect((await votar(user, electionId, candidatos[1].id)).status).toBe(409);

    const votos = await db.run('SELECT 1 FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(votos).toHaveLength(1);
  });

  it('la clave primaria de participación es el anti-doble-voto de la base', async () => {
    const { user, electionId, candidatos } = await eleccionVotable(6003);
    const voto = {
      userId: user.id, electionId, nullifierHash: `0xdup-${Date.now()}`,
      candidateId: candidatos[0].id, txHash: null, blockNumber: null, voteSource: 'demo' as const,
    };

    expect(await recordConfirmedVote(db, voto)).toBe('registrado');
    expect(await recordConfirmedVote(db, { ...voto, nullifierHash: `0xdup2-${Date.now()}` })).toBe('ya-participaba');

    const votos = await db.run('SELECT 1 FROM nullifier_audit WHERE election_id = ?', [electionId]);
    expect(votos).toHaveLength(1);
  });

  it('participación y voto son atómicos: si falla el voto, no queda participación', async () => {
    const { user, electionId } = await eleccionVotable(6004);
    // Un nullifier nulo viola NOT NULL: la participación, ya insertada dentro
    // de la misma transacción, tiene que deshacerse.
    await expect(
      recordConfirmedVote(db, {
        userId: user.id, electionId, nullifierHash: null as unknown as string,
        candidateId: null, txHash: null, blockNumber: null, voteSource: 'demo',
      }),
    ).rejects.toThrow();

    const participacion = await db.run(
      'SELECT 1 FROM election_participations WHERE election_id = ? AND user_id = ?',
      [electionId, user.id],
    );
    expect(participacion).toEqual([]);
  });
});

// ── Reconciliación ──────────────────────────────────────────────────────────

describe('la reconciliación inserta las dos filas o ninguna', () => {
  function poolQueFallaAlInsertarElVoto() {
    const consultas: string[] = [];
    const handle = async (sql: string): Promise<ResultadoConsulta> => {
      consultas.push(sql.trim());
      if (/FROM vote_attempts/i.test(sql) && /'pending'/.test(sql) && !/72 hours/.test(sql)) {
        return {
          rows: [{ id: 1, user_id: 10, election_id: 5, nullifier_hash: '0xn', candidate_id: 7, tx_hash: null, nonce: null }],
          rowCount: 1,
        };
      }
      if (/FROM candidates/i.test(sql)) return { rows: [{ id: 7, position: 0 }], rowCount: 1 };
      if (/INSERT INTO nullifier_audit/i.test(sql)) throw new Error('fallo simulado al insertar el voto');
      return { rows: [], rowCount: 1 };
    };
    const pool: PoolLike = {
      query: handle,
      connect: async () => ({ query: handle, release: () => {} }),
      end: async () => {},
    };
    return { pool, consultas };
  }

  it('si falla el voto, hace ROLLBACK y no confirma la participación', async () => {
    const { pool, consultas } = poolQueFallaAlInsertarElVoto();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const encontrado = async (): Promise<BusquedaDeVoto> => ({
      estado: 'encontrado',
      recibo: { txHash: '0xtx', blockNumber: 9, candidatePosition: 0 },
    });

    await new PgClient('postgresql://no-se-conecta', pool).cleanupStaleVoteAttempts(encontrado);

    expect(consultas).toContain('BEGIN');
    expect(consultas.some(c => /INSERT INTO election_participations/i.test(c))).toBe(true);
    expect(consultas).toContain('ROLLBACK');
    expect(consultas).not.toContain('COMMIT');
  });
});
