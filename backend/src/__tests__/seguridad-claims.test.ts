/**
 * Test para Punto 14:
 * Comprueba que en SEGURIDAD.md:
 * 1. No se afirma que el relayer o dueño no pueden añadir/inyectar votos (pueden inventar nullifiers o autorizarse).
 * 2. No se promete Semaphore/ZK como solución futura en marcha ni se oculta que no resuelve coacción/compra de votos.
 * 3. Se reconoce que los nullifiers en cadena son seudonimización, no anonimización completa.
 * 4. Se aclara que el recuento independiente solo comprueba lo que el contrato aceptó, no la legitimidad de los votantes.
 * 5. Se reconoce la limitación a consultas no secretas.
 * 6. Se reconoce que el sistema no es resistente a la coacción ni a la compra de
 *    votos (el comprobante de voto permite demostrar a un tercero qué se votó).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Punto 14: Corrección de afirmaciones y garantías en SEGURIDAD.md', () => {
  const seguridadPath = path.resolve(__dirname, '../../../SEGURIDAD.md');
  const content = fs.readFileSync(seguridadPath, 'utf8');

  it('no afirma falsamente que un relayer o un dueño no pueden añadir o inyectar votos', () => {
    // En la versión antigua se decía que el relayer/dueño "No puede: añadir votos" o "No es posible que un tercero infle el recuento"
    expect(content).not.toMatch(/No es posible que.*infle el recuento escribiendo votos inventados/i);
    expect(content).not.toMatch(/Propietario del contrato\s*\|\s*[^|]*\|\s*[^|]*añadir.*votos/i);
  });

  it('reconoce explícitamente que el relayer puede inyectar votos inventando nullifiers', () => {
    expect(content).toMatch(/inyectar|inventar nullifiers/i);
  });

  it('reconoce que el dueño puede autorizarse como relayer', () => {
    expect(content).toMatch(/autorizarse como relayer|otorgarse el rol.*relayer/i);
  });

  it('no promete Semaphore como solución prevista ni oculta límites de coacción/compra de votos', () => {
    expect(content).not.toMatch(/Esto se resuelve con pruebas de conocimiento cero \(Semaphore\)/i);
    expect(content).not.toMatch(/cuando se implemente el anonimato criptográfico con Semaphore/i);
    expect(content).toMatch(/coacción|compra de votos/i);
  });

  it('reconoce que la solución actual es para consultas no secretas', () => {
    expect(content).toMatch(/consultas no secretas/i);
  });

  it('identifica los datos en cadena como seudonimización', () => {
    expect(content).toMatch(/seudonimizaci[oó]n/i);
  });

  it('aclara que la auditoría externa solo verifica lo que el contrato aceptó', () => {
    expect(content).toMatch(/solo puede\s+(contar|verificar)\s+lo que el contrato acept[oó]/i);
  });

  it('dice exactamente qué garantiza la base de datos sobre la correspondencia votante-voto (SCRUM-17)', () => {
    // Esta frase solo es verdad desde la migración 016, que separa la participación
    // (election_participations) de los votos (nullifier_audit, sin user_id). Antes
    // era falsa y un test prohibía escribirla; ahora el test exige que esté, y tal
    // cual, sin adornos que la conviertan en otra afirmación.
    expect(content).toMatch(
      /la base de datos no conserva la correspondencia entre votante y voto una vez cerrada la elección, pero el operador la conoce en el momento de procesar el voto/i,
    );
    expect(content).not.toMatch(/voto an[oó]nimo/i);
  });

  it('dice lo que sigue sin cubrirse: sal durante la votación, vote_attempts y copias de seguridad', () => {
    expect(content).toMatch(/durante la votaci[oó]n, el servidor puede calcular el testigo único de cualquier persona/i);
    expect(content).toMatch(/`vote_attempts` guarda usuario y testigo único mientras un voto está pendiente/i);
    expect(content).toMatch(/copias de seguridad anteriores a la migraci[oó]n/i);
  });

  it('ya no dice que nullifier_audit guarda user_id ni que la separación esté pendiente', () => {
    expect(content).not.toMatch(/el operador conserva la correspondencia entre votante y voto en `?nullifier_audit`?/i);
    expect(content).not.toMatch(/separaci[oó]n de (esa relaci[oó]n|tablas)[^.]*pendiente/i);
    expect(content).not.toMatch(/en la misma fila,? (el identificador|`?user_id`?)/i);
  });

  it('reconoce que el sistema no es resistente a la coacción ni a la compra de votos', () => {
    expect(content).toMatch(/no es resistente a la coacci[oó]n/i);
    expect(content).toMatch(/compra de votos/i);
    // El mecanismo concreto: el comprobante/nullifier + el evento VoteCast permiten
    // demostrar a un tercero qué se votó. Sin esto, la frase de arriba podría
    // colarse sin explicar por qué es cierto.
    expect(content).toMatch(/VoteCast/);
    expect(content).toMatch(/demostrar a un tercero/i);
  });

  it('no afirma ni sugiere que el sistema resiste la coacción o impide la compra de votos', () => {
    // Lookbehind negativo: deja pasar "no es resistente a la coacción" (lo que dice
    // el documento) pero no "es resistente a la coacción" sin negar, ni "resiste la
    // coacción" a secas — que sería la afirmación falsa contraria.
    expect(content).not.toMatch(/(?<!no )es resistente a la coacci[oó]n/i);
    expect(content).not.toMatch(/\bresiste la coacci[oó]n/i);
    expect(content).not.toMatch(/impide la compra de votos/i);
    expect(content).not.toMatch(/no (permite|posibilita) la coacci[oó]n/i);
  });

  it('aclara que Semaphore por sí solo no basta para la resistencia a la coacción (falta resistencia al recibo)', () => {
    expect(content).toMatch(/resistencia al recibo/i);
    expect(content).toMatch(/MACI/);
  });
});
