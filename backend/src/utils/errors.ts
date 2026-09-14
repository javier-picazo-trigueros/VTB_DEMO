/**
 * Saneado de errores para logging.
 *
 * Motivación (A1): los objetos de error de ethers v6 arrastran mucho más que
 * un mensaje. Volcarlos enteros con `console.error("...", err)` escribe en el
 * log, entre otras cosas:
 *
 *   err.info.payload   → petición JSON-RPC completa; en eth_sendRawTransaction
 *                        incluye la transacción firmada en crudo
 *   err.transaction    → { from, to, data } de la llamada
 *   err.receipt        → recibo completo
 *   err.info.error.url → endpoint RPC, que en Alchemy/Infura lleva la API key
 *                        embebida en el path
 *
 * La clave privada NO aparece en ninguno de esos campos: ethers la redacta en
 * sus propios mensajes y una transacción firmada no permite derivarla. El
 * secreto que sí se filtra por esta vía es la credencial del proveedor RPC.
 *
 * `formatError` reduce cualquier error a `mensaje | code=X | reason=Y`, que es
 * lo único que hace falta para diagnosticar, y redacta lo que quede.
 */

/** Longitud máxima del mensaje antes de truncar. */
const MAX_MESSAGE_LEN = 300;
const MAX_REASON_LEN = 120;

/** URLs completas: se conserva el origen y se descarta el path (API key). */
const URL_RE = /https?:\/\/[^\s"'`)\]]+/gi;

/**
 * Blobs hex largos: transacción firmada y calldata.
 * Umbral en 100 caracteres para no tocar hashes de 32 bytes (0x + 64), que son
 * públicos y necesarios para depurar (txHash, nullifier).
 */
const LONG_HEX_RE = /0x[0-9a-fA-F]{100,}/g;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…[+${text.length - max}]` : text;
}

/** Elimina credenciales incrustadas en un texto de error. */
export function redact(text: string): string {
  return text
    .replace(URL_RE, (raw) => {
      try {
        return `${new URL(raw).origin}/<redacted>`;
      } catch {
        return '<redacted-url>';
      }
    })
    .replace(LONG_HEX_RE, '0x<redacted-hex>');
}

/**
 * Reduce cualquier error a una sola línea segura para el log.
 *
 * Solo se leen `shortMessage`/`message`, `code` y `reason`. El resto de campos
 * del error se descartan de forma deliberada: nunca se tocan `info`, `payload`,
 * `transaction`, `receipt` ni `requestBody`.
 */
export function formatError(err: unknown): string {
  if (err === null || err === undefined) return 'unknown error';

  if (typeof err !== 'object') {
    return redact(truncate(String(err), MAX_MESSAGE_LEN));
  }

  const e = err as Record<string, unknown>;

  // ethers v6 expone `shortMessage` (limpio) además de `message`, que puede
  // llevar el payload JSON-RPC serializado dentro. Preferimos shortMessage.
  const raw =
    typeof e.shortMessage === 'string' && e.shortMessage
      ? e.shortMessage
      : typeof e.message === 'string' && e.message
        ? e.message
        : Object.prototype.toString.call(err);

  const parts = [redact(truncate(raw, MAX_MESSAGE_LEN))];

  if (typeof e.code === 'string' || typeof e.code === 'number') {
    parts.push(`code=${e.code}`);
  }
  // `reason` en CALL_EXCEPTION es el motivo del revert: útil y sin secretos.
  if (typeof e.reason === 'string' && e.reason) {
    parts.push(`reason=${redact(truncate(e.reason, MAX_REASON_LEN))}`);
  }

  return parts.join(' | ');
}
