// ─── Layout base ────────────────────────────────────────────────────────────

function base(preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- preheader invisible -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F0F4F8;">
    <tr><td align="center" style="padding:40px 16px 48px;">

      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td style="background:#1E3A5F;padding:28px 36px 24px;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.3px;">VoteTrustBlock</p>
            <p style="margin:5px 0 0;color:#8AAEC8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Sistema de Votación Universitaria</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 32px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:20px 36px;">
            <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.6;">
              Este es un mensaje automático de VoteTrustBlock. Por favor, no respondas a este correo.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 8px;">
    <tr>
      <td style="background:#1E3A5F;border-radius:6px;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:.3px;">${label}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 4px;color:#94A3B8;font-size:11px;">Si el botón no funciona, copia este enlace:</p>
  <p style="margin:0;font-size:11px;word-break:break-all;"><a href="${url}" style="color:#2D6EAA;">${url}</a></p>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;color:#1A202C;font-size:22px;font-weight:700;line-height:1.3;">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${text}</p>`;
}

function badge(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#6B7280;font-size:13px;width:130px;">${label}</td>
    <td style="padding:6px 0;color:#1A202C;font-size:13px;font-weight:600;">${value}</td>
  </tr>`;
}

function table(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation"
          style="width:100%;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:4px 16px;margin:20px 0;">
    ${rows}
  </table>`;
}

function fmtDate(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }) + ' (hora peninsular)';
}

// ─── Template 1: Invitación al censo ────────────────────────────────────────

export interface InvitationData {
  to: string;
  name: string;
  /**
   * Ausente cuando la invitación viene del censo general (`/admin/users/import`),
   * que no importa a una elección concreta sino a la institución entera: la
   * persona queda auto-asignada a todas las elecciones que casen con su dominio,
   * que pueden ser ninguna o quince. Con elección se nombra; sin ella, el correo
   * habla de acceso a la plataforma.
   */
  electionName?: string;
  institutionName: string;
  setPasswordUrl: string;
  expiresAt: Date;
}

/** Aparte del render porque la cola guarda el asunto al encolar, antes de que exista el enlace. */
export function invitationSubject(d: { electionName?: string; institutionName: string }): string {
  return d.electionName
    ? `Invitación para votar en "${d.electionName}" — ${d.institutionName}`
    : `Tu acceso a VoteTrustBlock — ${d.institutionName}`;
}

export function renderInvitation(d: InvitationData): { subject: string; html: string; text: string } {
  const subject = invitationSubject(d);

  const body =
    h1('Has sido incluido en el censo electoral') +
    p(`Hola <strong>${esc(d.name)}</strong>,`) +
    p(d.electionName
      ? `Tu institución, <strong>${esc(d.institutionName)}</strong>, te ha habilitado para participar en la siguiente votación:`
      : `Tu institución, <strong>${esc(d.institutionName)}</strong>, te ha dado acceso a la plataforma de votación. Recibirás un aviso cuando se abra cada proceso electoral en el que puedas participar.`) +
    table(
      (d.electionName ? badge('Proceso electoral:', esc(d.electionName)) : '') +
      badge('Enlace válido hasta:', fmtDate(d.expiresAt)),
    ) +
    p('Para poder acceder, primero debes establecer tu contraseña. Haz clic en el botón para completar tu registro:') +
    btn(d.setPasswordUrl, 'Establecer contraseña') +
    p('<small style="color:#94A3B8;">Si no esperabas este mensaje, puedes ignorarlo. Nadie puede acceder a tu cuenta sin completar este paso.</small>');

  const html = base(subject, body);

  const text = [
    `Has sido incluido en el censo electoral`,
    ``,
    `Hola ${d.name},`,
    ``,
    d.electionName
      ? `Tu institución (${d.institutionName}) te ha habilitado para votar en: ${d.electionName}.`
      : `Tu institución (${d.institutionName}) te ha dado acceso a la plataforma de votación. Recibirás un aviso cuando se abra cada proceso electoral en el que puedas participar.`,
    ``,
    `Para acceder, establece tu contraseña antes del ${fmtDate(d.expiresAt)}:`,
    d.setPasswordUrl,
    ``,
    `Si no esperabas este mensaje, puedes ignorarlo.`,
  ].join('\n');

  return { subject, html, text };
}

// ─── Template 2: Confirmación de voto emitido ───────────────────────────────

export interface VoteConfirmationData {
  to: string;
  name: string;
  electionName: string;
  txHash: string;
  votedAt: Date;
  explorerUrl?: string;
}

export function renderVoteConfirmation(d: VoteConfirmationData): { subject: string; html: string; text: string } {
  const subject = `Tu voto ha sido registrado — ${d.electionName}`;
  const shortHash = d.txHash.length > 20
    ? d.txHash.slice(0, 10) + '…' + d.txHash.slice(-8)
    : d.txHash;
  const explorerLink = d.explorerUrl
    ? `<a href="${d.explorerUrl}" style="color:#2D6EAA;">${shortHash}</a>`
    : `<code style="font-size:12px;">${shortHash}</code>`;

  const body =
    `<div style="text-align:center;margin:0 0 28px;">
       <div style="display:inline-block;background:#ECFDF5;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;">✓</div>
     </div>` +
    h1('Voto registrado correctamente') +
    p(`Hola <strong>${esc(d.name)}</strong>,`) +
    p(`Tu participación en <strong>${esc(d.electionName)}</strong> ha quedado registrada de forma permanente y auditable en la blockchain.`) +
    table(
      badge('Proceso:', esc(d.electionName)) +
      badge('Fecha y hora:', fmtDate(d.votedAt)) +
      badge('Transacción:', explorerLink),
    ) +
    p('<small style="color:#94A3B8;">Guarda este mensaje como comprobante. La transacción en blockchain es permanente y auditable públicamente.</small>');

  const html = base(subject, body);

  const text = [
    `Tu voto ha sido registrado correctamente`,
    ``,
    `Hola ${d.name},`,
    ``,
    `Tu participación en "${d.electionName}" ha quedado registrada de forma permanente y auditable en la blockchain.`,
    ``,
    `Proceso:    ${d.electionName}`,
    `Fecha:      ${fmtDate(d.votedAt)}`,
    `Transacción: ${d.txHash}`,
    d.explorerUrl ? `Ver en blockchain: ${d.explorerUrl}` : '',
    ``,
    `Conserva este mensaje como comprobante.`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

// ─── Template 3: Recuperación de contraseña ─────────────────────────────────

export interface PasswordResetData {
  to: string;
  name: string;
  resetUrl: string;
  expiresAt: Date;
}

/** Constante por la misma razón que invitationSubject(). */
export const PASSWORD_RESET_SUBJECT = 'Restablece tu contraseña — VoteTrustBlock';

export function renderPasswordReset(d: PasswordResetData): { subject: string; html: string; text: string } {
  const subject = PASSWORD_RESET_SUBJECT;

  const body =
    h1('Solicitud de cambio de contraseña') +
    p(`Hola <strong>${esc(d.name)}</strong>,`) +
    p('Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si fuiste tú, haz clic en el botón siguiente:') +
    btn(d.resetUrl, 'Restablecer contraseña') +
    table(badge('Este enlace caduca:', fmtDate(d.expiresAt))) +
    p('<strong style="color:#DC2626;">Si no solicitaste este cambio</strong>, ignora este mensaje. Tu contraseña actual permanece sin cambios.');

  const html = base(subject, body);

  const text = [
    `Restablece tu contraseña`,
    ``,
    `Hola ${d.name},`,
    ``,
    `Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.`,
    ``,
    `Haz clic en el siguiente enlace (válido hasta ${fmtDate(d.expiresAt)}):`,
    d.resetUrl,
    ``,
    `Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no cambia.`,
  ].join('\n');

  return { subject, html, text };
}

// ─── Template 4: Apertura de votación ───────────────────────────────────────

export interface ElectionOpenData {
  to: string;
  name: string;
  electionName: string;
  startTime: Date;
  endTime: Date;
  voteUrl: string;
}

export function renderElectionOpen(d: ElectionOpenData): { subject: string; html: string; text: string } {
  const subject = `Votación abierta: "${d.electionName}"`;

  const body =
    `<div style="background:#EFF6FF;border-left:4px solid #2D6EAA;padding:12px 16px;margin:0 0 24px;border-radius:0 6px 6px 0;">
       <p style="margin:0;color:#1E40AF;font-size:13px;font-weight:600;">🗳️ La votación está ahora abierta</p>
     </div>` +
    h1(esc(d.electionName)) +
    p(`Hola <strong>${esc(d.name)}</strong>,`) +
    p('Estás habilitado para votar en el proceso electoral que acaba de comenzar. Tu voto es irrevocable una vez emitido.') +
    table(
      badge('Apertura:', fmtDate(d.startTime)) +
      badge('Cierre:', fmtDate(d.endTime)),
    ) +
    btn(d.voteUrl, 'Ir a votar') +
    p('<small style="color:#94A3B8;">Solo puedes votar una vez. Una vez emitido, tu voto no puede modificarse.</small>');

  const html = base(subject, body);

  const text = [
    `Votación abierta: "${d.electionName}"`,
    ``,
    `Hola ${d.name},`,
    ``,
    `El proceso electoral "${d.electionName}" está ahora abierto.`,
    ``,
    `Apertura: ${fmtDate(d.startTime)}`,
    `Cierre:   ${fmtDate(d.endTime)}`,
    ``,
    `Vota en:`,
    d.voteUrl,
    ``,
    `Solo puedes votar una vez. El voto no se puede modificar.`,
  ].join('\n');

  return { subject, html, text };
}

// ─── Template 5: Cierre y resultados ────────────────────────────────────────

export interface ElectionCloseData {
  to: string;
  name: string;
  electionName: string;
  closedAt: Date;
  resultsUrl: string;
}

export function renderElectionClose(d: ElectionCloseData): { subject: string; html: string; text: string } {
  const subject = `Cierre de votación y resultados disponibles — "${d.electionName}"`;

  const body =
    h1('El período de votación ha concluido') +
    p(`Hola <strong>${esc(d.name)}</strong>,`) +
    p(`El proceso electoral <strong>${esc(d.electionName)}</strong> ha cerrado. Los resultados están disponibles públicamente en la blockchain y pueden consultarse a continuación.`) +
    table(badge('Cierre:', fmtDate(d.closedAt))) +
    btn(d.resultsUrl, 'Ver resultados') +
    p('<small style="color:#94A3B8;">Los resultados son definitivos y están registrados en la blockchain Sepolia de Ethereum. Son auditables públicamente e inmutables.</small>');

  const html = base(subject, body);

  const text = [
    `Cierre de votación: "${d.electionName}"`,
    ``,
    `Hola ${d.name},`,
    ``,
    `El proceso electoral "${d.electionName}" ha finalizado el ${fmtDate(d.closedAt)}.`,
    ``,
    `Los resultados están disponibles en:`,
    d.resultsUrl,
    ``,
    `Los resultados son definitivos, auditables en blockchain e inmutables.`,
  ].join('\n');

  return { subject, html, text };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
