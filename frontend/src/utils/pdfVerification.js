/**
 * Utilidad para determinar el texto real de verificación que debe reflejarse
 * en la exportación PDF y otros informes de auditoría.
 *
 * Evita la afirmación falsa de "All votes verified on Ethereum" cuando hay
 * votos de demostración, discrepancias o la elección no está verificada.
 */
export const getPdfVerificationText = (results) => {
  if (results?.onChainVerified) {
    return '100% verificado en Ethereum';
  }
  const estado = results?.verificacion?.estado;
  if (estado === 'parcial') {
    const unverified = results?.verificacion?.votosNoVerificables ?? 0;
    return `Verificación parcial (${unverified} voto(s) no verificables)`;
  }
  if (estado === 'discrepancia') {
    return 'Discrepancia detectada con la blockchain';
  }
  if (estado === 'sin-respuesta') {
    return 'Sin confirmación de blockchain';
  }
  return 'No verificado en blockchain';
};
