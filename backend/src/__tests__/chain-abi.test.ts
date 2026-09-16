/**
 * Las firmas del contrato que hay escritas en el código tienen que ser las del
 * contrato de verdad.
 *
 * ── Por qué existe este test ────────────────────────────────────────────────
 *
 * El frontend declaraba:
 *
 *   "event VoteCast(uint256 indexed electionId, bytes32 nullifier, bytes32 voteHash)"
 *
 * y el contrato emite:
 *
 *   VoteCast(uint256 indexed, bytes32 indexed, bytes32, uint256)
 *
 * El nodo filtra los logs por topic0, que es keccak256 de la firma. Firmas
 * distintas, topic0 distinto, y el filtro no coincide con ningún log jamás: el
 * feed de votos en vivo de la cabina llevaba meses sin poder dispararse, con el
 * indicador en verde porque solo comprobaba que el RPC respondía (BC-29).
 *
 * Nada lo detectó porque nada compara las cadenas del código con el contrato.
 * Esto lo hace: recorre los ficheros que declaran ABI a mano y comprueba que
 * cada fragmento existe en el ABI publicado del contrato.
 *
 * ── Contra qué se compara ───────────────────────────────────────────────────
 *
 * Contra `blockchain/abi/ElectionRegistry.json`, que se versiona. No contra
 * `blockchain/artifacts/`, que no está en git y no existiría en un clon limpio
 * ni en CI. Que ese fichero publicado siga coincidiendo con el contrato
 * compilado lo comprueba `blockchain/test/abi-publicada.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ethers } from 'ethers';

// vitest se ejecuta con el directorio de trabajo en backend/.
const RAIZ = resolve(process.cwd(), '..');

/** Ficheros que declaran fragmentos de ABI a mano. */
const FICHEROS = [
  'backend/src/services/voteChain.ts',
  'backend/src/scripts/syncElections.ts',
  'backend/src/routes/elections.ts',
  'backend/src/routes/admin/election-census.ts',
  'frontend/src/pages/VotingBooth.jsx',
];

/** Cadenas del tipo "event X(...)" o "function y(...)" en el código. */
const FRAGMENTO = /["'`]((?:event|function)\s+[A-Za-z_][^"'`]*)["'`]/g;

const abiPublicado = JSON.parse(
  readFileSync(join(RAIZ, 'blockchain', 'abi', 'ElectionRegistry.json'), 'utf8'),
).abi;

const contrato = new ethers.Interface(abiPublicado);

const topicsDelContrato = new Set<string>();
const selectoresDelContrato = new Set<string>();
contrato.forEachEvent((e) => topicsDelContrato.add(e.topicHash));
contrato.forEachFunction((f) => selectoresDelContrato.add(f.selector));

interface Encontrado {
  fichero: string;
  texto: string;
}

function fragmentosDe(fichero: string): Encontrado[] {
  const contenido = readFileSync(join(RAIZ, fichero), 'utf8');
  return [...contenido.matchAll(FRAGMENTO)].map((m) => ({ fichero, texto: m[1] }));
}

describe('los ABI escritos en el código coinciden con el contrato', () => {
  const todos = FICHEROS.flatMap(fragmentosDe);

  it('hay fragmentos que comprobar (si no, la expresión regular se ha roto)', () => {
    expect(todos.length).toBeGreaterThan(3);
  });

  it.each(todos.map((f) => [`${f.fichero} :: ${f.texto.slice(0, 70)}`, f] as const))(
    '%s',
    (_titulo, fragmento) => {
      let parsed: ethers.Fragment;
      try {
        parsed = ethers.Fragment.from(fragmento.texto);
      } catch (err) {
        throw new Error(
          `No se puede interpretar como ABI en ${fragmento.fichero}:\n  ${fragmento.texto}\n  ${String(err)}`,
        );
      }

      if (parsed instanceof ethers.EventFragment) {
        expect(
          topicsDelContrato.has(parsed.topicHash),
          `El evento declarado en ${fragmento.fichero} no existe en el contrato.\n` +
          `  declarado: ${parsed.format('sighash')}\n` +
          `  topic0:    ${parsed.topicHash}\n` +
          `  El contrato emite: ${[...topicsDelContrato].join(', ')}\n` +
          `  Un topic0 que no existe nunca casa con un log: el filtro no se dispara jamás.`,
        ).toBe(true);
      } else if (parsed instanceof ethers.FunctionFragment) {
        expect(
          selectoresDelContrato.has(parsed.selector),
          `La función declarada en ${fragmento.fichero} no existe en el contrato.\n` +
          `  declarada: ${parsed.format('sighash')}\n` +
          `  selector:  ${parsed.selector}`,
        ).toBe(true);
      }
    },
  );
});
