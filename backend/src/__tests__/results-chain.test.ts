/**
 * El recuento que publica la API contra el recuento de la cadena.
 *
 * Este es el criterio de aceptación que quedó pendiente del paso 3: hasta ahora
 * /results recontaba solo desde la base y `onChainVerified` era true si AL MENOS
 * UNA fila tenía tx_hash — con 1.000 votos de los cuales uno llegó a la cadena,
 * la elección se mostraba como verificada. Y ni siquiera consultaba la cadena.
 *
 * Verificado pasa a significar una sola cosa: los dos recuentos coinciden,
 * candidato a candidato. Y cuando no coinciden, se dice.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDbClient } from '../db/index.js';
import { createFixtureElection, createAndLogin } from './helpers/fixtures.js';
import { setVotePortForTesting, type VotePort } from '../services/voteChain.js';

const db = getDbClient();
const CONTRATO = '0x' + 'c0'.repeat(20);
const OTRO_CONTRATO = '0x' + 'd1'.repeat(20);

let contractAddressPrevia: string | undefined;

beforeEach(() => {
  contractAddressPrevia = process.env.CONTRACT_ADDRESS;
  process.env.CONTRACT_ADDRESS = CONTRATO;
});

afterEach(() => {
  process.env.CONTRACT_ADDRESS = contractAddressPrevia ?? '';
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

/** Puerto que devuelve el recuento que se le diga, o revienta. */
function puertoConRecuento(tally: number[] | (() => never)) {
  const port: VotePort = {
    castVote: vi.fn(),
    findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
    getTally: vi.fn(async () => {
      if (typeof tally === 'function') tally();
      return tally as number[];
    }),
  };
  setVotePortForTesting(port);
  return port;
}

/**
 * Elección sincronizada en el contrato actual, con votos ya registrados.
 *
 * @param reparto Posición del candidato votado, un elemento por voto.
 */
async function eleccionConVotos(reparto: number[], opts: { contrato?: string; demos?: number } = {}) {
  const electionId = await createFixtureElection({
    name: `Recuento ${Date.now()}-${Math.random()}`,
    candidates: ['Ana', 'Bruno'],
  });
  await db.exec(
    "UPDATE elections SET chain_status = 'synced', chain_contract_address = ? WHERE id = ?",
    [opts.contrato ?? CONTRATO, electionId],
  );

  const candidatos = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position ASC',
    [electionId],
  );

  // Votantes insertados a mano, sin pasar por createFixtureUser: aquí nadie
  // inicia sesión, y cada usuario de fixture cuesta un bcrypt. Con tres o cuatro
  // votos por test, eso era la diferencia entre pasar y agotar el tiempo.
  let siguienteVotante = 0;
  const crearVotante = async (): Promise<number> => {
    siguienteVotante += 1;
    const email = `votante-${electionId}-${siguienteVotante}-${Date.now()}@test.vtb`;
    const r = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, approved_at, is_eligible, must_change_password)
       VALUES (?, 'no-se-usa-en-este-test', 'Votante', ?, 'student', 1, CURRENT_TIMESTAMP, 1, 0)`,
      [email, `VOT-${electionId}-${siguienteVotante}`],
    );
    return r.lastID;
  };

  const insertar = async (posicion: number, origen: string, i: number) => {
    const userId = await crearVotante();
    await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, userId]);
    await db.exec(
      `INSERT INTO nullifier_audit
         (user_id, election_id, nullifier_hash, vote_choice, tx_hash, block_number, candidate_id, vote_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, electionId, `0xnull-${electionId}-${origen}-${i}`,
        String(candidatos[posicion].id),
        origen === 'chain' ? `0xtx-${electionId}-${i}` : null,
        origen === 'chain' ? 100 + i : null,
        candidatos[posicion].id,
        origen,
      ],
    );
  };

  for (const [i, posicion] of reparto.entries()) await insertar(posicion, 'chain', i);
  for (let i = 0; i < (opts.demos ?? 0); i++) await insertar(0, 'demo', 1000 + i);

  return { electionId, candidatos };
}

const resultados = (electionId: number) => request(app).get(`/api/elections/${electionId}/results`);

describe('/results contrastado con la cadena', () => {
  it('cuando los dos recuentos coinciden, la elección sale verificada', async () => {
    // 2 votos a la posición 0 y 1 a la posición 1.
    const { electionId } = await eleccionConVotos([0, 0, 1]);
    puertoConRecuento([2, 1]);

    const res = await resultados(electionId);

    expect(res.status).toBe(200);
    expect(res.body.onChainVerified).toBe(true);
    expect(res.body.verificacion.estado).toBe('coincide');
    expect(res.body.verificacion.recuentoCadena).toEqual([2, 1]);
    expect(res.body.verificacion.recuentoBase).toEqual([2, 1]);
  });

  it('una discrepancia se reporta, no se esconde', async () => {
    const { electionId } = await eleccionConVotos([0, 0, 1]);
    // La cadena dice que hay un voto más del que tiene la base.
    puertoConRecuento([3, 1]);

    const res = await resultados(electionId);

    expect(res.body.onChainVerified).toBe(false);
    expect(res.body.verificacion.estado).toBe('discrepancia');
    expect(res.body.verificacion.recuentoCadena).toEqual([3, 1]);
    expect(res.body.verificacion.recuentoBase).toEqual([2, 1]);
    expect(res.body.verificacion.detalle).toMatch(/NO coincide/);
  });

  it('si la cadena no responde, no se afirma nada sobre el resultado', async () => {
    const { electionId } = await eleccionConVotos([0, 1]);
    puertoConRecuento(() => { throw new Error('could not coalesce error'); });

    const res = await resultados(electionId);

    expect(res.body.onChainVerified).toBe(false);
    expect(res.body.verificacion.estado).toBe('sin-respuesta');
  });

  it('una elección del contrato anterior no se contrasta con el actual', async () => {
    // Su election_id_blockchain apunta a otra elección en el contrato de ahora:
    // compararlos daría una discrepancia falsa.
    const { electionId } = await eleccionConVotos([0], { contrato: OTRO_CONTRATO });
    const port = puertoConRecuento([99]);

    const res = await resultados(electionId);

    expect(res.body.verificacion.estado).toBe('no-aplica');
    expect(port.getTally).not.toHaveBeenCalled();
    expect(res.body.onChainVerified).toBe(false);
  });

  it('una elección que aún no está en la cadena tampoco', async () => {
    const { electionId } = await eleccionConVotos([0]);
    await db.exec("UPDATE elections SET chain_status = 'pending' WHERE id = ?", [electionId]);
    const port = puertoConRecuento([1]);

    const res = await resultados(electionId);

    expect(res.body.verificacion.estado).toBe('no-aplica');
    expect(port.getTally).not.toHaveBeenCalled();
  });

  it('los votos de demostración no descuadran el contraste, pero se cuentan aparte', async () => {
    // Están en la base y no en la cadena: si entraran en la comparación darían
    // una discrepancia falsa. Se excluyen y se declaran como no verificables.
    const { electionId } = await eleccionConVotos([0, 1], { demos: 2 });
    puertoConRecuento([1, 1]);

    const res = await resultados(electionId);

    // Con votos demo/legacy no verificados en cadena, onChainVerified no puede ser true
    // y el estado debe ser 'parcial'.
    expect(res.body.onChainVerified).toBe(false);
    expect(res.body.verificacion.estado).toBe('parcial');
    expect(res.body.verificacion.votosNoVerificables).toBe(2);
    // El total que se muestra sí los incluye: son votos emitidos.
    expect(res.body.totalVotes).toBe(4);
  });
});

describe('candidatos de una elección ya registrada en la cadena', () => {
  it('no se pueden añadir: descuadraría el recuento on-chain', async () => {
    const { agent, csrf } = await createAndLogin({ role: 'admin', adminDomain: 'test.vtb' });
    const nombre = `Cerrada en cadena ${Date.now()}`;

    const creada = await agent.post('/admin/elections').set('X-CSRF-Token', csrf).send({
      name: nombre,
      start_time: Math.floor(Date.now() / 1000) - 60,
      end_time: Math.floor(Date.now() / 1000) + 3600,
      candidates: [{ name: 'Ana' }, { name: 'Bruno' }],
    });
    expect(creada.status).toBe(200);

    const fila = await db.get<{ id: number }>('SELECT id FROM elections WHERE name = ?', [nombre]);
    await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [fila!.id]);

    const res = await agent
      .post(`/admin/elections/${fila!.id}/candidates`)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Tardío' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ELECTION_ALREADY_ON_CHAIN');

    const candidatos = await db.run('SELECT id FROM candidates WHERE election_id = ?', [fila!.id]);
    expect(candidatos).toHaveLength(2);
  });
});
