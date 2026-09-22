/**
 * Parte 4 (punto 2): findVote() contra un nodo Hardhat local de verdad, no
 * contra dobles. cleanupStaleVoteAttempts() ya sabía tratar 'revertido' y
 * 'reemplazado' de forma distinta a 'no-esta' (ver postgres.ts), pero
 * findVote() nunca podía producirlos: solo buscaba el evento VoteCast por
 * nullifier, y ni una tx revertida ni una reemplazada lo emiten nunca — así
 * que un voto atascado por esa causa se quedaba 'pending' para siempre y el
 * votante no podía volver a intentarlo (409 permanente).
 *
 * Este fichero levanta `hardhat node` de verdad (blockchain/, puerto propio),
 * despliega ElectionRegistryV2 con el artefacto ya compilado, y reproduce en
 * la cadena real los dos escenarios que findVote() debía distinguir:
 *
 *   1. Revertida: dos votos con el MISMO nullifier minados en el mismo bloque
 *      (automine desactivado) — el segundo revierte de verdad, con un recibo
 *      real de status 0.
 *   2. Reemplazada: dos transacciones con el MISMO nonce; el nodo descarta la
 *      original del mempool y mina la segunda — la original nunca tiene
 *      recibo, y el hueco de nonce queda consumido por otra.
 *
 * Requiere blockchain/artifacts compilado (`npm run compile` en blockchain/).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { createVotePort } from '../services/voteChain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLOCKCHAIN_DIR = path.resolve(__dirname, '../../../blockchain');
const ARTIFACT_PATH = path.join(
  BLOCKCHAIN_DIR, 'artifacts', 'contracts', 'ElectionRegistryV2.sol', 'ElectionRegistryV2.json',
);
// Puerto propio, distinto de 8545 (dev habitual) para no chocar con un nodo local abierto.
const PORT = 8567;
const RPC_URL = `http://127.0.0.1:${PORT}`;

// Cuentas #0 y #1 de Hardhat — públicas y documentadas en hardhat.config.ts y
// README.md, nunca usar fuera de una red efímera local.
const OWNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RELAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const hasArtifact = fs.existsSync(ARTIFACT_PATH);

async function waitForRpc(rpcUrl: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const probe = new ethers.JsonRpcProvider(rpcUrl);
      await probe.getBlockNumber();
      probe.destroy();
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Hardhat node no respondió en ${rpcUrl} tras ${timeoutMs}ms: ${String(lastErr)}`);
}

function killTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') {
      // spawn(..., {shell:true}) en Windows deja el PID en cmd.exe: matarlo
      // solo no mata al hijo real (npx → node → hardhat). /t mata el árbol.
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    // Ya estaba muerto, o no se pudo matar — no bloquear el resto de la suite.
  }
}

describe.skipIf(!hasArtifact)('findVote() contra Hardhat local — revertida y reemplazada', () => {
  let nodeProcess: ChildProcess | null = null;
  let contractAddress: string;
  let relayerAddress: string;
  let abi: ethers.InterfaceAbi;

  beforeAll(async () => {
    abi = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8')).abi;

    nodeProcess = spawn('npx', ['hardhat', 'node', '--port', String(PORT)], {
      cwd: BLOCKCHAIN_DIR,
      stdio: 'ignore',
      shell: true,
    });
    await waitForRpc(RPC_URL);

    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const owner = new ethers.Wallet(OWNER_KEY, provider);
    const relayer = new ethers.Wallet(RELAYER_KEY, provider);
    relayerAddress = relayer.address;

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    const contract = await factory.deploy(relayer.address);
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();

    const now = Math.floor(Date.now() / 1000);
    const candidatesRoot = ethers.id('candidatos:hardhat-test');
    const registry = new ethers.Contract(contractAddress, artifact.abi, relayer);
    const tx = await registry.createElection(
      'Elección Hardhat Test', now - 60, now + 3600, 2, candidatesRoot, ethers.ZeroHash,
    );
    await tx.wait();
  }, 60000);

  afterAll(() => {
    killTree(nodeProcess);
  });

  it('recibo real con status 0 (candidato fuera de rango) → findVote devuelve "revertido", no "encontrado"', async () => {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const relayer = new ethers.Wallet(RELAYER_KEY, provider);
    const contract = new ethers.Contract(contractAddress, abi, relayer);

    // Nullifier que NUNCA ha tenido éxito en ningún voto — importante para que la
    // búsqueda por evento no encuentre nada de otra transacción y el resultado
    // dependa solo de mirar el recibo de ESTA transacción, que es lo que se prueba.
    const nullifier = BigInt(ethers.id(`revert-${Date.now()}`));
    const nullifierHex = '0x' + nullifier.toString(16).padStart(64, '0');

    // Con automine, Hardhat simula al recibir eth_sendRawTransaction y lanza la
    // excepción ahí mismo si va a revertir — nunca llega a haber tx minada que
    // consultar. Con automine desactivado, la acepta sin simular y el revert
    // real solo ocurre al minar explícitamente, dejando un recibo real de
    // status 0 — el escenario que de verdad hay que poder distinguir.
    await provider.send('evm_setAutomine', [false]);
    try {
      // candidateId=99 con solo 2 candidatos → "ERR: candidate out of range".
      const tx = await contract.castVote(1, nullifier, 99, { gasLimit: 300_000 });
      await provider.send('evm_mine', []);

      const recibo = await provider.getTransactionReceipt(tx.hash);
      // Confirma que el escenario reproducido es el real antes de probar findVote.
      expect(recibo?.status).toBe(0);

      const port = createVotePort({ rpcUrl: RPC_URL, contractAddress, privateKey: RELAYER_KEY });
      const resultado = await port.findVote(nullifierHex, 1, contractAddress, {
        txHash: tx.hash,
        nonce: tx.nonce,
      });

      expect(resultado.estado).toBe('revertido');
    } finally {
      await provider.send('evm_setAutomine', [true]);
    }
  }, 30000);

  it('tx nunca minada + nonce consumido por otra → findVote devuelve "reemplazado"', async () => {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const relayer = new ethers.Wallet(RELAYER_KEY, provider);
    const contract = new ethers.Contract(contractAddress, abi, relayer);

    const nullifierOriginal = BigInt(ethers.id(`replace-original-${Date.now()}`));
    const nullifierReemplazo = BigInt(ethers.id(`replace-nuevo-${Date.now()}`));
    const nullifierOriginalHex = '0x' + nullifierOriginal.toString(16).padStart(64, '0');

    await provider.send('evm_setAutomine', [false]);
    try {
      const nonce = await relayer.getNonce('pending');
      // Tx "original": nunca llegará a minarse. Mismo nonce, gas menor.
      const txOriginal = await contract.castVote(1, nullifierOriginal, 0, {
        nonce,
        gasLimit: 300_000,
        gasPrice: ethers.parseUnits('1', 'gwei'),
      });
      // Reemplazo: mismo nonce, gas suficientemente mayor para sustituirla en el mempool.
      const txReemplazo = await contract.castVote(1, nullifierReemplazo, 0, {
        nonce,
        gasLimit: 300_000,
        gasPrice: ethers.parseUnits('5', 'gwei'),
      });
      await provider.send('evm_mine', []);

      const reciboOriginal = await provider.getTransactionReceipt(txOriginal.hash);
      const reciboReemplazo = await provider.getTransactionReceipt(txReemplazo.hash);
      // Confirma que el escenario reproducido es el real antes de probar findVote.
      expect(reciboOriginal).toBeNull();
      expect(reciboReemplazo?.status).toBe(1);

      const port = createVotePort({ rpcUrl: RPC_URL, contractAddress, privateKey: RELAYER_KEY });
      const resultado = await port.findVote(nullifierOriginalHex, 1, contractAddress, {
        txHash: txOriginal.hash,
        nonce,
      });

      expect(resultado.estado).toBe('reemplazado');
    } finally {
      await provider.send('evm_setAutomine', [true]);
    }
  }, 30000);

  it('sanity: relayerAddress y contrato quedaron desplegados correctamente', () => {
    expect(ethers.isAddress(contractAddress)).toBe(true);
    expect(ethers.isAddress(relayerAddress)).toBe(true);
  });
});
