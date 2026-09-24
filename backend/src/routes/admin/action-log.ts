/**
 * Consulta del registro de acciones de administración (SCRUM-20).
 *
 * Lo escribe middleware/adminActionLog.ts. La ruta es /admin/action-log y no
 * /admin/audit, que ya existe y es el registro de votos (nullifier_audit).
 *
 * ── Quién ve qué ────────────────────────────────────────────────────────────
 *
 * - Superadministrador: todo, con IP. Es quien tiene que poder reconstruir
 *   quién hizo qué en una elección (criterio de aceptación).
 * - Administrador de dominio: las acciones de los administradores de su
 *   dominio y subdominios, MÁS cualquier acción sobre una elección de su
 *   ámbito, la haga quien la haga — si un superadministrador toca su
 *   elección, lo ve. El ámbito de elección es la misma condición que
 *   isElectionInScope (admin/shared.ts). La IP no se le muestra: es un dato
 *   personal de otro administrador que no necesita para saber qué pasó.
 * - Administrador sin dominio: nada, igual que el resto del panel.
 */
import express, { Request, Response } from "express";
import { z } from "zod";
import { getDbClient } from "../../db/index.js";
import { requireAdmin } from "../../middleware/auth.js";
import { formatError } from "../../utils/errors.js";
import { isSuperAdmin, getAdminDomain } from "./shared.js";

const router = express.Router();
const db = getDbClient();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(40).optional(),
});

/** SQLite devuelve 'YYYY-MM-DD HH:MM:SS' en UTC; PostgreSQL, un Date. */
function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

router.get("/action-log", requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetros de consulta no válidos" });
    return;
  }
  const { page, pageSize, entityType, entityId } = parsed.data;
  const superadmin = isSuperAdmin(req);
  const adminDomain = getAdminDomain(req);

  if (!superadmin && !adminDomain) {
    res.json({ entries: [], total: 0, page, pageSize });
    return;
  }

  const where: string[] = [];
  const params: unknown[] = [];

  if (!superadmin) {
    where.push(`(
      l.actor_domain = ? OR l.actor_domain LIKE '%.' || ?
      OR (l.entity_type = 'election' AND l.entity_id IN (
            SELECT CAST(ea.election_id AS TEXT) FROM election_access ea
             WHERE ea.email_domain = ? OR ea.email_domain LIKE '%.' || ?))
    )`);
    params.push(adminDomain, adminDomain, adminDomain, adminDomain);
  }
  if (entityType) {
    where.push("l.entity_type = ?");
    params.push(entityType);
  }
  if (entityId) {
    where.push("l.entity_id = ?");
    params.push(entityId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const totalRow = await db.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM admin_action_log l ${whereSql}`,
      params,
    );
    const rows = await db.run<{
      id: number;
      actor_user_id: number;
      actor_role: string;
      actor_domain: string | null;
      actor_name: string | null;
      actor_email: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      status_code: number;
      ip: string | null;
      created_at: string | Date;
    }>(
      `SELECT l.id, l.actor_user_id, l.actor_role, l.actor_domain,
              u.name AS actor_name, u.email AS actor_email,
              l.action, l.entity_type, l.entity_id, l.status_code, l.ip, l.created_at
         FROM admin_action_log l
         LEFT JOIN users u ON u.id = l.actor_user_id
         ${whereSql}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        actor: {
          id: r.actor_user_id,
          name: r.actor_name,
          email: r.actor_email,
          role: r.actor_role,
          domain: r.actor_domain,
        },
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        statusCode: Number(r.status_code),
        succeeded: Number(r.status_code) < 400,
        ...(superadmin ? { ip: r.ip } : {}),
        createdAt: toIso(r.created_at),
      })),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error leyendo admin_action_log:", formatError(error));
    res.status(500).json({ error: "Error al obtener el registro de acciones" });
  }
});

export default router;
