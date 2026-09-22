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
  candidatePosition?: number | null;
  status?: 'confirmed' | 'pending_confirmation';
}

/** Resultado de buscar un voto en la cadena. */
export type BusquedaDeVoto =
  | { estado: "encontrado"; recibo: VoteReceipt }
  | { estado: "revertido"; txHash?: string; motivo?: string }
  | { estado: "reemplazado"; nonceConsumido?: number; motivo?: string }
  | { estado: "no-esta"; definitivo?: boolean; motivo?: string }
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

/** Timeout por defecto para tx.wait() (12 segundos < 15s del cliente). */
const DEFAULT_WAIT_TIMEOUT_MS = Number(process.env.TX_WAIT_TIMEOUT_MS || 12_000);

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

  /** Estado actual de congestión y nonces del relayer */
  getNonceStatus?(): Promise<RelayerNonceStatus>;

  /** Desatasca un nonce en el relayer ('cancel' enviando 0 ETH a sí mismo o 'speedup') */
  resolveStuckNonce?(stuckNonce: number, action?: 'cancel' | 'speedup'): Promise<{ txHash: string }>;
}

export interface RelayerNonceStatus {
  latestNonce: number;
  pendingNonce: number;
  inFlightCount: number;
  isCongested: boolean;
}

export interface ReplaceStuckTxOptions {
  type?: 'cancel' | 'speedup';
  to?: string;
  data?: string;
  gasBumpPercentage?: number;
}

/**
 * Comprueba el desfase de nonces entre el estado confirmado en cadena ('latest')
 * y el mempool ('pending'). Si pendingNonce > latestNonce y supera el umbral,
 * indica transacciones atascadas en cola bloqueando envíos posteriores.
 */
export async function checkRelayerNonceStatus(
  wallet: ethers.Wallet,
  congestedThreshold: number = 3,
): Promise<RelayerNonceStatus> {
  const [latestNonce, pendingNonce] = await Promise.all([
    wallet.getNonce('latest'),
    wallet.getNonce('pending'),
  ]);
  const inFlightCount = Math.max(0, pendingNonce - latestNonce);
  return {
    latestNonce,
    pendingNonce,
    inFlightCount,
    isCongested: inFlightCount >= congestedThreshold,
  };
}

/**
 * Desatasca una transacción bloqueada emitiendo una nueva transacción con el MISMO nonce
 * y gas sustancialmente mayor (EIP-1559 replacement rule: ≥10-20% bump).
 *
 * - 'cancel': 0 ETH a la propia dirección del relayer para liberar el slot inmediatamente.
 * - 'speedup': reenvío con los mismos datos pero con tarifa aumentada para forzar inclusión.
 */
export async function replaceStuckRelayerTx(
  wallet: ethers.Wallet,
  nonce: number,
  options?: ReplaceStuckTxOptions,
): Promise<ethers.TransactionResponse> {
  // 'speedup' es SIEMPRE la opción por defecto para no anular votos legítimos.
  // 'cancel' sustituye la transacción por 0 ETH y NUNCA se ejecuta automáticamente.
  const action = options?.type ?? 'speedup';
  const bumpPercent = options?.gasBumpPercentage ?? 20;

  const feeData = await wallet.provider!.getFeeData();
  const bump = (val: bigint | null | undefined) => {
    if (val === null || val === undefined) return undefined;
    return (val * BigInt(100 + bumpPercent)) / 100n;
  };

  const maxFeePerGas = bump(feeData.maxFeePerGas);
  const maxPriorityFeePerGas = bump(feeData.maxPriorityFeePerGas);

  if (action === 'cancel') {
    return await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
  } else {
    return await wallet.sendTransaction({
      to: options?.to,
      data: options?.data ?? '0x',
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
  }
}

// ── Doble para tests ────────────────────────────────────────────────────────

let testPort: VotePort | null = null;

/** Solo para tests: sustituye el puerto real. `null` lo restaura. */
export function setVotePortForTesting(port: VotePort | null): void {
  testPort = port;
}

// ── Gestión del Relayer (Singleton + Cola de Nonce) ─────────────────────────

interface RelayerInstance {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  queue: Promise<any>;
  currentNonce: number | null;
}

let activeRelayer: RelayerInstance | null = null;
let activeRelayerKey: string | null = null;

export function resetRelayerForTesting(): void {
  activeRelayer = null;
  activeRelayerKey = null;
}

function getRelayer(rpcUrl: string, privateKey: string): RelayerInstance {
  const key = `${rpcUrl}:${privateKey}`;
  if (activeRelayer && activeRelayerKey === key) {
    return activeRelayer;
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  activeRelayer = {
    provider,
    wallet,
    queue: Promise.resolve(),
    currentNonce: null,
  };
  activeRelayerKey = key;
  return activeRelayer;
}

async function sendRelayerTx<T>(
  relayer: RelayerInstance,
  operation: (wallet: ethers.Wallet, nonce: number) => Promise<T>,
): Promise<T> {
  const execute = async () => {
    let nonce: number;
    try {
      const pendingNonce = await relayer.wallet.getNonce('pending');
      if (relayer.currentNonce === null || pendingNonce > relayer.currentNonce) {
        relayer.currentNonce = pendingNonce;
      }
      nonce = relayer.currentNonce;
      relayer.currentNonce = nonce + 1;
    } catch (err) {
      relayer.currentNonce = null;
      throw err;
    }

    try {
      return await operation(relayer.wallet, nonce);
    } catch (err) {
      relayer.currentNonce = null;
      throw err;
    }
  };

  const currentOp = relayer.queue.then(execute, execute);
  relayer.queue = currentOp.catch(() => {});
  return currentOp;
}

async function waitForReceiptWithTimeout(
  tx: { wait: () => Promise<any> },
  timeoutMs: number,
): Promise<{ receipt: any; timedOut: boolean }> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<{ receipt: null; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ receipt: null, timedOut: true }), timeoutMs);
  });

  try {
    const result = await Promise.race([
      tx.wait().then((receipt: any) => ({ receipt, timedOut: false as const })),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export interface CreateVotePortOptions {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  waitTimeoutMs?: number;
  mockContract?: any;
  mockInitialNonce?: number;
}

export function createVotePort(cfg: CreateVotePortOptions): VotePort {
  const waitTimeout = cfg.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

  if (cfg.mockContract) {
    let mockNonce = cfg.mockInitialNonce ?? 0;
    let mockQueue = Promise.resolve();

    return {
      contractAddress: cfg.contractAddress,
      async castVote(onChainElectionId, nullifier, candidateId, contractAddress) {
        const execute = async () => {
          const nonce = mockNonce++;
          return await cfg.mockContract.castVote(
            onChainElectionId,
            nullifier,
            candidateId,
            { nonce },
          );
        };
        const currentOp = mockQueue.then(execute, execute);
        mockQueue = currentOp.catch(() => {});
        const tx = await currentOp;

        const result = await waitForReceiptWithTimeout(tx, waitTimeout);
        if (result.timedOut) {
          return {
            txHash: tx.hash,
            blockNumber: null,
            status: 'pending_confirmation',
          };
        }
        return {
          txHash: tx.hash,
          blockNumber: result.receipt?.blockNumber ?? null,
          status: 'confirmed',
        };
      },

      async findVote(nullifierHash, onChainElectionId, contractAddress) {
        return { estado: 'no-esta' };
      },

      async getTally(onChainElectionId, contractAddress) {
        return [0, 0];
      },

      async getNonceStatus() {
        return {
          latestNonce: mockNonce,
          pendingNonce: mockNonce,
          inFlightCount: 0,
          isCongested: false,
        };
      },

      async resolveStuckNonce(stuckNonce: number, _action: 'cancel' | 'speedup' = 'speedup') {
        return { txHash: '0xmock_resolved_' + stuckNonce };
      },
    };
  }

  const relayer = getRelayer(cfg.rpcUrl, cfg.privateKey);
  const contract = new ethers.Contract(cfg.contractAddress, [...VOTE_ABI], relayer.wallet);
  const lectura = new ethers.Contract(cfg.contractAddress, [...VOTE_ABI], relayer.provider);

  return {
    contractAddress: cfg.contractAddress,
    async castVote(onChainElectionId, nullifier, candidateId, contractAddress) {
      const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
      const isTargetDefault = target.toLowerCase() === cfg.contractAddress.toLowerCase();

      // Serializamos el envío asegurando nonce secuencial desde la cuenta del relayer
      const tx = await sendRelayerTx(relayer, async (wallet, nonce) => {
        const activeContract = isTargetDefault
          ? contract
          : new ethers.Contract(target, [...VOTE_ABI], wallet);
        return await activeContract.castVote(onChainElectionId, nullifier, candidateId, { nonce });
      });

      // Esperar recibo con timeout explícito (12s < 15s del cliente)
      const waitResult = await waitForReceiptWithTimeout(tx, waitTimeout);
      if (waitResult.timedOut) {
        return {
          txHash: tx.hash as string,
          blockNumber: null,
          status: 'pending_confirmation',
        };
      }

      return {
        txHash: tx.hash as string,
        blockNumber: waitResult.receipt?.blockNumber ?? null,
        status: 'confirmed',
      };
    },

    async findVote(nullifierHash, onChainElectionId, contractAddress) {
      try {
        const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
        const activeLectura = target.toLowerCase() !== cfg.contractAddress.toLowerCase()
          ? new ethers.Contract(target, [...VOTE_ABI], relayer.provider)
          : lectura;
        const desde = await bloqueInicial(activeLectura);
        const hasta = await relayer.provider.getBlockNumber();
        const filtro = activeLectura.filters.VoteCast(onChainElectionId ?? null, nullifierHash);

        for (let inicio = desde; inicio <= hasta; inicio += BLOCK_WINDOW) {
          const fin = Math.min(inicio + BLOCK_WINDOW - 1, hasta);
          const eventos = await activeLectura.queryFilter(filtro, inicio, fin);
          if (eventos.length > 0) {
            const ev = eventos[0] as ethers.EventLog;
            let candidatePosition: number | null = null;
            try {
              if (ev.args) {
                candidatePosition = Number(ev.args[2] ?? (ev.args as any).candidateId);
              }
            } catch {
              // Si falla el parseo de args, se omite
            }
            return {
              estado: "encontrado",
              recibo: {
                txHash: ev.transactionHash,
                blockNumber: ev.blockNumber,
                candidatePosition,
              },
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
        ? new ethers.Contract(target, [...VOTE_ABI], relayer.provider)
        : lectura;
      const tally: bigint[] = await activeLectura.getTally(onChainElectionId);
      return tally.map(Number);
    },

    async getNonceStatus() {
      return checkRelayerNonceStatus(relayer.wallet);
    },

    async resolveStuckNonce(stuckNonce: number, action: 'cancel' | 'speedup' = 'speedup') {
      const tx = await replaceStuckRelayerTx(relayer.wallet, stuckNonce, { type: action });
      relayer.currentNonce = null;
      return { txHash: tx.hash };
    },
  };
}

/**
 * Puerto listo para usar, o `null` si no hay cadena configurada.
 */
export function getVotePort(contractAddress?: string | null): VotePort | null {
  if (testPort) return testPort;
  const cfg = chainConfig();
  if (!cfg) return null;
  const target = contractAddress && contractAddress.trim() ? contractAddress.trim() : cfg.contractAddress;
  return createVotePort({ ...cfg, contractAddress: target });
}

