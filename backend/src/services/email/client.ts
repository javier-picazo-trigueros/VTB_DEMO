import { Resend } from 'resend';

// `onboarding@resend.dev` es el dominio de demo de Resend — no necesita verificación
// pero solo funciona para la primera dirección email verificada de tu cuenta.
// En producción DEBES definir RESEND_FROM con un dominio verificado tuyo.
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && !process.env.RESEND_FROM) {
  console.error(
    '❌ RESEND_FROM no está definida en producción. ' +
    'Todos los envíos fallarán. Define RESEND_FROM=<nombre> <email@tu-dominio.com> en el entorno.',
  );
}

export const RESEND_FROM =
  process.env.RESEND_FROM ?? 'VoteTrustBlock <onboarding@resend.dev>';

const apiKey = process.env.RESEND_API_KEY;

// Singleton null cuando no hay clave — la cola registra sin enviar.
export const resendClient: Resend | null = apiKey ? new Resend(apiKey) : null;

if (!apiKey) {
  console.warn(
    '⚠  RESEND_API_KEY no configurada — los emails se omitirán (solo log en consola).',
  );
}

export interface RawPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Envío atómico. Lanza si Resend devuelve error.
 * Devuelve el Resend message-id, o null si no hay clave configurada.
 */
export async function sendRaw(payload: RawPayload): Promise<string | null> {
  if (!resendClient) {
    console.info(`[email:skipped] to=${payload.to} subject="${payload.subject}"`);
    return null;
  }
  const { data, error } = await resendClient.emails.send({
    from: RESEND_FROM,
    to:   payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
  if (error) throw new Error((error as any).message ?? JSON.stringify(error));
  return data?.id ?? null;
}
