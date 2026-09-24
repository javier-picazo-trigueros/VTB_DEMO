'use strict';

/**
 * Registro de acciones de administración (SCRUM-20).
 *
 * Hasta aquí, ninguna de las rutas de escritura de /admin dejaba traza: no
 * había forma de responder "quién cambió los candidatos de esta elección, y
 * cuándo" ante una impugnación. Lo escribe middleware/adminActionLog.ts al
 * terminar cada petición de escritura.
 *
 * ── Nombre ──────────────────────────────────────────────────────────────────
 *
 * `admin_action_log` y no `admin_audit_log`: en este proyecto "audit" ya es
 * nullifier_audit y GET /admin/audit, que son el registro de votos. Mezclar
 * los dos nombres invita a consultar el que no es.
 *
 * ── Qué se guarda y qué no ──────────────────────────────────────────────────
 *
 * - actor_user_id, sin copiar su email: la cuenta se anonimiza a los 30 días
 *   de darse de baja (services/retention.ts), y una copia aquí se saltaría esa
 *   anonimización. El nombre se resuelve con un JOIN al leer.
 * - La ruta como patrón (`PATCH /admin/elections/:id`) y el id afectado, no el
 *   cuerpo de la petición: los cuerpos llevan contraseñas y censos enteros.
 * - El código de respuesta, también de los intentos fallidos: un 404 sobre la
 *   elección de otra institución es justo lo que interesa ver.
 * - La IP, que es dato personal: por eso la tabla tiene plazo de conservación
 *   (services/retention.ts) y figura en la Política de Privacidad.
 *
 * RLS activado sin políticas, como el resto de tablas (migración 006): VTB no
 * usa la API REST de Supabase, y esta tabla no debe ser legible por ella.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS admin_action_log (
      id             SERIAL PRIMARY KEY,
      actor_user_id  INTEGER NOT NULL,
      actor_role     TEXT NOT NULL,
      actor_domain   TEXT DEFAULT NULL,
      action         TEXT NOT NULL,
      entity_type    TEXT DEFAULT NULL,
      entity_id      TEXT DEFAULT NULL,
      status_code    INTEGER NOT NULL,
      ip             TEXT DEFAULT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_action_log_created
      ON admin_action_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_action_log_entity
      ON admin_action_log (entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_admin_action_log_domain
      ON admin_action_log (actor_domain);

    ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS admin_action_log;`);
};
