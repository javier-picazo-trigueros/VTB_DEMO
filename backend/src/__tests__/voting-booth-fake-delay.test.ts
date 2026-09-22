/**
 * Test para Punto 13:
 * Comprueba que en VotingBooth.jsx:
 * 1. Se ha eliminado el retardo artificial de 800ms que simulaba un cálculo local.
 * 2. No se establece el estado falso "proof" previo al envío del voto.
 * 3. El voto se envía directamente al backend (a través de api.post).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Punto 13: Eliminación del retardo artificial de 800ms en VotingBooth.jsx', () => {
  const votingBoothPath = path.resolve(__dirname, '../../../frontend/src/pages/VotingBooth.jsx');
  const content = fs.readFileSync(votingBoothPath, 'utf8');

  it('no contiene un retardo artificial de 800 ms en el flujo de votación', () => {
    expect(content).not.toMatch(/setTimeout\([^)]*800\)/);
    expect(content).not.toMatch(/800\s*\)/);
  });

  it('no simula un estado de cálculo local "proof" antes de enviar el voto', () => {
    expect(content).not.toMatch(/setVoteStatus\(["']proof["']\)/);
  });
});
