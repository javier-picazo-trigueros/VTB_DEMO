/**
 * Huella de la lista de candidatos de una elección.
 *
 * ── Para qué sirve ──────────────────────────────────────────────────────────
 *
 * En la cadena, un voto dice "candidato 2". Ese número no significa nada por sí
 * solo: hace falta la lista que dice quién es el 2. Y esa lista no puede ir
 * on-chain, porque son nombres de personas reales y quedarían escritos de forma
 * inmutable en una cadena pública.
 *
 * La solución es el compromiso: al registrar la elección se escribe on-chain el
 * keccak256 de la lista canónica, y la lista se publica con la convocatoria.
 * Cualquiera recalcula el hash y comprueba que la lista que le dan es la que se
 * comprometió. Si alguien cambia un nombre o reordena a los candidatos después,
 * el hash deja de cuadrar.
 *
 * ── La regla canónica, que hay que poder reproducir desde fuera ─────────────
 *
 * Es un contrato público: quien verifique tiene que poder calcular exactamente
 * el mismo hash sin nuestro código. Por eso está definida aquí de forma
 * explícita y no como "lo que salga de JSON.stringify de lo que haya":
 *
 *   1. Se toman los candidatos de la elección.
 *   2. Se ordenan por `position` ascendente.
 *   3. Cada uno se representa como {"position":N,"name":"..."} — solo esos dos
 *      campos, en ese orden, sin espacios. La descripción NO entra: es texto
 *      editable que no cambia quién es el candidato.
 *   4. El nombre se normaliza: NFC y sin espacios al principio ni al final. Sin
 *      esto, dos representaciones visualmente idénticas de una tilde darían
 *      hashes distintos.
 *   5. Se serializa el array completo y se calcula keccak256 del UTF-8.
 *
 * Ejemplo, para que se pueda verificar a mano:
 *
 *   [{"position":0,"name":"Ana Ruiz"},{"position":1,"name":"Bruno Sáez"}]
 *
 * y el hash es keccak256 de esa cadena, tal cual, sin salto de línea final.
 */
import { ethers } from "ethers";

export interface CandidatoCanonico {
  position: number;
  name: string;
}

/** Una posición por candidato, densa desde 0, sin huecos ni repetidos. */
export class ListaDeCandidatosInvalida extends Error {}

/**
 * Ordena y normaliza la lista tal y como se comprometió on-chain.
 *
 * @throws ListaDeCandidatosInvalida si las posiciones no son 0..n-1 sin
 *         repetir. Es obligatorio: `candidateId` viaja a la cadena como la
 *         posición, y el contrato rechaza cualquiera >= candidateCount. Una
 *         elección con posiciones {0, 5} y dos candidatos registraría un
 *         candidateCount de 2 y el voto al 5 revertiría en cadena.
 */
export function listaCanonica(
  candidatos: Array<{ position: number | string; name: string }>,
): CandidatoCanonico[] {
  if (candidatos.length === 0) {
    throw new ListaDeCandidatosInvalida("la elección no tiene candidatos");
  }

  const lista = candidatos
    .map((c) => ({
      position: Number(c.position),
      name: String(c.name ?? "").normalize("NFC").trim(),
    }))
    .sort((a, b) => a.position - b.position);

  lista.forEach((c, i) => {
    if (c.position !== i) {
      throw new ListaDeCandidatosInvalida(
        `las posiciones de los candidatos deben ser 0..${lista.length - 1} sin huecos ni repetidos; ` +
        `se ha encontrado ${c.position} donde debería ir ${i}`,
      );
    }
    if (c.name === "") {
      throw new ListaDeCandidatosInvalida(`el candidato en la posición ${i} no tiene nombre`);
    }
  });

  return lista;
}

/** La cadena exacta que se hashea. Se publica junto al resultado. */
export function serializarLista(lista: CandidatoCanonico[]): string {
  return JSON.stringify(lista.map((c) => ({ position: c.position, name: c.name })));
}

/** keccak256 de la lista canónica: lo que se escribe on-chain. */
export function candidatesRoot(
  candidatos: Array<{ position: number | string; name: string }>,
): string {
  return ethers.keccak256(ethers.toUtf8Bytes(serializarLista(listaCanonica(candidatos))));
}
