/**
 * API pública del servicio de email.
 * Todas las funciones son fire-and-forget: no bloquean y no lanzan.
 */

import { enqueue, enqueueLinkEmail } from './queue.js';
import {
  renderVoteConfirmation, type VoteConfirmationData,
  renderElectionOpen,     type ElectionOpenData,
  renderElectionClose,    type ElectionCloseData,
  invitationSubject,
  PASSWORD_RESET_SUBJECT,
} from './templates.js';
import type { InvitationLinkData, PasswordResetLinkData } from './link-emails.js';

/**
 * Invitación al censo. No lleva enlace: el token de "establece tu contraseña"
 * lo genera el worker al enviar, para que no quede en claro en email_log (P1-7).
 */
export interface InvitationRequest {
  to: string;
  userId: number;
  name: string;
  /**
   * Omitir cuando la invitación no cuelga de una elección concreta (censo
   * general). El correo cambia de "te ha habilitado para votar en X" a "te ha
   * dado acceso a la plataforma".
   */
  electionName?: string;
  institutionName: string;
}

/** Recuperación de contraseña. Igual que la invitación: sin enlace (P1-7). */
export interface PasswordResetRequest {
  to: string;
  userId: number;
  name: string;
}

export function sendCensusInvitation(req: InvitationRequest): void {
  const data: InvitationLinkData = {
    userId:          req.userId,
    name:            req.name,
    electionName:    req.electionName,
    institutionName: req.institutionName,
    requestedAt:     new Date().toISOString(),
  };
  enqueueLinkEmail({ template: 'invitation', to: req.to, subject: invitationSubject(req), data });
}

export function sendVoteConfirmation(data: VoteConfirmationData): void {
  const { subject, html, text } = renderVoteConfirmation(data);
  enqueue({ to: data.to, subject, html, text, template: 'vote_confirmation' });
}

export function sendPasswordReset(req: PasswordResetRequest): void {
  const data: PasswordResetLinkData = {
    userId:      req.userId,
    name:        req.name,
    requestedAt: new Date().toISOString(),
  };
  enqueueLinkEmail({ template: 'password_reset', to: req.to, subject: PASSWORD_RESET_SUBJECT, data });
}

export function sendElectionOpen(data: ElectionOpenData): void {
  const { subject, html, text } = renderElectionOpen(data);
  enqueue({ to: data.to, subject, html, text, template: 'election_open' });
}

export function sendElectionClose(data: ElectionCloseData): void {
  const { subject, html, text } = renderElectionClose(data);
  enqueue({ to: data.to, subject, html, text, template: 'election_close' });
}

// Re-export types por si las rutas los necesitan
export type {
  VoteConfirmationData,
  ElectionOpenData,
  ElectionCloseData,
};
