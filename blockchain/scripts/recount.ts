/**
 * Recuento independiente de una elección, leyendo SOLO la cadena.
 *
 * Este script es el entregable que sostiene la tesis del proyecto: cualquiera
 * —un comité electoral, un tribunal, un candidato que no se fíe— puede recontar
 * por su cuenta, en su propio equipo, contra un nodo público, sin credenciales
 * de VTB, sin acceso a nuestra base de datos y sin usar nuestra interfaz.
 *
 * No importa nada de la aplicación: ni el backend, ni artefactos compilados, ni
 * deployment-info.json. Solo la dirección del contrato y un RPC.
 *
 * ── Uso ─────────────────────────────────────────────────────────────────────
 *
 *   ELECTION_ID=3 npx hardhat run scripts/recount.ts --network sepolia
 *
 * o contra cualquier RPC, sin configuración del proyecto:
 *
 *   RECOUNT_RPC_URL=https://... CONTRACT_ADDRESS=0x... ELECTION_ID=3 \
 *     npx hardhat run scripts/recount.ts
 *
 * ── Qué comprueba ───────────────────────────────────────────────────────────
 *
 *   1. El recuento reconstruido sumando los eventos VoteCast uno a uno.
 *   2. El recuento que el propio contrato mantiene (getTally).
 *   3. Que ambos coinciden. Si no coinciden, el contrato o el nodo mienten.
 *   4. Que ningún nullifier aparece dos veces (no hay doble voto).
 *
 * Los logs se leen por ventanas de bloques: pedirlos de golpe desde el bloque 0
 * es lo que hacía fallar siempre al job de reconciliación (BC-23), porque todos
 * los proveedores limitan el rango de eth_getLogs.
 */
import { ethers } from "ethers";

/** ABI mínimo. Deliberadamente escrito a mano: no depende de compilar nada. */
const ABI = [
  "function getElection(uint256) view returns (tuple(string name, uint256 startTime, uint256 endTime, uint256 candidateCount, bytes32 candidatesRoot, bytes32 censusRoot, bool halted, uint256 totalVotes))",
  "function getTally(uint256) view returns (uint256[])",
  "function getTotalVotes(uint256) view returns (uint256)",
  "function deploymentBlock() view returns (uint256)",
  "event VoteCast(uint256 indexed electionId, uint256 indexed nullifier, uint256 indexed candidateId, uint256 timestamp)",
];

/** Ventana de bloques por consulta. Por debajo del límite de los proveedores. */
const BLOCK_WINDOW = 45_000;

export interface RecountResult {
  contractAddress: string;
  electionId: number;
  name: string;
  /** Huella de la lista de candidatos publicada fuera de la cadena. */
  candidatesRoot: string;
  candidateCount: number;
  startTime: number;
  endTime: number;
  halted: boolean;
  fromBlock: number;
  toBlock: number;
  /** Votos por candidato, reconstruidos sumando los eventos. */
  tallyFromEvents: number[];
  /** Votos por candidato según el recuento que mantiene el contrato. */
  tallyFromContract: number[];
  totalFromEvents: number;
  totalFromContract: number;
  /** Nullifiers repetidos: debe ser 0. */
  repeatedNullifiers: number;
  /** true si las dos fuentes coinciden y no hay nullifiers repetidos. */
  consistent: boolean;
}

/**
 * Recuenta una elección leyendo únicamente la cadena.
 *
 * @param fromBlock Bloque desde el que escanear. Si se omite, se pregunta al
 *        contrato por su propio bloque de despliegue.
 */
export async function recount(
  provider: ethers.Provider,
  contractAddress: string,
  electionId: number,
  fromBlock?: number,
  toBlock?: number,
): Promise<RecountResult> {
  const contract = new ethers.Contract(contractAddress, ABI, provider);

  const hasta = toBlock ?? (await provider.getBlockNumber());
  const election = await contract.getElection(electionId, { blockTag: hasta });
  const candidateCount = Number(election.candidateCount);

  const desde = fromBlock ?? Number(await contract.deploymentBlock({ blockTag: hasta }));

  // ── 1. Reconstrucción desde los eventos ─────────────────────────────────
  const tallyFromEvents = new Array<number>(candidateCount).fill(0);
  const vistos = new Set<string>();
  let repeatedNullifiers = 0;
  let totalFromEvents = 0;

  const filtro = contract.filters.VoteCast(electionId);
  for (let inicio = desde; inicio <= hasta; inicio += BLOCK_WINDOW) {
    const fin = Math.min(inicio + BLOCK_WINDOW - 1, hasta);
    const logs = await contract.queryFilter(filtro, inicio, fin);

    for (const log of logs as ethers.EventLog[]) {
      const nullifier = log.args.nullifier.toString();
      if (vistos.has(nullifier)) {
        repeatedNullifiers++;
        continue; // no se cuenta dos veces
      }
      vistos.add(nullifier);

      const candidato = Number(log.args.candidateId);
      if (candidato < candidateCount) tallyFromEvents[candidato]++;
      totalFromEvents++;
    }
  }

  // ── 2. Lo que dice el contrato ──────────────────────────────────────────
  const tallyFromContract: number[] = (
    await contract.getTally(electionId, { blockTag: hasta })
  ).map(Number);
  const totalFromContract = Number(
    await contract.getTotalVotes(electionId, { blockTag: hasta })
  );

  const consistent =
    repeatedNullifiers === 0 &&
    totalFromEvents === totalFromContract &&
    tallyFromEvents.length === tallyFromContract.length &&
    tallyFromEvents.every((v, i) => v === tallyFromContract[i]);

  return {
    contractAddress,
    electionId,
    name: election.name,
    candidatesRoot: election.candidatesRoot,
    candidateCount,
    startTime: Number(election.startTime),
    endTime: Number(election.endTime),
    halted: election.halted,
    fromBlock: desde,
    toBlock: hasta,
    tallyFromEvents,
    tallyFromContract,
    totalFromEvents,
    totalFromContract,
    repeatedNullifiers,
    consistent,
  };
}

/** Informe legible, pensado para pegarse en un acta. */
export function formatRecount(r: RecountResult): string {
  const fecha = (s: number) => new Date(s * 1000).toISOString();
  const lineas = [
    "=".repeat(66),
    `RECUENTO INDEPENDIENTE — elección #${r.electionId} on-chain`,
    "=".repeat(66),
    `Contrato:        ${r.contractAddress}`,
    `Nombre:          ${r.name}`,
    `Ventana:         ${fecha(r.startTime)} → ${fecha(r.endTime)}`,
    `Detenida:        ${r.halted ? "SÍ" : "no"}`,
    `Bloques leídos:  ${r.fromBlock} → ${r.toBlock}`,
    "",
    `Huella de la lista de candidatos (candidatesRoot):`,
    `  ${r.candidatesRoot}`,
    `  Compruebe que coincide con el keccak256 de la lista publicada en la`,
    `  convocatoria. Si no coincide, la lista no es la que se comprometió.`,
    "",
    "Candidato | Votos (eventos) | Votos (contrato)",
    "----------|-----------------|-----------------",
  ];

  for (let i = 0; i < r.candidateCount; i++) {
    lineas.push(
      `${String(i).padStart(9)} | ${String(r.tallyFromEvents[i] ?? 0).padStart(15)} | ${String(r.tallyFromContract[i] ?? 0).padStart(15)}`,
    );
  }

  lineas.push(
    "----------|-----------------|-----------------",
    `${"TOTAL".padStart(9)} | ${String(r.totalFromEvents).padStart(15)} | ${String(r.totalFromContract).padStart(15)}`,
    "",
    `Nullifiers repetidos: ${r.repeatedNullifiers} (debe ser 0)`,
    "",
    r.consistent
      ? "RESULTADO: las dos fuentes coinciden y no hay doble voto."
      : "RESULTADO: DISCREPANCIA. Este recuento no es fiable; reclámelo.",
    "=".repeat(66),
  );

  return lineas.join("\n");
}

// ── Ejecución directa ───────────────────────────────────────────────────────

async function main() {
  const electionId = Number(process.env.ELECTION_ID || "0");
  if (!electionId) {
    throw new Error("Falta ELECTION_ID: el id de la elección EN EL CONTRATO.");
  }

  const rpcUrl = (process.env.RECOUNT_RPC_URL || "").trim();
  let provider: ethers.Provider;
  let contractAddress = (process.env.CONTRACT_ADDRESS || "").trim();

  if (rpcUrl) {
    provider = new ethers.JsonRpcProvider(rpcUrl);
  } else {
    // Ejecutado con `npx hardhat run`: se usa la red del proyecto.
    const hre = await import("hardhat");
    provider = hre.ethers.provider;
    if (!contractAddress) {
      const fs = await import("fs");
      const path = await import("path");
      const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
      if (fs.existsSync(file)) {
        contractAddress = JSON.parse(fs.readFileSync(file, "utf8")).contractAddress;
      }
    }
  }

  if (!contractAddress) {
    throw new Error(
      "Falta CONTRACT_ADDRESS y no hay registro de despliegue para esta red.",
    );
  }

  const resultado = await recount(provider, contractAddress, electionId);
  console.log(formatRecount(resultado));

  // Código de salida distinto de cero si hay discrepancia: así se puede
  // encadenar en una comprobación automática.
  if (!resultado.consistent) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Recuento fallido:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
