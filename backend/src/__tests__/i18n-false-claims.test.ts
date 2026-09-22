/**
 * Test para Punto 12:
 * Comprueba que en i18n/config.ts se han eliminado las afirmaciones falsas sobre:
 * 1. Que el nullifier se calcula en local.
 * 2. Que solo se registra el hash del voto en la cadena (en v2 se registra el candidato).
 * 3. Que no se revela la elección en la cadena (en v2 el evento VoteCast incluye el candidateId).
 * 4. Que Hardhat local está corriendo (npx hardhat node).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Punto 12: Eliminación de afirmaciones falsas en i18n/config.ts', () => {
  const configPath = path.resolve(__dirname, '../../../frontend/src/i18n/config.ts');
  const content = fs.readFileSync(configPath, 'utf8');

  it('no afirma que el nullifier se calcula localmente (es HMAC en backend)', () => {
    expect(content).not.toMatch(/calcula localmente/i);
    expect(content).not.toMatch(/computed locally/i);
  });

  it('no afirma que en blockchain solo se registra el hash del voto (v2 registra el candidato)', () => {
    expect(content).not.toMatch(/solo se registra.*hash del voto/i);
    expect(content).not.toMatch(/only nullifier and vote hash are recorded/i);
    expect(content).not.toMatch(/votes are hashed locally/i);
  });

  it('no afirma falsamente que la elección del candidato no se revela en la cadena', () => {
    expect(content).not.toMatch(/ni su elección en la cadena/i);
    expect(content).not.toMatch(/nor their choice on-chain/i);
  });

  it('no instruye al usuario a correr npx hardhat node en producción', () => {
    expect(content).not.toMatch(/npx hardhat node/i);
  });

  it('precisa en español e inglés que en la cadena no figura nombre ni correo y que el operador conserva la correspondencia', () => {
    expect(content).toMatch(/no figura nombre ni correo/i);
    expect(content).toMatch(/no name or email appears on-chain/i);
    expect(content).toMatch(/operador del sistema conserva la correspondencia entre votante y voto/i);
    expect(content).toMatch(/system operator retains the correspondence between voter and vote/i);
  });
});
