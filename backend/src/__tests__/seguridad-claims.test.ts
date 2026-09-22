/**
 * Test para Punto 14:
 * Comprueba que en SEGURIDAD.md:
 * 1. No se afirma que el relayer o dueño no pueden añadir/inyectar votos (pueden inventar nullifiers o autorizarse).
 * 2. No se promete Semaphore/ZK como solución futura en marcha ni se oculta que no resuelve coacción/compra de votos.
 * 3. Se reconoce que los nullifiers en cadena son seudonimización, no anonimización completa.
 * 4. Se aclara que el recuento independiente solo comprueba lo que el contrato aceptó, no la legitimidad de los votantes.
 * 5. Se reconoce la limitación a consultas no secretas.
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

  it('no afirma que la base de datos deja de conservar la correspondencia tras el cierre (falso mientras nullifier_audit guarde user_id sin separar)', () => {
    // Afirmación que estuvo en el documento y es falsa hoy: nullifier_audit guarda
    // user_id, election_id y vote_choice en la misma fila, sin plazo de borrado,
    // se cierre o no la elección. La sal efímera (services/electionSalt.ts) impide
    // recalcular el nullifier tras el cierre, pero no borra esa fila ni separa el
    // user_id del voto. Este test debe seguir fallando si la frase vuelve, y solo
    // se relaja si algún día existe código que de verdad separe esa relación.
    expect(content).not.toMatch(/la base de datos no conserva la correspondencia entre votante y voto/i);
    expect(content).not.toMatch(/\bvoto an[oó]nimo\b/i);
  });

  it('reconoce que el operador conserva la correspondencia en nullifier_audit sin plazo de borrado, y que la sal no la separa', () => {
    expect(content).toMatch(/el operador conserva la correspondencia entre votante y voto en `?nullifier_audit`?/i);
    expect(content).toMatch(/sin plazo de borrado/i);
    expect(content).toMatch(/separaci[oó]n de (esa relaci[oó]n|tablas)[^.]*pendiente/i);
  });
});
