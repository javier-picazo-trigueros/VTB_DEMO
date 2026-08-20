/**
 * Cola de emails fire-and-forget con reintentos y registro en BD.
 *
 * Diseño:
 * - enqueue() retorna inmediatamente (no bloquea la petición HTTP).
 * - Hasta 3 intentos con backoff exponencial: 10s → 60s → 300s.
 * - Cada intento actualiza email_log con el estado y el error, si lo hay.
 * - Si no hay RESEND_API_KEY, omite el envío y anota 'skipped' en BD.
 */

import { sendRaw, resendClient } from './client.js';
import type { RawPayload }       from './client.js';

// Import diferido para evitar ciclos en el arranque
let _db: import('../../db/client.js').DbClient | null = null;
async function getDb(): Promise<import('../../db/client.js').DbClient> {
  if (_db) return _db;
  const { getDbClient } = await import('../../db/index.js');
  _db = getDbClient();
  return _db;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS   = [10_000, 60_000, 300_000] as const; // 10s, 1min, 5min

export interface QueuePayload extends RawPayload {
  template: string; // nombre del template para el log
}

// ── Helpers de log ────────────────────────────────────────────────────────────

async function insertLog(p: QueuePayload): Promise<number | undefined> {
  try {
    const db  = await getDb();
    const res = await db.exec(
      `INSERT INTO email_log
         (recipient, template_name, subject, html_body, text_body, status, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, CURRENT_TIMESTAMP)`,
      [p.to, p.template, p.subject, p.html, p.text],
    );
    return res.lastID || undefined;
  } catch {
    return undefined;
  }
}

async function markSent(logId: number, resendId: string | null): Promise<void> {
  try {
    const db = await getDb();
    await db.exec(
      `UPDATE email_log
          SET status = 'sent', resend_id = ?, sent_at = CURRENT_TIMESTAMP,
              attempts = attempts + 1, last_error = NULL
        WHERE id = ?`,
      [resendId, logId],
    );
  } catch { /* log non-critical */ }
}

async function markFailed(logId: number, error: string): Promise<void> {
  try {
    const db = await getDb();
    await db.exec(
      `UPDATE email_log
          SET status = 'failed', attempts = attempts + 1, last_error = ?
        WHERE id = ?`,
      [error, logId],
    );
  } catch { /* log non-critical */ }
}

async function markSkipped(logId: number): Promise<void> {
  try {
    const db = await getDb();
    await db.exec(
      `UPDATE email_log SET status = 'skipped' WHERE id = ?`,
      [logId],
    );
  } catch { /* log non-critical */ }
}

// ── Lógica de envío con reintentos ────────────────────────────────────────────

async function trySend(
  payload: QueuePayload,
  logId:   number | undefined,
  attempt: number,
): Promise<void> {
  if (!resendClient) {
    // Sin clave configurada: anotar y salir
    if (logId !== undefined) await markSkipped(logId);
    return;
  }
  try {
    const resendId = await sendRaw(payload);
    if (logId !== undefined) await markSent(logId, resendId);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (logId !== undefined) await markFailed(logId, msg);

    if (attempt < MAX_ATTEMPTS - 1) {
      const delay = BACKOFF_MS[attempt] ?? 300_000;
      console.warn(
        `[email] intento ${attempt + 1}/${MAX_ATTEMPTS} falló para ${payload.to} — reintento en ${delay / 1000}s: ${msg}`,
      );
      setTimeout(() => trySend(payload, logId, attempt + 1), delay);
    } else {
      console.error(
        `[email] FALLO DEFINITIVO tras ${MAX_ATTEMPTS} intentos para ${payload.to}: ${msg}`,
      );
    }
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Encola un email para envío en segundo plano.
 * Nunca lanza: los errores quedan en email_log y en la consola.
 */
export function enqueue(payload: QueuePayload): void {
  insertLog(payload)
    .then(logId => trySend(payload, logId, 0))
    .catch(err => {
      console.error('[email:queue] error inesperado:', err);
      trySend(payload, undefined, 0);
    });
}

// ── Worker de reintento (dead-letter recovery) ────────────────────────────────

/**
 * Lee de email_log los mensajes en estado 'queued' o 'failed' con menos de 3
 * intentos y cuerpo almacenado, y los reintenta.
 *
 * Llamar desde un setInterval periódico para sobrevivir a reinicios del servidor.
 * Los emails encolaros en memoria por `enqueue()` y no enviados antes del reinicio
 * quedan en 'queued' con el cuerpo guardado — este worker los recupera.
 */
export async function retryPendingEmails(): Promise<void> {
  if (!resendClient) return; // sin clave API, nada que hacer

  let db: import('../../db/client.js').DbClient;
  try {
    db = await getDb();
  } catch {
    return;
  }

  const rows = await db.run<{
    id: number;
    recipient: string;
    subject: string;
    html_body: string | null;
    text_body: string | null;
  }>(
    `SELECT id, recipient, subject, html_body, text_body
       FROM email_log
      WHERE status IN ('queued', 'failed')
        AND attempts < 3
        AND html_body IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 50`,
  ).catch(() => [] as any[]);

  for (const row of rows) {
    if (!row.html_body || !row.text_body) continue;

    try {
      const resendId = await sendRaw({
        to:      row.recipient,
        subject: row.subject,
        html:    row.html_body,
        text:    row.text_body,
      });
      await db.exec(
        `UPDATE email_log
            SET status = 'sent', resend_id = ?, sent_at = CURRENT_TIMESTAMP,
                attempts = attempts + 1, last_error = NULL
          WHERE id = ?`,
        [resendId, row.id],
      ).catch(() => {});
      console.info(`[email:retry] reenviado → ${row.recipient}`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      await db.exec(
        `UPDATE email_log
            SET status = 'failed', attempts = attempts + 1, last_error = ?
          WHERE id = ?`,
        [msg, row.id],
      ).catch(() => {});
      console.warn(`[email:retry] falló para ${row.recipient}: ${msg}`);
    }
  }
}
