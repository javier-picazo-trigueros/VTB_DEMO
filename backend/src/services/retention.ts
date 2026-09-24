/**
 * Plazos de conservación (Política de Privacidad, sección 6):
 *   - Solicitudes de registro rechazadas: 30 días desde que se rechazaron.
 *   - Historial de correos (email_log): 90 días desde que se encolaron.
 *   - Tokens de recuperación/invitación usados o caducados: 24 horas.
 *   - Cuenta de usuario dada de baja: anonimizada a los 30 días de la baja.
 *   - Registro de acciones de administración (admin_action_log): 12 meses.
 *
 * nullifier_audit NO se toca aquí, a propósito: sigue sin plazo de
 * conservación — es un hueco de cumplimiento real, no algo que este fichero
 * resuelva (ver la propia Política de Privacidad, sección 6, y SEGURIDAD.md).
 *
 * Formato de los cortes: 'YYYY-MM-DD HH:MM:SS' en UTC, sin 'T' ni 'Z' — el
 * mismo que usa CURRENT_TIMESTAMP en SQLite y el único que compara bien en
 * los dos motores (ver el comentario ya existente sobre esto en
 * routes/admin/org.ts). Un ISO-8601 con 'T' rompe la comparación en SQLite
 * sin dar ningún error.
 */
import type { DbClient } from '../db/client.js';

const REJECTED_REQUESTS_RETENTION_DAYS = 30;
const EMAIL_LOG_RETENTION_DAYS = 90;
const USED_TOKENS_RETENTION_HOURS = 24;
const DELETED_ACCOUNT_ANONYMIZE_DAYS = 30;
// Guarda IP y quién hizo cada acción (SCRUM-20). Un año cubre el plazo de
// impugnación de cualquier votación de un curso académico. Si se cambia, hay
// que cambiar también la Política de Privacidad, sección 6.
export const ADMIN_ACTION_LOG_RETENTION_DAYS = 365;

function cutoffHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function cutoffDaysAgo(days: number): string {
  return cutoffHoursAgo(days * 24);
}

/** Solicitudes de registro rechazadas hace más de 30 días. */
export async function purgeRejectedRegistrationRequests(db: DbClient): Promise<number> {
  const cutoff = cutoffDaysAgo(REJECTED_REQUESTS_RETENTION_DAYS);
  const res = await db.exec(
    `DELETE FROM registration_requests WHERE status = 'rejected' AND reviewed_at IS NOT NULL AND reviewed_at < ?`,
    [cutoff],
  );
  return res.changes;
}

/** Historial de correos de hace más de 90 días. */
export async function purgeOldEmailLog(db: DbClient): Promise<number> {
  const cutoff = cutoffDaysAgo(EMAIL_LOG_RETENTION_DAYS);
  const res = await db.exec(`DELETE FROM email_log WHERE created_at < ?`, [cutoff]);
  return res.changes;
}

/**
 * Tokens de recuperación/invitación usados o caducados hace más de 24 horas.
 * "Usado" = used_at no nulo; "caducado y nunca usado" = expires_at pasado.
 * Un token todavía válido (sin usar, sin caducar) nunca se toca aquí.
 */
export async function purgeExpiredAuthTokens(db: DbClient): Promise<number> {
  const cutoff = cutoffHoursAgo(USED_TOKENS_RETENTION_HOURS);
  const res = await db.exec(
    `DELETE FROM password_reset_tokens
      WHERE (used_at IS NOT NULL AND used_at < ?)
         OR (used_at IS NULL AND expires_at < ?)`,
    [cutoff, cutoff],
  );
  return res.changes;
}

/**
 * Anonimiza (no borra) las cuentas dadas de baja hace más de 30 días:
 * email, nombre e identificador dejan de ser legibles. No borra la fila —
 * borrarla rompería las claves foráneas de election_voters, nullifier_audit,
 * vote_attempts, refresh_tokens y password_reset_tokens, todas por user_id,
 * no por email — así que la anonimización solo toca columnas, nunca la
 * clave primaria. Idempotente: solo procesa deleted_at antiguos con
 * anonymized_at todavía NULL.
 */
export async function anonymizeDeletedAccounts(db: DbClient): Promise<number> {
  const cutoff = cutoffDaysAgo(DELETED_ACCOUNT_ANONYMIZE_DAYS);
  const candidatos = await db.run<{ id: number }>(
    `SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < ? AND anonymized_at IS NULL`,
    [cutoff],
  );

  let anonimizadas = 0;
  for (const { id } of candidatos) {
    const res = await db.exec(
      `UPDATE users
          SET email = ?, name = 'Usuario eliminado', student_id = ?,
              school = NULL, degree = NULL, year = NULL, study_group = NULL,
              password_hash = ?, anonymized_at = CURRENT_TIMESTAMP
        WHERE id = ? AND anonymized_at IS NULL`,
      [`deleted-${id}@anonimizado.invalid`, `DELETED-${id}`, `anonimizado:${id}:${Date.now()}`, id],
    );
    if (res.changes > 0) anonimizadas++;
  }
  return anonimizadas;
}

/** Registro de acciones de administración de hace más de 12 meses. */
export async function purgeOldAdminActionLog(db: DbClient): Promise<number> {
  const cutoff = cutoffDaysAgo(ADMIN_ACTION_LOG_RETENTION_DAYS);
  const res = await db.exec(`DELETE FROM admin_action_log WHERE created_at < ?`, [cutoff]);
  return res.changes;
}

export interface RetentionSummary {
  rejectedRequestsPurged: number;
  emailLogPurged: number;
  authTokensPurged: number;
  accountsAnonymized: number;
  adminActionLogPurged: number;
}

export async function runRetentionJobs(db: DbClient): Promise<RetentionSummary> {
  return {
    rejectedRequestsPurged: await purgeRejectedRegistrationRequests(db),
    emailLogPurged: await purgeOldEmailLog(db),
    authTokensPurged: await purgeExpiredAuthTokens(db),
    accountsAnonymized: await anonymizeDeletedAccounts(db),
    adminActionLogPurged: await purgeOldAdminActionLog(db),
  };
}
