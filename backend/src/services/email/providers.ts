/**
 * Proveedores de correo. Solo APIs HTTP: Render gratis bloquea el SMTP saliente,
 * así que no hay SMTP ni nodemailer.
 *
 * Se elige con EMAIL_PROVIDER (resend | brevo | console) y el remitente con
 * EMAIL_FROM. La cola (queue.ts) no sabe qué proveedor hay detrás: llama a
 * `configError()` antes de preparar el correo y a `send()` para enviarlo.
 */

import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendOptions {
  /** Solo Resend la usa: deduplica en servidor los reintentos tras un crash. */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly name: 'resend' | 'brevo' | 'console';
  /** false si no entrega correo de verdad (console): la cola lo deja en 'skipped'. */
  readonly delivers: boolean;
  readonly from: string;
  /** Qué falta para poder enviar (clave, remitente), o null si está listo. */
  configError(): string | null;
  /** Lanza si el envío falla. Devuelve el id del mensaje, o null si no hay. */
  send(message: EmailMessage, options?: SendOptions): Promise<string | null>;
}

export type EmailEnv = Record<string, string | undefined>;

const PROVIDER_NAMES = ['resend', 'brevo', 'console'] as const;

// `onboarding@resend.dev` es el dominio de demo de Resend: solo entrega a la
// dirección verificada de tu cuenta. Con otro proveedor hay que definir EMAIL_FROM.
const DEFAULT_RESEND_FROM = 'VoteTrustBlock <onboarding@resend.dev>';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 15_000;

/** `a***@dominio.es`: suficiente para reconocer el correo en un log sin guardar la dirección. */
export function maskEmail(address: string): string {
  const at = address.indexOf('@');
  if (at < 1) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

/** "Nombre <correo@dominio>" o solo la dirección, en la forma que pide Brevo. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!match) return { email: from.trim() };
  return match[1] ? { name: match[1], email: match[2] } : { email: match[2] };
}

function createResendProvider(env: EmailEnv): EmailProvider {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || env.RESEND_FROM || DEFAULT_RESEND_FROM;
  const client = apiKey ? new Resend(apiKey) : null;

  return {
    name: 'resend',
    delivers: true,
    from,
    configError: () => (apiKey ? null : 'RESEND_API_KEY no está definida: no se puede enviar con el proveedor resend'),
    async send(message, options) {
      if (!client) throw new Error('RESEND_API_KEY no está definida: no se puede enviar con el proveedor resend');
      const { data, error } = await client.emails.send(
        { from, to: message.to, subject: message.subject, html: message.html, text: message.text },
        options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
      );
      if (error) throw new Error(error.message ?? 'Resend rechazó el envío');
      return data?.id ?? null;
    },
  };
}

function createBrevoProvider(env: EmailEnv, fetchImpl: typeof fetch): EmailProvider {
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM ?? '';

  const configError = () => {
    if (!apiKey) return 'BREVO_API_KEY no está definida: no se puede enviar con el proveedor brevo';
    if (!from) return 'EMAIL_FROM no está definida: Brevo exige un remitente verificado';
    return null;
  };

  return {
    name: 'brevo',
    delivers: true,
    from,
    configError,
    async send(message) {
      const problem = configError();
      if (problem) throw new Error(problem);

      const response = await fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey!, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: parseSender(from),
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
        signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
      });

      const body = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string };
      // Solo el estado y el mensaje de Brevo: no se vuelca la respuesta ni la petición.
      if (!response.ok) throw new Error(`Brevo respondió ${response.status}: ${body.message ?? 'sin detalle'}`);
      return body.messageId ?? null;
    },
  };
}

function createConsoleProvider(): EmailProvider {
  return {
    name: 'console',
    delivers: false,
    from: '',
    configError: () => null,
    async send(message) {
      console.info(`[email:console] to=${maskEmail(message.to)} subject="${message.subject}"`);
      return null;
    },
  };
}

/**
 * Sin EMAIL_PROVIDER: resend si hay clave (lo que había hasta ahora) y console
 * si no. En producción siempre resend, para que la falta de clave falle claro
 * en vez de parecer que los correos se "envían" a un log.
 */
function resolveProviderName(env: EmailEnv): (typeof PROVIDER_NAMES)[number] {
  const chosen = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (!chosen) return env.RESEND_API_KEY || env.NODE_ENV === 'production' ? 'resend' : 'console';
  if (!(PROVIDER_NAMES as readonly string[]).includes(chosen)) {
    throw new Error(`EMAIL_PROVIDER="${chosen}" no es válido: usa ${PROVIDER_NAMES.join(', ')}`);
  }
  return chosen as (typeof PROVIDER_NAMES)[number];
}

export function createEmailProvider(env: EmailEnv, fetchImpl: typeof fetch = fetch): EmailProvider {
  switch (resolveProviderName(env)) {
    case 'resend': return createResendProvider(env);
    case 'brevo': return createBrevoProvider(env, fetchImpl);
    case 'console': return createConsoleProvider();
  }
}
