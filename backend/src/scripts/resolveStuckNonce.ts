/**
 * Comando manual de administrador para desatascar un nonce del relayer.
 *
 * ── Por qué es manual y no automático ────────────────────────────────────
 *
 * checkRelayerNonceStatus() y replaceStuckRelayerTx() (services/voteChain.ts)
 * estaban implementadas pero no las llamaba nada: ni un cron, ni un endpoint,
 * ni este script. Detectar y resolver un atasco de nonce del relayer requiere
 * juicio humano — enviar una transacción de reemplazo mueve fondos reales del
 * relayer y puede pisar una transacción que en realidad seguía en camino — así
 * que se deja como comando explícito de operador, nunca disparado solo.
 *
 * 'speedup' es SIEMPRE el valor por defecto: reenvía el mismo voto con más
 * gas. 'cancel' sustituye la transacción por un envío de 0 ETH y DESCARTA el
 * voto que llevaba — solo tiene sentido si ese voto ya se dio por perdido y se
 * va a reintentar por otra vía. Por eso 'cancel' exige pasarlo explícito.
 *
 * ── Uso ──────────────────────────────────────────────────────────────────
 *
 *   npx tsx src/scripts/resolveStuckNonce.ts --status
 *     Solo consulta el estado de nonces del relayer (latest vs pending) y sale.
 *
 *   npx tsx src/scripts/resolveStuckNonce.ts --nonce 42 --tx-hash 0xabc...
 *     Reenvía la MISMA transacción del nonce 42 (mismo destino y calldata,
 *     leídos de la tx original vía su hash) con más gas (speedup). El hash es
 *     el que se guardó en vote_attempts.tx_hash para ese intento. Pide el
 *     nonce exacto a propósito: no autodetecta "el atascado" para evitar tocar
 *     el que no es.
 *
 *   npx tsx src/scripts/resolveStuckNonce.ts --nonce 42 --action cancel
 *     Sustituye el nonce 42 por un envío de 0 ETH. Descarta el voto que
 *     llevaba esa transacción — confirmar antes que ese voto ya se ha dado
 *     por perdido (vote_attempts en 'failed', o se va a reintentar aparte).
 *     No necesita --tx-hash: no reenvía nada, solo libera el hueco de nonce.
 *
 * Lee RPC_URL / CONTRACT_ADDRESS / PRIVATE_KEY del entorno, igual que el resto
 * del backend (config/env.ts). Sin blockchain configurada, sale con error.
 */
import "../config/env.js";
import { chainConfig } from "./syncElections.js";
import { checkRelayerNonceStatus, replaceStuckRelayerTx } from "../services/voteChain.js";
import { ethers } from "ethers";

function parseArgs(argv: string[]) {
  const nonceIdx = argv.indexOf("--nonce");
  const nonce = nonceIdx >= 0 ? Number(argv[nonceIdx + 1]) : null;
  const actionIdx = argv.indexOf("--action");
  const action = (actionIdx >= 0 ? argv[actionIdx + 1] : "speedup") as "speedup" | "cancel";
  const txHashIdx = argv.indexOf("--tx-hash");
  const txHash = txHashIdx >= 0 ? argv[txHashIdx + 1] : null;
  const statusOnly = argv.includes("--status");
  return { nonce, action, txHash, statusOnly };
}

async function main() {
  const cfg = chainConfig();
  if (!cfg) {
    console.error("Blockchain no configurada (RPC_URL / CONTRACT_ADDRESS / PRIVATE_KEY). Nada que hacer.");
    process.exit(1);
  }

  const { nonce, action, txHash, statusOnly } = parseArgs(process.argv.slice(2));
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(cfg.privateKey, provider);

  const antes = await checkRelayerNonceStatus(wallet);
  console.log("Estado del relayer:", {
    address: wallet.address,
    latestNonce: antes.latestNonce,
    pendingNonce: antes.pendingNonce,
    inFlightCount: antes.inFlightCount,
    congestionado: antes.isCongested,
  });

  if (statusOnly) return;

  if (nonce === null || Number.isNaN(nonce)) {
    console.error('Falta --nonce <numero>. Usa --status para solo consultar el estado.');
    process.exit(1);
  }
  if (action !== "speedup" && action !== "cancel") {
    console.error(`--action debe ser "speedup" o "cancel", no "${action}".`);
    process.exit(1);
  }
  if (nonce >= antes.pendingNonce) {
    console.error(
      `El nonce ${nonce} no está por debajo del pending actual (${antes.pendingNonce}) — no hay nada atascado ahí.`,
    );
    process.exit(1);
  }
  let to: string | undefined;
  let data: string | undefined;

  if (action === "cancel") {
    console.warn(
      `ATENCIÓN: 'cancel' descarta el voto que llevaba la transacción del nonce ${nonce}. ` +
        "Confirma que ese intento ya está (o va a quedar) marcado 'failed' antes de continuar.",
    );
  } else {
    // 'speedup' tiene que reenviar la MISMA transacción (mismo destino y
    // calldata) con más gas — no una vacía. Sin el hash no hay forma fiable de
    // recuperar esos datos de una tx que puede llevar rato fuera del mempool.
    if (!txHash) {
      console.error(
        "--action speedup necesita --tx-hash <hash> (el que se guardó en vote_attempts.tx_hash " +
          "para ese intento) — sin él no hay forma de saber qué reenviar con más gas.",
      );
      process.exit(1);
    }
    const original = await provider.getTransaction(txHash);
    if (!original) {
      console.error(`No se encuentra la transacción ${txHash} (ni minada ni en mempool).`);
      process.exit(1);
    }
    if (original.nonce !== nonce) {
      console.error(`La transacción ${txHash} tiene nonce ${original.nonce}, no ${nonce}. Abortando.`);
      process.exit(1);
    }
    to = original.to ?? undefined;
    data = original.data;
  }

  console.log(`Enviando reemplazo (${action}) para el nonce ${nonce}...`);
  const tx = await replaceStuckRelayerTx(wallet, nonce, { type: action, to, data });
  console.log(`Transacción de reemplazo enviada: ${tx.hash}`);
  console.log("Esperando confirmación...");
  const receipt = await tx.wait();
  console.log(`Confirmada en el bloque ${receipt?.blockNumber} (status ${receipt?.status}).`);
}

const isMain = process.argv[1]?.includes("resolveStuckNonce");
if (isMain) {
  main().catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
