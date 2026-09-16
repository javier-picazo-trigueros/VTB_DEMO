/**
 * Puerto de la cadena para el camino del voto.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Hasta ahora, POST /elections/register-vote construía el Wallet y el Contract
 * en línea, dentro del propio manejador:
 *
 *   const wallet = getWallet();
 *   const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
 *   const tx = await contract.castVote(...);
 *
 * Eso no se puede probar sin una cadena de verdad, y por eso el camino crítico
 * del voto no tenía ni un test: vote.test.ts entra con cuentas @vtb.demo, que
 * se saltan la blockchain entera. Justo ahí apareció el fallo de los
 * identificadores de elección, que escribía el voto en la elección equivocada.
 *
 * El patrón es el mismo que ElectionRegistryPort en scripts/syncElections.ts,
 * que ya demostró funcionar: una interfaz mínima con lo único que el camino
 * necesita de la cadena, y los tests la sustituyen por un doble.
 *
 * ── Qué NO cambia ───────────────────────────────────────────────────────────
 *
 * Los errores de ethers se propagan tal cual, sin envolver. La ruta los
 * clasifica buscando subcadenas ("election does not exist", "nullifier already
 * used") y leyendo `code`; envolverlos rompería en silencio la traducción a 409
 * y 503. Cuando el contrato v2 entre, esa clasificación debería pasar a
 * decodificar el motivo del revert, pero eso es otro paso.
 *
 * El ABI declarado aquí es el del contrato ACTUAL (ElectionRegistry, VTB.sol).
 * Hay un test que lo compara con el artefacto compilado: si alguien cambia el
 * contrato y no este fichero, salta. Es lo que no existía cuando BC-29 dejó el
 * feed de votos en vivo sin poder dispararse durante meses.
 */
import { ethers } from "ethers";
import { chainConfig } from "../scripts/syncElections.js";

/** Lo que el backend necesita saber de una transacción de voto. */
export interface VoteReceipt {
  txHash: string;
  blockNumber: number | null;
}

/** Fragmentos del contrato que usa el camino del voto. */
export const VOTE_ABI = [
  "function castVote(uint256 _electionId, bytes32 _nullifier, bytes32 _voteHash) public",
  "event VoteCast(uint256 indexed electionId, bytes32 indexed nullifier, bytes32 voteHash, uint256 timestamp)",
] as const;

export interface VotePort {
  /**
   * Registra el voto y espera el recibo.
   *
   * @param onChainElectionId El id de la elección EN EL CONTRATO
   *        (elections.election_id_blockchain), que no es el id de la base.
   *        Confundirlos es el fallo que ya ocurrió.
   */
  castVote(
    onChainElectionId: number,
    nullifier: string,
    voteHash: string,
  ): Promise<VoteReceipt>;

  /**
   * Busca el evento VoteCast de un nullifier, para reconstruir un voto cuyo
   * registro en la base se perdió después de que la transacción entrara.
   *
   * OJO — devuelve null tanto si el voto no está en la cadena como si el RPC
   * falló. Es el defecto BC-24 de AUDITORIA_BLOCKCHAIN.md: quien lo consume
   * (cleanupStaleVoteAttempts) marca 'failed' en ambos casos y puede dar por
   * perdido un voto que sí está en la cadena. Se conserva el comportamiento
   * tal cual en este paso, que es solo de refactor; se arregla en el paso 4.
   */
  findVote(nullifierHash: string): Promise<VoteReceipt | null>;
}

// ── Doble para tests ────────────────────────────────────────────────────────

let testPort: VotePort | null = null;

/** Solo para tests: sustituye el puerto real. `null` lo restaura. */
export function setVotePortForTesting(port: VotePort | null): void {
  testPort = port;
}

// ── Puerto real ─────────────────────────────────────────────────────────────

function createVotePort(cfg: {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
}): VotePort {
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(cfg.privateKey, provider);
  const contract = new ethers.Contract(cfg.contractAddress, [...VOTE_ABI], wallet);

  return {
    async castVote(onChainElectionId, nullifier, voteHash) {
      const tx = await contract.castVote(onChainElectionId, nullifier, voteHash);
      const receipt = await tx.wait();
      return { txHash: tx.hash as string, blockNumber: receipt?.blockNumber ?? null };
    },

    async findVote(nullifierHash) {
      try {
        const readOnly = new ethers.Contract(cfg.contractAddress, [...VOTE_ABI], provider);
        const events = await readOnly.queryFilter(
          readOnly.filters.VoteCast(null, nullifierHash),
        );
        if (events.length === 0) return null;
        const ev = events[0] as ethers.EventLog;
        return { txHash: ev.transactionHash, blockNumber: ev.blockNumber };
      } catch {
        // Ver la nota de BC-24 en la interfaz: el llamante no distingue esto
        // de "no está en la cadena".
        return null;
      }
    },
  };
}

/**
 * Puerto de voto listo para usar, o `null` si no hay cadena configurada.
 *
 * No se cachea: `PRIVATE_KEY` y `RPC_URL` pueden cambiar entre peticiones en
 * los tests, y construir un JsonRpcProvider no hace E/S.
 */
export function getVotePort(): VotePort | null {
  if (testPort) return testPort;
  const cfg = chainConfig();
  if (!cfg) return null;
  return createVotePort(cfg);
}
