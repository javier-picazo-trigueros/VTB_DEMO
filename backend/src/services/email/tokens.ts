/**
 * Tokens de un solo uso para los enlaces que se envían por correo:
 * recuperación de contraseña ('reset') e invitación al censo ('invitation').
 *
 * En la base solo se guarda sha256(token). El texto en claro existe únicamente
 * en el correo que sale, porque quien lo genera es el worker de la cola en el
 * momento de enviar (ver link-emails.ts y la cabecera de queue.ts, P1-7).
 */
import type { DbClient } from '../../db/client.js';
import { generateSecureToken } from '../../utils/auth.js';

export const RESET_TTL_MINUTES = 15;
export const INVITATION_TTL_DAYS = 7;

export type EmailTokenType = 'reset' | 'invitation';

export function tokenTtlMs(type: EmailTokenType): number {
  return type === 'reset'
    ? RESET_TTL_MINUTES * 60 * 1000
    : INVITATION_TTL_DAYS * 86400 * 1000;
}

/**
 * Anula los tokens sin usar del mismo tipo y emite uno nuevo.
 *
 * Hay que llamarla con el cliente de una transacción: si el INSERT fallase
 * después del UPDATE quedarían cero enlaces válidos (molesto, pero seguro). Lo
 * que no puede pasar es lo contrario — emitir el nuevo y que sobrevivan los
 * viejos — porque entonces pedir otro enlace dejaría de invalidar el anterior.
 */
export async function issueEmailToken(
  tx: DbClient,
  userId: number,
  type: EmailTokenType,
): Promise<{ plaintext: string; expiresAt: Date }> {
  const { plaintext, hash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + tokenTtlMs(type));

  await tx.exec(
    `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND type = ? AND used_at IS NULL`,
    [userId, type],
  );
  await tx.exec(
    `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, hash, type, expiresAt.toISOString()],
  );

  return { plaintext, expiresAt };
}
