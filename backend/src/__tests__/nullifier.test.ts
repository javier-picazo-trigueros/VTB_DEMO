import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const generateNullifier = (userId: number, electionId: number, secret: string): string => {
  return crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${electionId}`)
    .digest('hex');
};

describe('Nullifier uniqueness and consistency', () => {
  const secret = 'test_secret';

  it('same inputs produce same nullifier', () => {
    expect(generateNullifier(1, 1, secret)).toBe(generateNullifier(1, 1, secret));
  });

  it('different users produce different nullifiers', () => {
    expect(generateNullifier(1, 1, secret)).not.toBe(generateNullifier(2, 1, secret));
  });

  it('different elections produce different nullifiers', () => {
    expect(generateNullifier(1, 1, secret)).not.toBe(generateNullifier(1, 2, secret));
  });

  it('nullifier is 64-char hex string', () => {
    expect(generateNullifier(1, 1, secret)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('double vote detected via nullifier set', () => {
    const used = new Set<string>();
    const n = generateNullifier(1, 1, secret);
    used.add(n);
    expect(used.has(generateNullifier(1, 1, secret))).toBe(true);
  });
});
