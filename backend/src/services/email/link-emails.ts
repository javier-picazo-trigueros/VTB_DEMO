/**
 * Correos con enlace de un solo uso: invitación al censo, recuperación de
 * contraseña (P1-7) y confirmación del email del registro público (SCRUM-123).
 *
 * El token no se genera al encolar sino aquí, cuando el worker va a enviar. La
 * cola guarda solo template_data — a quién y los datos no secretos para
 * renderizar — y el enlace existe únicamente en el correo que sale y, como
 * hash, en password_reset_tokens. Ver la cabecera de queue.ts.
 */
import type { RawPayload } from './client.js';
import { renderInvitation, renderPasswordReset, renderRegistrationVerify } from './templates.js';
import { issueEmailToken, RESET_TTL_MINUTES, REGISTRATION_VERIFY_TTL_HOURS } from './tokens.js';
import { generateSecureToken } from '../../utils/auth.js';

export type LinkTemplate = 'invitation' | 'password_reset' | 'registration_verify';

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

/**
 * Confirmación del registro. Lleva el id de la solicitud y no de un usuario:
 * la cuenta todavía no existe, y no existirá hasta que se abra el enlace.
 */
export interface RegistrationVerifyLinkData {
  requestId: number;
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
  if (template === 'registration_verify') {
    return prepareRegistrationVerify(rawData, to);
  }
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

/**
 * El token de confirmación se guarda, como hash, en la propia solicitud: no
 * en password_reset_tokens, cuyo user_id es obligatorio y aquí no hay usuario
 * todavía (ver la migración 015).
 *
 * Cada envío emite un token nuevo y pisa el anterior, igual que issueEmailToken
 * con la recuperación: si el correo se reintenta, solo vale el último enlace.
 * El UPDATE exige status 'unverified', así que una solicitud ya confirmada,
 * rechazada o borrada por el job de retención no recibe enlace.
 */
async function prepareRegistrationVerify(rawData: string, to: string): Promise<PreparedLinkEmail> {
  let data: Partial<RegistrationVerifyLinkData>;
  try {
    data = JSON.parse(rawData);
  } catch {
    return discard('template_data no es JSON válido');
  }
  const requestId = data.requestId;
  if (typeof requestId !== 'number' || !Number.isInteger(requestId)) {
    return discard('template_data sin requestId');
  }

  const { getDbClient } = await import('../../db/index.js');
  const { plaintext, hash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + REGISTRATION_VERIFY_TTL_HOURS * 3600 * 1000);

  const updated = await getDbClient().exec(
    `UPDATE registration_requests
        SET verify_token_hash = ?, verify_expires_at = ?
      WHERE id = ? AND status = 'unverified'`,
    [hash, expiresAt.toISOString(), requestId],
  );
  if (updated.changes === 0) return discard('la solicitud ya no está pendiente de confirmar');

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const rendered = renderRegistrationVerify({
    to,
    name: String(data.name ?? ''),
    verifyUrl: `${frontendUrl}/verify-email?token=${plaintext}`,
    expiresAt,
  });
  return { kind: 'ready', payload: { to, ...rendered } };
}
