/**
 * Tests del camino del voto contra la cadena.
 *
 * Este camino no tenía ninguno: vote.test.ts entra con cuentas @vtb.demo, que
 * toman un atajo sintético y nunca llegan a la blockchain, así que el tramo que
 * de verdad importa —el que envía la transacción— no estaba cubierto por nada.
 * Y es justo donde apareció el fallo de los identificadores de elección, que
 * habría registrado un voto real en la elección equivocada.
 *
 * La cadena se sustituye por un doble del puerto (services/voteChain.ts), igual
 * que ya se hacía con la sincronización. Los tests nunca tocan Sepolia:
 * setup.ts deja CONTRACT_ADDRESS, PRIVATE_KEY y RPC_URL vacías.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDbClient } from '../db/index.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';
import { setVotePortForTesting, type VotePort, type VoteReceipt } from '../services/voteChain.js';

const db = getDbClient();

const RECIBO: VoteReceipt = { txHash: '0x' + 'ab'.repeat(32), blockNumber: 1234 };

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

/** Elección sincronizada, con un candidato y el votante en el censo. */
async function eleccionVotable(chainId: number) {
  const user = await createFixtureUser();
  const electionId = await createFixtureElection({
    blockchainId: chainId,
    name: `Voto en cadena ${Date.now()}-${chainId}`,
  });
  await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
  const candidato = await db.exec(
    "INSERT INTO candidates (election_id, name, position) VALUES (?, 'Única', 0)",
    [electionId],
  );
  await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);
  return { user, electionId, candidateId: candidato.lastID };
}

/** Doble del puerto que apunta lo que se le pide enviar. */
function puerto(comportamiento?: () => never) {
  const enviados: Array<{ electionId: number; nullifier: string; voteHash: string }> = [];
  const port: VotePort = {
    castVote: vi.fn(async (electionId: number, nullifier: string, voteHash: string) => {
      enviados.push({ electionId, nullifier, voteHash });
      if (comportamiento) comportamiento();
      return RECIBO;
    }),
    findVote: vi.fn(async () => null),
  };
  setVotePortForTesting(port);
  return { port, enviados };
}

const votosDe = async (electionId: number) =>
  db.run<{ tx_hash: string | null; block_number: number | null }>(
    'SELECT tx_hash, block_number FROM nullifier_audit WHERE election_id = ?',
    [electionId],
  );

async function emitirVoto(user: { email: string; password: string }, electionId: number, candidateId: number) {
  const { agent, csrf } = await loginAsFixture(user.email, user.password);
  return agent.post('/api/elections/register-vote').set('X-CSRF-Token', csrf).send({
    electionId,
    voteHash: '0x' + '11'.repeat(32),
    candidateId,
  });
}

describe('register-vote contra la cadena', () => {
  it('envía el id de la elección EN EL CONTRATO, no el id de la base', async () => {
    // El fallo que ocurrió de verdad: los dos ids son números distintos y el
    // código enviaba el de la base. El voto se habría registrado en otra
    // elección del contrato, sin ningún error visible.
    const { enviados } = puerto();
    const { user, electionId, candidateId } = await eleccionVotable(4242);

    const res = await emitirVoto(user, electionId, candidateId);

    expect(res.status).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].electionId).toBe(4242);
    expect(enviados[0].electionId).not.toBe(electionId);
  });

  it('guarda el hash y el bloque que devuelve la cadena, no unos inventados', async () => {
    puerto();
    const { user, electionId, candidateId } = await eleccionVotable(4243);

    const res = await emitirVoto(user, electionId, candidateId);

    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe(RECIBO.txHash);
    expect(res.body.blockNumber).toBe(RECIBO.blockNumber);

    const votos = await votosDe(electionId);
    expect(votos).toHaveLength(1);
    expect(votos[0].tx_hash).toBe(RECIBO.txHash);
    expect(Number(votos[0].block_number)).toBe(RECIBO.blockNumber);
  });

  it('si el contrato rechaza el nullifier duplicado, 409 y no queda voto', async () => {
    puerto(() => {
      // Tal y como llega de ethers v6 cuando el nodo estima el gas antes.
      throw new Error('execution reverted: "ERR: nullifier already used (double-vote prevented)"');
    });
    const { user, electionId, candidateId } = await eleccionVotable(4244);

    const res = await emitirVoto(user, electionId, candidateId);

    expect(res.status).toBe(409);
    expect(await votosDe(electionId)).toHaveLength(0);
  });

  it('si la transacción falla, no se inventa un hash y el votante puede reintentar', async () => {
    puerto(() => { throw new Error('could not coalesce error'); });
    const { user, electionId, candidateId } = await eleccionVotable(4245);

    const fallido = await emitirVoto(user, electionId, candidateId);
    expect(fallido.status).toBe(500);
    expect(fallido.body.txHash).toBeUndefined();
    expect(await votosDe(electionId)).toHaveLength(0);

    // El cerrojo se ha liberado: el mismo votante lo vuelve a intentar y entra.
    puerto();
    const segundo = await emitirVoto(user, electionId, candidateId);
    expect(segundo.status).toBe(200);
    expect(await votosDe(electionId)).toHaveLength(1);
  });

  it('una elección que aún no está en la cadena ni siquiera llega al puerto', async () => {
    const { port } = puerto();
    const { user, electionId, candidateId } = await eleccionVotable(4246);
    await db.exec("UPDATE elections SET chain_status = 'pending' WHERE id = ?", [electionId]);

    const res = await emitirVoto(user, electionId, candidateId);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ELECTION_NOT_ON_CHAIN');
    expect(port.castVote).not.toHaveBeenCalled();
    expect(await votosDe(electionId)).toHaveLength(0);
  });

  it('sin blockchain configurada no se registra el voto', async () => {
    // Sin doble y con el entorno vacío (setup.ts), getVotePort() devuelve null.
    setVotePortForTesting(null);
    const { user, electionId, candidateId } = await eleccionVotable(4247);

    const res = await emitirVoto(user, electionId, candidateId);

    expect(res.status).toBe(500);
    expect(await votosDe(electionId)).toHaveLength(0);
  });
});
