/**
 * API pública del servicio de email.
 * Todas las funciones son fire-and-forget: no bloquean y no lanzan.
 */

import { enqueue } from './queue.js';
import {
  renderInvitation,       type InvitationData,
  renderVoteConfirmation, type VoteConfirmationData,
  renderPasswordReset,    type PasswordResetData,
  renderElectionOpen,     type ElectionOpenData,
  renderElectionClose,    type ElectionCloseData,
} from './templates.js';

export function sendCensusInvitation(data: InvitationData): void {
  const { subject, html, text } = renderInvitation(data);
  enqueue({ to: data.to, subject, html, text, template: 'invitation' });
}

export function sendVoteConfirmation(data: VoteConfirmationData): void {
  const { subject, html, text } = renderVoteConfirmation(data);
  enqueue({ to: data.to, subject, html, text, template: 'vote_confirmation' });
}

export function sendPasswordReset(data: PasswordResetData): void {
  const { subject, html, text } = renderPasswordReset(data);
  enqueue({ to: data.to, subject, html, text, template: 'password_reset' });
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
  InvitationData,
  VoteConfirmationData,
  PasswordResetData,
  ElectionOpenData,
  ElectionCloseData,
};
