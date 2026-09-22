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
});
