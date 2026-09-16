/**
 * Sincronización de elecciones con el contrato ElectionRegistry.
 *
 * ── Por qué se reescribió ────────────────────────────────────────────────────
 *
 * La versión anterior renumeraba election_id_blockchain como 1..N en el orden
 * de la base y suponía que la elección i de la base era la elección i del
 * contrato. Solo creaba en la cadena las que quedaban por encima del recuento
 * del contrato. Dos consecuencias, comprobadas en Supabase el 16-sep-2026:
 *
 *   - las elecciones #1-#5 del contrato eran otras ("Delegado Ingeniería
 *     Informatica 2026/27", "Fecha para el Día de la Paella"...), así que un
 *     voto real se habría registrado en la elección equivocada;
 *   - el contrato tenía 23 elecciones y la base 5: no creaba nunca ninguna.
 *
 * ── Diseño actual ───────────────────────────────────────────────────────────
 *
 * Cada elección lleva su estado en elections.chain_status (migración 008):
 *
 *   pending → hay que registrarla; elegible cuando chain_next_retry_at <= ahora
 *   syncing → reclamada por un proceso (chain_claimed_at marca cuándo)
 *   synced  → en el contrato, con el id del evento ElectionCreated (terminal)
 *   failed  → agotó CHAIN_MAX_ATTEMPTS; solo se reintenta con retryFailed
 *
 * Nunca se renumera: election_id_blockchain solo se escribe al confirmar, con
 * el id que emite el propio contrato. No se lee electionCount(), que devuelve
 * un id equivocado si otra creación se cuela entre el envío y la lectura.
 *
 * El reclamo es un UPDATE con `AND chain_status = 'pending'`: si dos procesos
 * compiten por la misma elección, solo uno obtiene changes === 1.
 *
 * ── Muerte del proceso ──────────────────────────────────────────────────────
 *
 * El hash se guarda justo después de enviar y ANTES de esperar el recibo. Si el
 * proceso muere esperando, la fila queda en 'syncing'; pasado STUCK_MS vuelve a
 * 'pending' y el reintento confirma esa misma transacción en vez de crear otra
 * elección en el contrato. Si la transacción ya no está en la red (nunca llegó
 * a minarse), se borra el hash y se envía de nuevo.
 *
 * Queda un hueco que no tiene arreglo local: que el nodo acepte la transacción
 * y la respuesta no llegue a este proceso. Sin hash no se puede reconocer, y el
 * reintento crea una segunda elección en el contrato. La base sigue coherente
 * (se queda con el id de la que confirma); en la cadena queda una huérfana.
 *
 * ── Quién la ejecuta ────────────────────────────────────────────────────────
 *
 *   - POST /admin/elections, justo después de crear, sin esperarla
 *   - el job de index.ts: al arrancar y cada 5 minutos
 *   - el botón "Sincronizar elecciones" del panel (con retryFailed)
 *   - `npm run sync-blockchain`
 *
 * Las llamadas se encadenan dentro del proceso: cada una espera a la anterior.
 */
import { ethers } from "ethers";
import dotenv from "dotenv";
import { getDbClient, ensureSchema } from "../db/index.js";
import { formatError } from "../utils/errors.js";

dotenv.config({ quiet: true });

const CONTRACT_ABI = [
  "function createElection(string _name, uint256 _startTime, uint256 _endTime) external",
  "event ElectionCreated(uint256 indexed electionId, string name, uint256 startTime, uint256 endTime)",
];

/** Intentos antes de dejar la elección en 'failed'. */
export const CHAIN_MAX_ATTEMPTS = 5;

/** Espera antes del siguiente intento (índice = intentos ya hechos - 1). */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

/** Una fila en 'syncing' más tiempo que esto se considera abandonada. */
const STUCK_MS = 15 * 60 * 1000;

/** Cuánto se espera el recibo en cada intento. */
const CONFIRM_TIMEOUT_MS = 3 * 60 * 1000;

/** El contrato exige startTime >= block.timestamp: margen para que se mine. */
const START_MARGIN_S = 120;

/** Lo único del contrato que usa la sincronización. Los tests lo sustituyen. */
export interface ElectionRegistryPort {
  /** Envía createElection y devuelve el hash, sin esperar a que se mine. */
  send(name: string, startTime: number, endTime: number): Promise<string>;
  /** Espera el recibo y devuelve el id del evento ElectionCreated. */
  confirm(txHash: string): Promise<number>;
}

export interface SyncSummary {
  /** false si no hay blockchain configurada: no se ha tocado nada. */
  configured: boolean;
  synced: number;
  retrying: number;
  failed: number;
}

/** La transacción ya no está en la red: hay que enviarla de nuevo. */
class TransactionDroppedError extends Error {}

const ZERO_ADDRESS = /^0x0{40}$/i;
const ZERO_KEY = /^(0x)?0{64}$/i;

export interface ChainConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
}

/**
 * Exportada para que el camino del voto (services/voteChain.ts) lea la
 * configuración de la cadena exactamente igual que la sincronización: los
 * mismos guardas de dirección y clave a ceros, y el mismo criterio de "no
 * configurada". Dos lectores distintos acabarían divergiendo.
 */
export function chainConfig(): ChainConfig | null {
  const rpcUrl = (process.env.RPC_URL || "").trim();
  const contractAddress = (process.env.CONTRACT_ADDRESS || "").trim();
  const privateKey = (process.env.PRIVATE_KEY || "").trim();
  if (!rpcUrl || !contractAddress || !privateKey) return null;
  // Los valores de backend/.env.example (dirección y clave a ceros) cuentan como
  // "sin configurar". Con ellos, cada pasada intentaría firmar con una clave
  // inválida y llenaría de errores el log de cualquier instalación local.
  if (ZERO_ADDRESS.test(contractAddress) || ZERO_KEY.test(privateKey)) return null;
  return { rpcUrl, contractAddress, privateKey };
}

export function isChainConfigured(): boolean {
  return chainConfig() !== null;
}

function createRegistryPort(cfg: ChainConfig): ElectionRegistryPort {
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(cfg.privateKey, provider);
  const contract = new ethers.Contract(cfg.contractAddress, CONTRACT_ABI, wallet);

  return {
    async send(name, startTime, endTime) {
      const tx = await contract.createElection(name, startTime, endTime, { gasLimit: 300_000 });
      return tx.hash as string;
    },

    async confirm(txHash) {
      let receipt: ethers.TransactionReceipt | null = null;
      try {
        receipt = await provider.waitForTransaction(txHash, 1, CONFIRM_TIMEOUT_MS);
      } catch (err) {
        if (!ethers.isError(err, "TIMEOUT")) throw err;
      }
      if (!receipt) {
        const pending = await provider.getTransaction(txHash);
        if (!pending) throw new TransactionDroppedError(`la transacción ${txHash} ya no está en la red`);
        throw new Error(`la transacción ${txHash} sigue sin minarse`);
      }
      if (receipt.status !== 1) throw new Error(`la transacción ${txHash} se revirtió`);

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== cfg.contractAddress.toLowerCase()) continue;
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "ElectionCreated") return Number(parsed.args.electionId);
      }
      throw new Error(`la transacción ${txHash} no emitió ElectionCreated`);
    },
  };
}

const describeError = (err: unknown): string => {
  const formatted = formatError(err) as unknown;
  return (typeof formatted === "string" ? formatted : JSON.stringify(formatted)).slice(0, 500);
};

const iso = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString();

let chain: Promise<unknown> = Promise.resolve();
let warnedNotConfigured = false;

export function syncElectionsToBlockchain(
  opts: { port?: ElectionRegistryPort; retryFailed?: boolean } = {},
): Promise<SyncSummary> {
  const run = chain.then(() => runOnce(opts));
  chain = run.catch(() => undefined);
  return run;
}

async function runOnce(opts: { port?: ElectionRegistryPort; retryFailed?: boolean }): Promise<SyncSummary> {
  const summary: SyncSummary = { configured: true, synced: 0, retrying: 0, failed: 0 };

  let registry = opts.port;
  if (!registry) {
    const cfg = chainConfig();
    if (!cfg) {
      if (!warnedNotConfigured) {
        console.log("[chain-sync] Blockchain no configurada: las elecciones quedan pendientes de registrar.");
        warnedNotConfigured = true;
      }
      return { ...summary, configured: false };
    }
    registry = createRegistryPort(cfg);
  }

  const db = getDbClient();

  if (opts.retryFailed) {
    await db.exec(
      `UPDATE elections
          SET chain_status = 'pending', chain_attempts = 0, chain_next_retry_at = NULL, chain_error = NULL
        WHERE chain_status = 'failed'`,
    );
  }

  const reclaimed = await db.exec(
    `UPDATE elections
        SET chain_status = 'pending', chain_claimed_at = NULL, chain_next_retry_at = NULL
      WHERE chain_status = 'syncing' AND chain_claimed_at < ?`,
    [iso(-STUCK_MS)],
  );
  if (reclaimed.changes > 0) {
    console.warn(`[chain-sync] ${reclaimed.changes} elección(es) abandonada(s) en 'syncing' vuelven a 'pending'`);
  }

  const pending = await db.run<{ id: number }>(
    `SELECT id FROM elections
      WHERE chain_status = 'pending'
        AND (chain_next_retry_at IS NULL OR chain_next_retry_at <= ?)
      ORDER BY id ASC
      LIMIT 10`,
    [iso()],
  );

  for (const { id } of pending) {
    const claim = await db.exec(
      `UPDATE elections
          SET chain_status = 'syncing', chain_claimed_at = ?, chain_attempts = chain_attempts + 1
        WHERE id = ? AND chain_status = 'pending'`,
      [iso(), id],
    );
    if (claim.changes !== 1) continue; // otro proceso se la llevó

    const election = await db.get<{
      id: number; name: string; start_time: number; end_time: number;
      chain_tx_hash: string | null; chain_attempts: number;
    }>(
      "SELECT id, name, start_time, end_time, chain_tx_hash, chain_attempts FROM elections WHERE id = ?",
      [id],
    );
    if (!election) continue;
    const attempts = Number(election.chain_attempts);

    try {
      let txHash = election.chain_tx_hash;
      if (!txHash) {
        const startTime = Math.max(Number(election.start_time), Math.floor(Date.now() / 1000) + START_MARGIN_S);
        const endTime = Math.max(Number(election.end_time), startTime + 3600);
        txHash = await registry.send(election.name, startTime, endTime);
        // Antes de esperar el recibo: si el proceso muere ahora, el reintento
        // confirma esta transacción en vez de crear otra elección en el contrato.
        await db.exec("UPDATE elections SET chain_tx_hash = ? WHERE id = ?", [txHash, id]);
      }

      const chainId = await registry.confirm(txHash);
      await db.exec(
        `UPDATE elections
            SET chain_status = 'synced', election_id_blockchain = ?, chain_synced_at = CURRENT_TIMESTAMP,
                chain_error = NULL, chain_claimed_at = NULL, chain_next_retry_at = NULL
          WHERE id = ?`,
        [chainId, id],
      );
      summary.synced++;
      console.log(`[chain-sync] "${election.name}" registrada en blockchain: #${chainId} (tx ${txHash})`);
    } catch (err) {
      const message = describeError(err);
      const clearHash = err instanceof TransactionDroppedError ? ", chain_tx_hash = NULL" : "";

      if (attempts >= CHAIN_MAX_ATTEMPTS) {
        await db.exec(
          `UPDATE elections
              SET chain_status = 'failed', chain_error = ?, chain_claimed_at = NULL, chain_next_retry_at = NULL${clearHash}
            WHERE id = ?`,
          [message, id],
        );
        summary.failed++;
        console.error(`[chain-sync] "${election.name}" NO se ha podido registrar tras ${attempts} intentos: ${message}`);
      } else {
        const delay = BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
        await db.exec(
          `UPDATE elections
              SET chain_status = 'pending', chain_error = ?, chain_claimed_at = NULL, chain_next_retry_at = ?${clearHash}
            WHERE id = ?`,
          [message, iso(delay), id],
        );
        summary.retrying++;
        console.warn(
          `[chain-sync] intento ${attempts}/${CHAIN_MAX_ATTEMPTS} fallido para "${election.name}"; ` +
          `reintento en ${Math.round(delay / 1000)} s: ${message}`,
        );
      }
    }
  }

  return summary;
}

const isMain = process.argv[1]?.includes("syncElections");
if (isMain) {
  ensureSchema()
    .then(() => syncElectionsToBlockchain({ retryFailed: true }))
    .then((summary) => {
      console.log(`[chain-sync] ${JSON.stringify(summary)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Election sync failed:", formatError(err));
      process.exit(1);
    });
}
