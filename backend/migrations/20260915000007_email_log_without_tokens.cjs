'use strict';

/**
 * P1-7 — email_log guardaba en claro los tokens de recuperación e invitación.
 *
 * ── Qué pasaba ──────────────────────────────────────────────────────────────
 *
 * La cola guardaba el cuerpo renderizado de cada correo (html_body, text_body)
 * para poder reintentar, y nunca lo borraba. En la invitación al censo y en la
 * recuperación de contraseña ese cuerpo lleva el enlace con el token en claro.
 * Quien pudiera leer email_log — una copia de seguridad, un DATABASE_URL
 * filtrado, un rol con SELECT — podía fijar la contraseña de cualquier usuario
 * con un enlace vigente (15 minutos la recuperación, 7 días la invitación).
 *
 * Desde este cambio el código ya no guarda el token: esos correos se encolan
 * con template_data (datos no secretos) y el token se genera al enviar. Además,
 * todo cuerpo se vacía cuando el correo llega a un estado final.
 *
 * ── Qué hace esta migración con lo que ya está guardado ─────────────────────
 *
 *   1. Añade template_data.
 *   2. Anula los tokens cuyo texto en claro aparece en algún cuerpo guardado.
 *      password_reset_tokens guarda sha256(token) en hex, que PostgreSQL sabe
 *      calcular, así que se anulan exactamente los expuestos y ninguno más.
 *      Quien tuviera un enlace pendiente tendrá que pedir otro, o el admin
 *      volver a invitarle.
 *   3. Los correos con token que seguían pendientes pasan a 'dead': no se
 *      pueden enviar sin volver a exponer el token, que además el paso 2 ya ha
 *      anulado.
 *   4. Vacía los cuerpos de todas las filas en estado final.
 *
 * El orden importa: el paso 2 lee los cuerpos que el 4 borra.
 *
 * El down solo quita la columna. Los cuerpos borrados no se recuperan, y no
 * deben recuperarse: eran justo el problema.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */

const TOKEN_IN_BODY = `token=([0-9a-f]{64})`;

exports.up = async (pgm) => {
  pgm.sql(`ALTER TABLE email_log ADD COLUMN IF NOT EXISTS template_data TEXT;`);

  pgm.sql(`
    UPDATE password_reset_tokens AS t
       SET used_at = NOW()
      FROM (
        SELECT DISTINCT encode(sha256(convert_to(m[1], 'UTF8')), 'hex') AS token_hash
          FROM email_log AS e,
               LATERAL regexp_matches(
                 COALESCE(e.text_body, '') || ' ' || COALESCE(e.html_body, ''),
                 '${TOKEN_IN_BODY}', 'g'
               ) AS m
      ) AS leaked
     WHERE t.token_hash = leaked.token_hash
       AND t.used_at IS NULL;
  `);

  pgm.sql(`
    UPDATE email_log
       SET status        = 'dead',
           last_error    = 'P1-7: el cuerpo llevaba el token en claro; descartado sin enviar',
           claimed_at    = NULL,
           next_retry_at = NULL
     WHERE status IN ('queued', 'sending')
       AND template_data IS NULL
       AND (COALESCE(text_body, '') || ' ' || COALESCE(html_body, '')) ~ '${TOKEN_IN_BODY}';
  `);

  pgm.sql(`
    UPDATE email_log
       SET html_body = NULL, text_body = NULL
     WHERE status IN ('sent', 'dead', 'skipped')
       AND (html_body IS NOT NULL OR text_body IS NOT NULL);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE email_log DROP COLUMN IF EXISTS template_data;`);
};
