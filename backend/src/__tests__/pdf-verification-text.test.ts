/**
 * Test para Punto 11:
 * El PDF de resultados no debe afirmar falsamente "All votes verified on Ethereum" siempre.
 * Debe reflejar el estado real de verificación:
 * - 100% verificado: "100% verificado en Ethereum"
 * - Parcial: "Verificación parcial (X voto(s) no verificables)"
 * - Discrepancia: "Discrepancia detectada con la blockchain"
 * - Sin respuesta / demo: "No verificado en blockchain"
 */
import { describe, it, expect } from 'vitest';
import { getPdfVerificationText } from '../../../frontend/src/utils/pdfVerification.js';

describe('Punto 11: Estado real de verificación en exportación PDF', () => {
  it('refleja 100% verificado solo si onChainVerified es true', () => {
    const text = getPdfVerificationText({
      onChainVerified: true,
      verificacion: { estado: 'coincide', votosNoVerificables: 0 },
    });
    expect(text).toBe('100% verificado en Ethereum');
  });

  it('refleja verificación parcial si hay votos no verificables (demo o sintéticos)', () => {
    const text = getPdfVerificationText({
      onChainVerified: false,
      verificacion: { estado: 'parcial', votosNoVerificables: 2 },
    });
    expect(text).toContain('Verificación parcial');
    expect(text).toContain('2');
    expect(text).not.toBe('All votes verified on Ethereum');
  });

  it('refleja discrepancia si el recuento de la cadena no coincide con la base', () => {
    const text = getPdfVerificationText({
      onChainVerified: false,
      verificacion: { estado: 'discrepancia', votosNoVerificables: 0 },
    });
    expect(text).toBe('Discrepancia detectada con la blockchain');
    expect(text).not.toBe('All votes verified on Ethereum');
  });

  it('refleja no verificado si es demo o la cadena no está disponible', () => {
    const text = getPdfVerificationText({
      onChainVerified: false,
      verificacion: { estado: 'sin-respuesta' },
    });
    expect(text).toBe('Sin confirmación de blockchain');

    const textDemo = getPdfVerificationText({
      onChainVerified: false,
    });
    expect(textDemo).toBe('No verificado en blockchain');
  });
});
