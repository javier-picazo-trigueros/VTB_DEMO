/**
 * Cola de emails con estado persistido en base de datos.
 *
 * ── Por qué se reescribió ────────────────────────────────────────────────────
 *
 * El diseño anterior tenía DOS mecanismos de reintento sin coordinación:
 *
 *   a) en memoria: enqueue() marcaba 'failed' y programaba un setTimeout
 *   b) en BD:      retryPendingEmails() recogía cada 5 min todo lo que
 *                  estuviera en 'queued' o 'failed' con attempts < 3
 *
 * Nada distinguía "hay un reintento programado" de "esto quedó huérfano tras
 * un reinicio", así que el job de 5 minutos reenviaba correos que ya estaban
 * en vuelo o esperando su backoff. Un mismo mensaje podía salir tres veces.
 *
 * ── Diseño actual ───────────────────────────────────────────────────────────
 *
 * Un solo mecanismo. El estado vive en email_log y el reintento se decide con
 * next_retry_at, no con temporizadores en memoria que un reinicio se lleva.
 *
 *   queued  → pendiente; elegible cuando next_retry_at <= ahora
 *   sending → reclamado por un worker (claimed_at marca cuándo)
 *   sent    → entregado (terminal)
 *   dead    → agotados los intentos, o descartado (terminal)
 *   skipped → sin RESEND_API_KEY (terminal)
 *
 * ── Muerte del proceso ──────────────────────────────────────────────────────
 *
 * Los dos casos que importan, y que antes quedaban mal:
 *
 *   1. Muere entre el INSERT y el envío
 *      La fila queda en 'queued' con next_retry_at ya vencido. El siguiente
 *      arranque la recoge en el primer ciclo. No queda huérfana.
 *
 *   2. Muere DESPUÉS de enviar pero antes de marcar 'sent'
 *      La fila queda en 'sending'. reclaimStuck() la devuelve a 'queued' tras
 *      STUCK_MS, así que se reintenta — pero el reintento reutiliza la MISMA
 *      idempotency_key, y Resend deduplica del lado del servidor. El
 *      destinatario no recibe el correo dos veces.
 *
 * Sin la clave de idempotencia el caso 2 no tiene solución local: no se puede
 * saber si la petición llegó a salir. Por eso la clave se genera en el INSERT
 * y se guarda, en lugar de generarse en cada intento.
 *
 * ── Enlaces con token (P1-7) ────────────────────────────────────────────────
 *
 * La invitación al censo y la recuperación de contraseña llevan un enlace con
 * un token de un solo uso. Antes se renderizaban al encolar, y el cuerpo — con
 * el token en claro — se quedaba en email_log para siempre: quien leyera esa
 * tabla (una copia de seguridad, un DATABASE_URL filtrado) podía fijar la
 * contraseña de cualquiera con un enlace vigente.
 *
 * Ahora esos correos se encolan SIN cuerpo, con template_data (datos no
 * secretos), y el token lo emite link-emails.ts justo antes de enviar. Dos
 * consecuencias:
 *
 *   - Cada intento emite un token nuevo y anula el anterior. Como el contenido
 *     cambia, la clave de idempotencia es `<clave>:<intento>`: reutilizar la
 *     misma con otro cuerpo haría que Resend rechazara el reintento. En el
 *     caso 2 de arriba el destinatario recibe entonces dos correos y solo
 *     funciona el último enlace. Es el precio de no guardar el token.
 *   - Una recuperación que no ha salido a los RESET_TTL_MINUTES de pedirse
 *     termina en 'dead' sin enviarse.
 *
 * ── Cuerpos en estado final ─────────────────────────────────────────────────
 *
 * Al llegar a sent, dead o skipped se vacían html_body y text_body, en todos
 * los tipos de correo. El cuerpo solo hace falta para reintentar.
 */

import { sendRaw, resendClient } from './client.js';
import type { RawPayload } from './client.js';
import {
  prepareLinkEmail,
  type LinkTemplate,
  type InvitationLinkData,
  type PasswordResetLinkData,
} from './link-emails.js';
import crypto from 'crypto';

// Import diferido para evitar ciclos en el arranque
let _db: import('../../db/client.js').DbClient | null = null;
async function getDb(): Promise<import('../../db/client.js').DbClient> {
  if (_db) return _db;
  const { getDbClient } = await import('../../db/index.js');
  _db = getDbClient();
  return _db;
}

/** Intentos antes de darse por vencido. */
const MAX_ATTEMPTS = 5;

/** Espera antes del intento n (índice = attempts ya realizados). */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;

/** Una fila en 'sending' más de esto se considera abandonada por un proceso muerto. */
const STUCK_MS = 10 * 60 * 1000;

/** Máximo de envíos por invocación del worker. */
const BATCH_MAX = 100;

/** Se añade a cada UPDATE que lleva una fila a un estado final. */
const CLEAR_BODIES = 'html_body = NULL, text_body = NULL';

/**
 * Pausa entre envíos. El plan gratuito de Resend limita a ~2 peticiones/s;
 * sin esto, una notificación masiva de 1.000 votantes disparaba 1.000
 * llamadas en paralelo y casi todas volvían 429.
 */
const SEND_INTERVAL_MS = Number.parseInt(process.env.EMAIL_SEND_INTERVAL_MS ?? '', 10) || 250;

/**
 * Serializa los ciclos del worker dentro de este proceso.
 *
 * No es un simple flag "ya está corriendo, sal": con eso, una llamada hecha
 * mientras otra estaba en vuelo se perdía en silencio y la fila recién
 * insertada esperaba hasta el siguiente tick del job. Encadenando, cada
 * llamada garantiza un ciclo completo después del actual, y `await` significa
 * de verdad "la cola se ha procesado".
 */
let chain: Promise<void> = Promise.resolve();

export interface QueuePayload extends RawPayload {
  template: string;
}

/** Correo con enlace de token: se encola sin cuerpo (ver cabecera, P1-7). */
export type LinkQueuePayload =
  | { template: 'invitation'; to: string; subject: string; data: InvitationLinkData }
  | { template: 'password_reset'; to: string; subject: string; data: PasswordResetLinkData };

function nowIso(): string {
  return new Date().toISOString();
}

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Encola un email ya renderizado. Nunca lanza y nunca bloquea la petición HTTP.
 * El envío lo hace el worker, que se despierta al final de esta función.
 *
 * No usar para correos que lleven un token: el cuerpo se guarda en email_log
 * hasta que el correo sale. Para eso está enqueueLinkEmail().
 */
export function enqueue(payload: QueuePayload): void {
  schedule(insertQueued({
    to: payload.to,
    template: payload.template,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    templateData: null,
  }));
}

/**
 * Encola un correo con enlace de un solo uso. Solo se guardan los datos para
 * renderizarlo; el token se genera al enviar.
 */
export function enqueueLinkEmail(payload: LinkQueuePayload): void {
  const template: LinkTemplate = payload.template;
  schedule(insertQueued({
    to: payload.to,
    template,
    subject: payload.subject,
    html: null,
    text: null,
    templateData: JSON.stringify(payload.data),
  }));
}

function schedule(inserted: Promise<void>): void {
  inserted
    .then(() => {
      // Arranca el worker sin esperarlo: la petición HTTP ya puede responder.
      void processEmailQueue().catch((err) =>
        console.error('[email:queue] worker error:', err),
      );
    })
    .catch((err) => {
      console.error('[email:queue] no se pudo encolar:', err);
    });
}

/**
 * Procesa la cola: recupera filas abandonadas, reclama las pendientes y las
 * envía. Idempotente y seguro de llamar en cualquier momento — si ya hay un
 * bucle en marcha, sale inmediatamente.
 *
 * Llamado desde enqueue() y desde el job periódico de index.ts.
 */
export function processEmailQueue(): Promise<void> {
  chain = chain
    .then(() => runOnce())
    .catch((err) => {
      console.error('[email:queue] ciclo fallido:', err);
    });
  return chain;
}

async function runOnce(): Promise<void> {
  await reclaimStuck();

  let processed = 0;
  while (processed < BATCH_MAX) {
    const row = await claimNext();
    if (!row) break;

    // La pausa va ANTES del siguiente envío, no después del anterior: así el
    // ciclo no se queda 250 ms retenido tras despachar el último mensaje.
    if (processed > 0) await sleep(SEND_INTERVAL_MS);

    await attemptSend(row);
    processed += 1;
  }
}

/**
 * Nombre anterior, conservado para no romper llamadas existentes.
 * @deprecated usa processEmailQueue()
 */
export const retryPendingEmails = processEmailQueue;

// ── Interno ───────────────────────────────────────────────────────────────────

interface QueueRow {
  id: number;
  recipient: string;
  template_name: string;
  subject: string;
  html_body: string | null;
  text_body: string | null;
  template_data: string | null;
  attempts: number;
  idempotency_key: string | null;
}

async function insertQueued(p: {
  to: string;
  template: string;
  subject: string;
  html: string | null;
  text: string | null;
  templateData: string | null;
}): Promise<void> {
  const db = await getDb();
  // La clave se fija AQUÍ, no en cada intento: es lo que permite que un
  // reintento tras un crash no duplique el envío en Resend.
  const idempotencyKey = crypto.randomUUID();
  await db.exec(
    `INSERT INTO email_log
       (recipient, template_name, subject, html_body, text_body, template_data,
        status, attempts, next_retry_at, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, CURRENT_TIMESTAMP)`,
    [p.to, p.template, p.subject, p.html, p.text, p.templateData, nowIso(), idempotencyKey],
  );
}

/**
 * Devuelve filas 'sending' abandonadas al estado 'queued'.
 * Este es el mecanismo que impide que un reinicio deje correos colgados.
 */
async function reclaimStuck(): Promise<void> {
  const db = await getDb();
  const res = await db.exec(
    `UPDATE email_log
        SET status = 'queued', next_retry_at = ?
      WHERE status = 'sending' AND claimed_at < ?`,
    [nowIso(), new Date(Date.now() - STUCK_MS).toISOString()],
  ).catch(() => ({ changes: 0, lastID: 0 }));

  if (res.changes > 0) {
    console.warn(`[email:queue] ${res.changes} envío(s) abandonado(s) recuperado(s) tras un reinicio`);
  }
}

/**
 * Reclama una fila de forma atómica.
 *
 * El UPDATE lleva `AND status = 'queued'` en el WHERE: si dos workers compiten
 * por la misma fila, solo uno obtiene changes === 1. El otro ve 0 y sigue.
 */
async function claimNext(): Promise<QueueRow | null> {
  const db = await getDb();

  // Enviable = tiene cuerpo (correo normal) o datos para renderizarlo (enlace).
  const candidates = await db.run<{ id: number }>(
    `SELECT id FROM email_log
      WHERE status = 'queued'
        AND (html_body IS NOT NULL OR template_data IS NOT NULL)
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT 10`,
    [nowIso()],
  ).catch(() => [] as { id: number }[]);

  for (const candidate of candidates) {
    const claim = await db.exec(
      `UPDATE email_log
          SET status = 'sending', attempts = attempts + 1, claimed_at = ?
        WHERE id = ? AND status = 'queued'`,
      [nowIso(), candidate.id],
    ).catch(() => ({ changes: 0, lastID: 0 }));

    if (claim.changes !== 1) continue; // otro worker se la llevó

    const row = await db.get<QueueRow>(
      `SELECT id, recipient, template_name, subject, html_body, text_body, template_data,
              attempts, idempotency_key
         FROM email_log WHERE id = ?`,
      [candidate.id],
    );
    if (row) return row;
  }

  return null;
}

async function attemptSend(row: QueueRow): Promise<void> {
  const db = await getDb();

  if (!resendClient) {
    // Sin clave no se envía, así que tampoco se emite ningún token.
    await db.exec(
      `UPDATE email_log SET status = 'skipped', claimed_at = NULL, ${CLEAR_BODIES} WHERE id = ?`,
      [row.id],
    ).catch(() => {});
    return;
  }

  try {
    let payload: RawPayload;
    let idempotencyKey = row.idempotency_key ?? undefined;

    if (row.template_data !== null) {
      const prepared = await prepareLinkEmail(row.template_name, row.template_data, row.recipient);
      if (prepared.kind === 'discard') {
        await markDead(row.id, prepared.reason);
        console.warn(`[email:queue] ${row.template_name} → ${row.recipient} descartado: ${prepared.reason}`);
        return;
      }
      payload = prepared.payload;
      // Token nuevo en cada intento, así que el contenido cambia: clave nueva.
      if (idempotencyKey) idempotencyKey = `${idempotencyKey}:${row.attempts}`;
    } else {
      payload = {
        to: row.recipient,
        subject: row.subject,
        html: row.html_body ?? '',
        text: row.text_body ?? '',
      };
    }

    const resendId = await sendRaw(payload, idempotencyKey);

    await db.exec(
      `UPDATE email_log
          SET status = 'sent', resend_id = ?, sent_at = CURRENT_TIMESTAMP,
              last_error = NULL, claimed_at = NULL, next_retry_at = NULL,
              ${CLEAR_BODIES}
        WHERE id = ?`,
      [resendId, row.id],
    ).catch(() => {});
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 500);

    if (row.attempts >= MAX_ATTEMPTS) {
      await markDead(row.id, msg);
      console.error(
        `[email:queue] FALLO DEFINITIVO tras ${row.attempts} intentos → ${row.recipient}: ${msg}`,
      );
      return;
    }

    const delay = BACKOFF_MS[row.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    await db.exec(
      `UPDATE email_log
          SET status = 'queued', last_error = ?, claimed_at = NULL, next_retry_at = ?
        WHERE id = ?`,
      [msg, isoIn(delay), row.id],
    ).catch(() => {});
    console.warn(
      `[email:queue] intento ${row.attempts}/${MAX_ATTEMPTS} falló para ${row.recipient}; ` +
      `reintento en ${Math.round(delay / 1000)}s: ${msg}`,
    );
  }
}

async function markDead(id: number, reason: string): Promise<void> {
  const db = await getDb();
  await db.exec(
    `UPDATE email_log
        SET status = 'dead', last_error = ?, claimed_at = NULL, next_retry_at = NULL,
            ${CLEAR_BODIES}
      WHERE id = ?`,
    [reason.slice(0, 500), id],
  ).catch(() => {});
}
