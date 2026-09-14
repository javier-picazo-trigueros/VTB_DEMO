import { describe, it, expect } from 'vitest';
import { formatError, redact } from '../utils/errors.js';

/**
 * A1 — el saneado de errores de blockchain.
 *
 * El objeto de error de ethers v6 arrastra info.payload (tx firmada),
 * transaction, receipt y la URL del RPC con la API key en el path.
 * formatError debe quedarse solo con mensaje, code y reason.
 */

/** Réplica de la forma real de un error de ethers v6 al enviar una tx. */
function makeEthersError() {
  const err: any = new Error(
    'could not coalesce error (error={ "code": -32000, "message": "insufficient funds" }, ' +
    'payload={"method":"eth_sendRawTransaction","params":["0x' + 'ab'.repeat(140) + '"]})',
  );
  err.shortMessage = 'could not coalesce error';
  err.code = 'UNKNOWN_ERROR';
  err.info = {
    error: { code: -32000, message: 'insufficient funds' },
    payload: {
      method: 'eth_sendRawTransaction',
      params: ['0x' + 'ab'.repeat(140)],
    },
    url: 'https://eth-sepolia.g.alchemy.com/v2/SUPER_SECRET_API_KEY',
  };
  err.transaction = {
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    data: '0x' + 'cd'.repeat(120),
  };
  err.receipt = { blockNumber: 1234, gasUsed: 21000n };
  return err;
}

describe('A1 — formatError', () => {
  it('no incluye payload, transaction ni receipt del error de ethers', () => {
    const out = formatError(makeEthersError());

    expect(out).not.toContain('eth_sendRawTransaction');
    expect(out).not.toContain('SUPER_SECRET_API_KEY');
    expect(out).not.toContain('0x1111111111111111111111111111111111111111');
    expect(out).not.toContain('21000');
    expect(out).not.toContain('blockNumber');
  });

  it('conserva mensaje corto y código para poder diagnosticar', () => {
    const out = formatError(makeEthersError());
    expect(out).toContain('could not coalesce error');
    expect(out).toContain('code=UNKNOWN_ERROR');
  });

  it('conserva el reason de un revert', () => {
    const err: any = new Error('execution reverted');
    err.code = 'CALL_EXCEPTION';
    err.reason = 'election does not exist';
    const out = formatError(err);
    expect(out).toContain('code=CALL_EXCEPTION');
    expect(out).toContain('reason=election does not exist');
  });

  it('redacta la API key del RPC si aparece en el mensaje', () => {
    const err: any = new Error(
      'failed to fetch https://eth-sepolia.g.alchemy.com/v2/SUPER_SECRET_API_KEY',
    );
    const out = formatError(err);
    expect(out).not.toContain('SUPER_SECRET_API_KEY');
    expect(out).toContain('https://eth-sepolia.g.alchemy.com/<redacted>');
  });

  it('redacta blobs hex largos pero conserva hashes de 32 bytes', () => {
    const txHash = '0x' + 'ab'.repeat(32);          // 64 hex → se conserva
    const rawTx = '0x' + 'cd'.repeat(200);          // 400 hex → se redacta
    const out = redact(`tx ${txHash} raw ${rawTx}`);
    expect(out).toContain(txHash);
    expect(out).toContain('0x<redacted-hex>');
    expect(out).not.toContain('cd'.repeat(200));
  });

  it('trunca mensajes desmesurados', () => {
    const out = formatError(new Error('x'.repeat(5000)));
    expect(out.length).toBeLessThan(400);
    expect(out).toContain('[+');
  });

  it('no revienta con valores raros', () => {
    expect(formatError(null)).toBe('unknown error');
    expect(formatError(undefined)).toBe('unknown error');
    expect(formatError('texto suelto')).toBe('texto suelto');
    expect(formatError(42)).toBe('42');
    expect(typeof formatError({})).toBe('string');
  });
});
