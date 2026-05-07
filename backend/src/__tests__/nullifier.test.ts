import { describe, it, expect } from 'vitest';
import { generateNullifier } from '../utils/auth.js';

describe('Nullifier uniqueness and consistency', () => {
  it('same inputs produce same nullifier', () => {
    expect(generateNullifier(1, 1)).toBe(generateNullifier(1, 1));
  });

  it('different users produce different nullifiers', () => {
    expect(generateNullifier(1, 1)).not.toBe(generateNullifier(2, 1));
  });

  it('different elections produce different nullifiers', () => {
    expect(generateNullifier(1, 1)).not.toBe(generateNullifier(1, 2));
  });

  it('nullifier is bytes32 hex string', () => {
    expect(generateNullifier(1, 1)).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('double vote detected via nullifier set', () => {
    const used = new Set<string>();
    const n = generateNullifier(1, 1);
    used.add(n);
    expect(used.has(generateNullifier(1, 1))).toBe(true);
  });
});
