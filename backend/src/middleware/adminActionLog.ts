/**
 * Registro de acciones de administración (SCRUM-20).
 *
 * Toda petición de escritura (POST, PUT, PATCH, DELETE) bajo /admin y
 * /api/admin deja una fila en admin_action_log con quién, qué, sobre qué, con
 * qué resultado, desde qué IP y cuándo. Antes, ninguna de esas rutas dejaba
 * traza: una impugnación del tipo "¿quién abrió esta votación antes de hora?"
 * no tenía respuesta.
 *
 * ── Por qué al terminar la respuesta, y en un middleware ────────────────────
 *
 * Se escribe en el evento 'finish', cuando ya se sabe el código de respuesta,
 * y se monta una sola vez en app.ts delante de los routers. Ponerlo ruta a
 * ruta era olvidar alguna; aquí, una ruta nueva queda registrada sin hacer
 * nada.
 *
 * Solo se registra si `requireAdmin` confirmó el rol (es quien rellena
 * req.user). Un estudiante que prueba una ruta de admin recibe 401/403 y no
 * genera fila: esto es el registro de lo que hacen los administradores.
 *
 * Los intentos fallidos SÍ se registran. Un 404 de denyIfElectionOutOfScope
 * es un administrador tocando una elección de otra institución, y eso es lo
 * primero que alguien querría ver en este registro.
 *
 * ── Lo que no se guarda ─────────────────────────────────────────────────────
 *
 * El cuerpo de la petición: lleva contraseñas, censos enteros en CSV y datos
 * personales de terceros. Se guarda la ruta como patrón y el id afectado.
 *
 * ── Si falla la escritura ───────────────────────────────────────────────────
 *
 * La respuesta ya se ha enviado, así que no se puede deshacer la acción. Se
 * deja constancia en el log del servidor y se sigue: tumbar el panel porque
 * falla el registro sería peor que perder una fila del registro.
 */
import type { Request, Response, NextFunction } from "express";
import { getDbClient } from "../db/index.js";
import { formatError } from "../utils/errors.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Primer segmento de la ruta tras /admin → tipo de entidad afectada. Lo que no
 * está aquí se guarda sin tipo, pero se guarda: la acción queda igual.
 */
const ENTITY_BY_SEGMENT: Record<string, string> = {
  elections: "election",
  users: "user",
  "org-units": "org_unit",
  "registration-requests": "registration_request",
  "domain-admins": "user",
  domains: "domain",
  "sync-blockchain": "blockchain_sync",
};

/** `/admin/elections/:id/voters` → `elections`; `/api/admin/sync-blockchain` → `sync-blockchain`. */
function firstSegmentAfterAdmin(pattern: string): string | null {
  const parts = pattern.split("/").filter(Boolean);
  const i = parts.indexOf("admin");
  return i >= 0 ? parts[i + 1] ?? null : null;
}

/**
 * Patrón de la ruta que atendió la petición, p. ej. `/admin/elections/:id`.
 * Si ninguna ruta la atendió (404 del router), no hay acción que registrar.
 */
function routePattern(req: Request): string | null {
  const routePath = req.route?.path;
  if (typeof routePath !== "string") return null;
  return `${req.baseUrl}${routePath}`.replace(/\/+$/, "") || "/";
}

export function logAdminAction(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) return next();

  res.on("finish", () => {
    const actor = req.user;
    if (!actor) return;

    const pattern = routePattern(req);
    if (!pattern) return;

    const segment = firstSegmentAfterAdmin(pattern);
    const entityType = (segment && ENTITY_BY_SEGMENT[segment]) ?? null;

    // Las rutas de alta no traen el id en la URL: lo dejan en res.locals al
    // crear (POST /admin/elections, POST /admin/users).
    const rawId = req.params?.id ?? res.locals.auditEntityId;
    const entityId = rawId === undefined || rawId === null ? null : String(rawId);

    getDbClient()
      .exec(
        `INSERT INTO admin_action_log
           (actor_user_id, actor_role, actor_domain, action, entity_type, entity_id, status_code, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actor.userId,
          actor.role,
          actor.adminDomain ?? null,
          `${req.method} ${pattern}`,
          entityType,
          entityId,
          res.statusCode,
          req.ip ?? null,
        ],
      )
      .catch((err) => {
        console.error(
          `[admin_action_log] no se ha podido registrar ${req.method} ${pattern} de user ${actor.userId}:`,
          formatError(err),
        );
      });
  });

  next();
}
