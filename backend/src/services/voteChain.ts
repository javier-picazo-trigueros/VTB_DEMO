/**
 * Puerto de la cadena para el camino del voto y para el recuento.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Hasta el paso 3, POST /elections/register-vote construía el Wallet y el
 * Contract en línea, dentro del propio manejador. Eso no se puede probar sin una
 * cadena de verdad, y por eso el camino crítico del voto no tenía ni un test:
 * vote.test.ts entra con cuentas @vtb.demo, que se saltan la blockchain entera.
 * Justo ahí apareció el fallo de los identificadores de elección.
 *
 * El patrón es el mismo que ElectionRegistryPort en scripts/syncElections.ts:
 * una interfaz mínima con lo único que el camino necesita de la cadena, y los
 * tests la sustituyen por un doble.
 *
 * ── Contrato v2 ─────────────────────────────────────────────────────────────
 *
 * Este puerto habla con ElectionRegistryV2. Frente al anterior:
 *
 *   - castVote lleva el candidato (su posición en la papeleta), no un voteHash
 *     opaco, para que el recuento se pueda rehacer desde fuera;
 *   - el nullifier es uint256, que es el tipo que emite Semaphore, para no
 *     tener que cambiarlo cuando llegue;
 *   - getTally da el recuento por candidato, que es lo que /results compara
 *     contra la base en vez de fiarse de ella.
 *
 * Las elecciones anteriores al v2 viven en el contrato viejo y su columna
 * elections.chain_contract_address lo dice. No se puede votar en ellas con este
 * puerto, y no hace falta: ninguna tiene un solo voto on-chain (comprobado, 29
 * elecciones a cero).
 *
 * El ABI declarado aquí se compara con el ABI publicado del contrato en
 * chain-abi.test.ts. Es lo que no existía cuando BC-29 dejó el feed de votos en
 * vivo sin poder dispararse durante meses.
 */
import { ethers } from "ethers";
import { chainConfig } from "../scripts/syncElections.js";

/** Lo que el backend necesita saber de una transacción de voto. */
export interface VoteReceipt {
  txHash: string;
  blockNumber: number | null;
}

/** Resultado de buscar un voto en la cadena. */
export type BusquedaDeVoto =
  | { estado: "encontrado"; recibo: VoteReceipt }
  | { estado: "no-esta" }
  /** El nodo no ha respondido. NO significa que el voto no exista (BC-24). */
  | { estado: "sin-respuesta"; motivo: string };

/** Fragmentos del contrato v2 que usa el backend. */
export const VOTE_ABI = [
  "function castVote(uint256 _electionId, uint256 _nullifier, uint256 _candidateId) external",
  "function getTally(uint256 _id) external view returns (uint256[])",
  "function getTotalVotes(uint256 _id) external view returns (uint256)",
  "function deploymentBlock() view returns (uint256)",
  "event VoteCast(uint256 indexed electionId, uint256 indexed nullifier, uint256 indexed candidateId, uint256 timestamp)",
] as const;

/** Ventana de bloques por consulta de logs: los proveedores limitan el rango. */
const BLOCK_WINDOW = 45_000;

export interface VotePort {
  readonly contractAddress?: string;

  /**
   * Registra el voto y espera el recibo.
   *
   * @param onChainElectionId El id de la elección EN EL CONTRATO
   *        (elections.election_id_blockchain), que no es el id de la base.
   *        Confundirlos es el fallo que ya ocurrió.
   * @param candidateId La posición del candidato en la papeleta, 0..n-1.
   * @param contractAddress Dirección opcional del contrato de la elección.
   */
  castVote(
    onChainElectionId: number,
    nullifier: string,
    candidateId: number,
    contractAddress?: string,
  ): Promise<VoteReceipt>;

  /**
   * Busca el evento VoteCast de un nullifier.
   *
   * Devuelve tres estados distintos a propósito. Antes devolvía null tanto si el
   * voto no estaba como si el RPC fallaba, y cleanupStaleVoteAttempts marcaba
   * 'failed' en los dos casos: un voto que sí estaba en la cadena se daba por
   * perdido en silencio (BC-24).
   */
  findVote(
    nullifierHash: string,
    onChainElectionId?: number | null,
    contractAddress?: string | null,
  ): Promise<BusquedaDeVoto>;

  /** Recuento por candidato que mantiene el contrato. `tally[i]` = candidato i. */
  getTally(onChainElectionId: number, contractAddress?: string | null): Promise<number[]>;
}

// ── Doble para tests ────────────────────────────────────────────────────────

let testPort: VotePort | null = null;

/** Solo para tests: sustituye el puerto real. `null` lo restaura. */
export function setVotePortForTesting(port: VotePort | null): void {
  testPort = port;
}

// ── Puerto real ─────────────────────────────────────────────────────────────

/**
 * Desde qué bloque escanear los logs.
 *
 * Se pregunta al propio contrato, que guarda su bloque de despliegue. Antes se
 * llamaba a queryFilter sin rango, es decir desde el bloque 0: todos los
 * proveedores lo rechazan, así que la consulta fallaba SIEMPRE y el job de
 * reconciliación no ha funcionado nunca (BC-23).
 */
async function bloqueInicial(contract: ethers.Contract): Promise<number> {
  const env = Number(process.env.DEPLOY_BLOCK || "0");
  if (env > 0) return env;
  return Number(await contract.deploymentBlock());
}

function createVotePort(cfg: {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
}): VotePort {
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(cfg.privateKey, provider);
  const contract = new ethers.Contract(cfg.contractAddress, [...VOTE_ABI], wallet);
  const lectura = new ethers.Contract(cfg.contractAddress, [...VOTE_ABI], provider);

  return {
    contractAddress: cfg.contractAddress,
    async castVote(onChainElectionId, nullifier, candidateId, contractAddress) {
      const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
      const activeContract = target.toLowerCase() !== cfg.contractAddress.toLowerCase()
        ? new ethers.Contract(target, [...VOTE_ABI], wallet)
        : contract;
      const tx = await activeContract.castVote(onChainElectionId, nullifier, candidateId);
      const receipt = await tx.wait();
      return { txHash: tx.hash as string, blockNumber: receipt?.blockNumber ?? null };
    },

    async findVote(nullifierHash, onChainElectionId, contractAddress) {
      try {
        const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
        const activeLectura = target.toLowerCase() !== cfg.contractAddress.toLowerCase()
          ? new ethers.Contract(target, [...VOTE_ABI], provider)
          : lectura;
        const desde = await bloqueInicial(activeLectura);
        const hasta = await provider.getBlockNumber();
        const filtro = activeLectura.filters.VoteCast(onChainElectionId ?? null, nullifierHash);

        for (let inicio = desde; inicio <= hasta; inicio += BLOCK_WINDOW) {
          const fin = Math.min(inicio + BLOCK_WINDOW - 1, hasta);
          const eventos = await activeLectura.queryFilter(filtro, inicio, fin);
          if (eventos.length > 0) {
            const ev = eventos[0] as ethers.EventLog;
            return {
              estado: "encontrado",
              recibo: { txHash: ev.transactionHash, blockNumber: ev.blockNumber },
            };
          }
        }
        return { estado: "no-esta" };
      } catch (err) {
        // Nunca el objeto de error entero: arrastra la URL del RPC con su clave.
        const motivo =
          err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
        return { estado: "sin-respuesta", motivo };
      }
    },

    async getTally(onChainElectionId, contractAddress) {
      const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
      const activeLectura = target.toLowerCase() !== cfg.contractAddress.toLowerCase()
        ? new ethers.Contract(target, [...VOTE_ABI], provider)
        : lectura;
      const tally: bigint[] = await activeLectura.getTally(onChainElectionId);
      return tally.map(Number);
    },
  };
}

/**
 * Puerto listo para usar, o `null` si no hay cadena configurada.
 *
 * No se cachea: PRIVATE_KEY y RPC_URL pueden cambiar entre peticiones en los
 * tests, y construir un JsonRpcProvider no hace E/S.
 */
export function getVotePort(contractAddress?: string | null): VotePort | null {
  if (testPort) return testPort;
  const cfg = chainConfig();
  if (!cfg) return null;
  const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
  return createVotePort({ ...cfg, contractAddress: target });
}
