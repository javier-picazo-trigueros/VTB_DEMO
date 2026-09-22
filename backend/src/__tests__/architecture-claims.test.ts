/**
 * Test para Punto 15:
 * Comprueba que ARCHITECTURE.md refleja la arquitectura real:
 * 1. Express 5 + PostgreSQL (Supabase) + pool node-pg.
 * 2. Cookies httpOnly SameSite=Lax (no JWT en localStorage).
 * 3. Contrato v2 (ElectionRegistryV2 con castVote(electionId, nullifier, candidateId) y recuento por candidato).
 * 4. Cola del relayer con gestión secuencial de nonces.
 * 5. No afirma que @vtb.demo omite la blockchain o genera hashes sintéticos.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Punto 15: Actualización de ARCHITECTURE.md', () => {
  const archPath = path.resolve(__dirname, '../../../ARCHITECTURE.md');
  const content = fs.readFileSync(archPath, 'utf8');

  it('documenta PostgreSQL / Supabase y pool pg como base de datos principal', () => {
    expect(content).toMatch(/PostgreSQL|Supabase/i);
    expect(content).toMatch(/pg|node-pg|Pool/i);
    expect(content).not.toMatch(/Database\s*\|\s*SQLite embedded in backend process/i);
  });

  it('documenta cookies httpOnly con SameSite=Lax para autenticación en vez de localStorage', () => {
    expect(content).toMatch(/httpOnly/i);
    expect(content).toMatch(/SameSite\s*=\s*Lax/i);
    expect(content).not.toMatch(/JWT in localStorage.*Vulnerable to XSS/i);
    expect(content).not.toMatch(/JWT in Authorization header/i);
  });

  it('documenta el contrato v2 (ElectionRegistryV2) con candidateId y recuento por candidato', () => {
    expect(content).toMatch(/ElectionRegistryV2/i);
    expect(content).toMatch(/castVote\([^)]*candidateId[^)]*\)/i);
    expect(content).toMatch(/recuento por candidato|votesPerCandidate|tally per candidate/i);
    expect(content).not.toMatch(/castVote\(electionId,\s*nullifier,\s*voteHash\)/i);
  });

  it('documenta la cola del relayer con nonces secuenciales', () => {
    expect(content).toMatch(/nonce/i);
    expect(content).toMatch(/cola|queue|secuencial/i);
  });

  it('no afirma que las cuentas @vtb.demo omiten la blockchain ni que generan hashes sintéticos', () => {
    expect(content).not.toMatch(/Two-Tier Demo System/i);
    expect(content).not.toMatch(/vtb\.demo accounts never touch the real blockchain/i);
    expect(content).not.toMatch(/Synthetic SHA-256 \(not on Sepolia\)/i);
  });
});
