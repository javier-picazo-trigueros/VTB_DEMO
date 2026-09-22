/**
 * Test para Punto 3:
 * Detección y resolución de transacciones atascadas en el relayer.
 *
 * Si una transacción con nonce N se queda atascada (e.g. gas insuficiente tras un pico de tarifas):
 * - Las siguientes transacciones N+1, N+2 quedan bloqueadas por el orden estricto de nonces de Ethereum.
 * - checkRelayerNonceStatus debe detectar el gap (pendingNonce > latestNonce).
 * - replaceStuckRelayerTx debe permitir desatascar el slot mediante:
 *   a) 'cancel': envío de 0 ETH a sí mismo con el mismo nonce y gas aumentado (≥20%),
 *   b) 'speedup': reenvío de la transacción con mayor gas.
 */
import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import {
  checkRelayerNonceStatus,
  replaceStuckRelayerTx,
  createVotePort,
} from '../services/voteChain.js';

describe('Punto 3: Detección y resolución de transacciones atascadas del relayer', () => {
  it('detecta transacciones atascadas cuando pendingNonce supera a latestNonce', async () => {
    const mockWallet = {
      address: '0x1111111111111111111111111111111111111111',
      getNonce: vi.fn(async (tag: string) => {
        if (tag === 'latest') return 5;
        if (tag === 'pending') return 9; // 4 transacciones en vuelo / atascadas
        return 5;
      }),
    } as unknown as ethers.Wallet;

    const status = await checkRelayerNonceStatus(mockWallet, 3);

    expect(status.latestNonce).toBe(5);
    expect(status.pendingNonce).toBe(9);
    expect(status.inFlightCount).toBe(4);
    expect(status.isCongested).toBe(true);
  });

  it('reporta no congestionado cuando no hay transacciones pendientes', async () => {
    const mockWallet = {
      address: '0x1111111111111111111111111111111111111111',
      getNonce: vi.fn(async () => 5),
    } as unknown as ethers.Wallet;

    const status = await checkRelayerNonceStatus(mockWallet);

    expect(status.inFlightCount).toBe(0);
    expect(status.isCongested).toBe(false);
  });

  it('reemplaza transacción atascada con acción cancel (0 ETH a sí mismo con gas aumentado)', async () => {
    const mockSend = vi.fn(async (txReq: any) => ({
      hash: '0xreplacement_cancel_hash',
      nonce: txReq.nonce,
    }));

    const mockProvider = {
      getFeeData: vi.fn(async () => ({
        maxFeePerGas: 1000000000n, // 1 gwei
        maxPriorityFeePerGas: 100000000n, // 0.1 gwei
      })),
    };

    const mockWallet = {
      address: '0x1111111111111111111111111111111111111111',
      provider: mockProvider,
      sendTransaction: mockSend,
    } as unknown as ethers.Wallet;

    const res = await replaceStuckRelayerTx(mockWallet, 5, {
      type: 'cancel',
      gasBumpPercentage: 25,
    });

    expect(res.hash).toBe('0xreplacement_cancel_hash');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '0x1111111111111111111111111111111111111111',
        value: 0,
        nonce: 5,
        maxFeePerGas: 1250000000n, // 1.25 gwei (+25%)
        maxPriorityFeePerGas: 125000000n, // 0.125 gwei (+25%)
      }),
    );
  });

  it('reemplaza transacción atascada con acción speedup (mismo destino con gas aumentado)', async () => {
    const mockSend = vi.fn(async (txReq: any) => ({
      hash: '0xreplacement_speedup_hash',
      nonce: txReq.nonce,
    }));

    const mockProvider = {
      getFeeData: vi.fn(async () => ({
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 200000000n,
      })),
    };

    const mockWallet = {
      address: '0x1111111111111111111111111111111111111111',
      provider: mockProvider,
      sendTransaction: mockSend,
    } as unknown as ethers.Wallet;

    const res = await replaceStuckRelayerTx(mockWallet, 7, {
      type: 'speedup',
      to: '0x2222222222222222222222222222222222222222',
      data: '0xabcdef',
      gasBumpPercentage: 20,
    });

    expect(res.hash).toBe('0xreplacement_speedup_hash');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '0x2222222222222222222222222222222222222222',
        data: '0xabcdef',
        nonce: 7,
        maxFeePerGas: 2400000000n, // +20%
        maxPriorityFeePerGas: 240000000n, // +20%
      }),
    );
  });

  it('utiliza speedup como acción por defecto y nunca ejecuta cancel automáticamente', async () => {
    const mockSend = vi.fn(async (txReq: any) => ({
      hash: '0xdefault_speedup_hash',
      nonce: txReq.nonce,
    }));

    const mockProvider = {
      getFeeData: vi.fn(async () => ({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      })),
    };

    const mockWallet = {
      address: '0x1111111111111111111111111111111111111111',
      provider: mockProvider,
      sendTransaction: mockSend,
    } as unknown as ethers.Wallet;

    // Llamada sin especificar type en opciones
    await replaceStuckRelayerTx(mockWallet, 8);

    // No debe ser cancel (0 ETH a sí mismo)
    expect(mockSend).not.toHaveBeenCalledWith(
      expect.objectContaining({
        value: 0,
        to: '0x1111111111111111111111111111111111111111',
      }),
    );
  });
});
