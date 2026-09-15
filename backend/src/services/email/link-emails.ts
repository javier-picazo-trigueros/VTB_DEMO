/**
 * Correos con enlace de un solo uso: invitación al censo y recuperación de
 * contraseña (P1-7).
 *
 * El token no se genera al encolar sino aquí, cuando el worker va a enviar. La
 * cola guarda solo template_data — a quién y los datos no secretos para
 * renderizar — y el enlace existe únicamente en el correo que sale y, como
 * hash, en password_reset_tokens. Ver la cabecera de queue.ts.
 */
import type { RawPayload } from './client.js';
import { renderInvitation, renderPasswordReset } from './templates.js';
import { issueEmailToken, RESET_TTL_MINUTES } from './tokens.js';

export type LinkTemplate = 'invitation' | 'password_reset';

/** Lo que se guarda en email_log.template_data. Nada de esto es secreto. */
export interface InvitationLinkData {
  userId: number;
  name: string;
  /** Ausente en el censo general, que no importa a una elección concreta. */
  electionName?: string;
  institutionName: string;
  requestedAt: string;
}

export interface PasswordResetLinkData {
  userId: number;
  name: string;
  requestedAt: string;
}

export type PreparedLinkEmail =
  | { kind: 'ready'; payload: RawPayload }
  | { kind: 'discard'; reason: string };

const discard = (reason: string): PreparedLinkEmail => ({ kind: 'discard', reason });

/**
 * Emite el token y renderiza el correo, o explica por qué no debe enviarse.
 *
 * 'discard' no es un error transitorio: la cola marca la fila como 'dead' y no
 * la reintenta. Un fallo de base de datos, en cambio, lanza y sigue el backoff
 * normal.
 */
export async function prepareLinkEmail(
  template: string,
  rawData: string,
  to: string,
): Promise<PreparedLinkEmail> {
  if (template !== 'invitation' && template !== 'password_reset') {
    return discard(`plantilla con enlace desconocida: ${template}`);
  }

  let data: Partial<InvitationLinkData>;
  try {
    data = JSON.parse(rawData);
  } catch {
    return discard('template_data no es JSON válido');
  }
  const userId = data.userId;
  if (typeof userId !== 'number' || !Number.isInteger(userId)) {
    return discard('template_data sin userId');
  }

  // Una recuperación que no ha salido a tiempo no se envía. Quien la pidió ya
  // habrá pedido otra o dejado de esperar, y un enlace que llega una hora tarde
  // solo confunde (y alarga la ventana en la que alguien más pudo pedirla).
  // Una fecha ilegible da NaN y también descarta: sin fecha no se sabe.
  if (template === 'password_reset') {
    const ageMs = Date.now() - Date.parse(String(data.requestedAt));
    if (!(ageMs <= RESET_TTL_MINUTES * 60 * 1000)) {
      return discard(
        `recuperación pedida hace más de ${RESET_TTL_MINUTES} minutos sin llegar a enviarse; no se reintenta`,
      );
    }
  }

  // Import diferido, como en queue.ts, para no crear ciclos en el arranque.
  const { getDbClient, withTransaction } = await import('../../db/index.js');

  const user = await getDbClient().get<{ id: number }>(
    'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
    [userId],
  );
  if (!user) return discard('el usuario ya no existe');

  let issued: { plaintext: string; expiresAt: Date } | undefined;
  await withTransaction(async (tx) => {
    issued = await issueEmailToken(tx, userId, template === 'password_reset' ? 'reset' : 'invitation');
  });
  if (!issued) throw new Error('no se pudo emitir el token');

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const name = String(data.name ?? '');

  const rendered = template === 'invitation'
    ? renderInvitation({
        to,
        name,
        // Sin elección se deja undefined a propósito: '' haría que la plantilla
        // la tratara como ausente igualmente, pero undefined es lo que declara
        // el tipo y evita que un `''` accidental acabe dentro de unas comillas
        // en el asunto si alguien cambia la condición.
        electionName:    data.electionName ? String(data.electionName) : undefined,
        institutionName: String(data.institutionName ?? ''),
        setPasswordUrl:  `${frontendUrl}/auth/set-password?token=${issued.plaintext}`,
        expiresAt:       issued.expiresAt,
      })
    : renderPasswordReset({
        to,
        name,
        resetUrl:  `${frontendUrl}/auth/reset-password?token=${issued.plaintext}`,
        expiresAt: issued.expiresAt,
      });

  return { kind: 'ready', payload: { to, ...rendered } };
}
