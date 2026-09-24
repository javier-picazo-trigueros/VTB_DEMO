/**
 * Helpers compartidos entre los routers de /admin (SCRUM-13).
 *
 * Solo lo que de verdad usa más de un fichero. Lo que un único router
 * necesita vive en ese router, no aquí — este fichero no es un cajón de
 * sastre, es la lista exacta de lo que rompería si viviera duplicado en dos
 * sitios y uno se actualizara sin el otro.
 */
import crypto from "crypto";
import multer from "multer";
import { Request, Response } from "express";
import { parse as parseCSVLib } from "csv-parse/sync";
import { hashPassword } from "../../utils/auth.js";
import { getDbClient, type DbClient } from "../../db/index.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ── Alcance por dominio ──────────────────────────────────────────────────────

export const isSuperAdmin = (req: Request) => req.user?.role === 'superadmin';
export const getAdminDomain = (req: Request): string | null => req.user?.adminDomain || null;

export function isSubDomain(domain: string, parentDomain: string): boolean {
  return domain === parentDomain || domain.endsWith('.' + parentDomain);
}

/**
 * ¿Está esta elección dentro del alcance del administrador que pregunta?
 *
 * Los listados ya filtraban por dominio, pero las rutas que operan sobre
 * `:id` no comprobaban nada: bastaba acertar el id — un entero correlativo, y
 * además visible sin autenticar en `/elections/blockchain-sync-status` — para
 * editar, abrir, cerrar o repoblar el censo de la elección de otra institución.
 *
 * La condición es EXACTAMENTE la del listado de `admin/elections.ts`, para que
 * lo que un administrador puede modificar coincida con lo que puede ver. Un
 * `email_domain` de '*' no entra, igual que tampoco aparece en su listado.
 *
 * Un admin sin `admin_domain` no alcanza ninguna elección, que es lo que ya le
 * devolvía el listado: una lista vacía.
 */
export async function isElectionInScope(req: Request, electionId: unknown): Promise<boolean> {
  return isElectionInScopeFor(req.user?.role, getAdminDomain(req), electionId);
}

/**
 * La misma comprobación, para quien no pasa por requireAdmin: la usa
 * GET /elections/:id/results (SCRUM-16), que es pública y solo enseña el
 * recuento en vivo al administrador de esa elección. Una sola condición para
 * las dos cosas: lo que un administrador puede modificar es lo que puede ver.
 */
export async function isElectionInScopeFor(
  role: string | undefined | null,
  adminDomain: string | null,
  electionId: unknown,
): Promise<boolean> {
  if (role === "superadmin") return true;
  if (role !== "admin" || !adminDomain) return false;

  const row = await getDbClient().get<{ election_id: number }>(
    `SELECT election_id FROM election_access
      WHERE election_id = ? AND (email_domain = ? OR email_domain LIKE '%.' || ?)
      LIMIT 1`,
    [electionId, adminDomain, adminDomain],
  );
  return Boolean(row);
}

/**
 * Corta la petición si la elección no es suya. Devuelve true si ya ha respondido.
 *
 * Se responde 404 y no 403 a propósito: un 403 confirmaría que esa elección
 * existe, y con ids correlativos eso es un inventario de las elecciones de las
 * demás instituciones. Desde fuera de tu dominio, no existe.
 *
 * Uso:  if (await denyIfElectionOutOfScope(req, res, id)) return;
 */
export async function denyIfElectionOutOfScope(
  req: Request,
  res: Response,
  electionId: unknown,
): Promise<boolean> {
  if (await isElectionInScope(req, electionId)) return false;
  res.status(404).json({ error: "Elección no encontrada" });
  return true;
}

/**
 * Alta de una persona del censo, con la contraseña temporal que nadie conoce.
 *
 * Existe porque las dos rutas de importación (`/users/import` y
 * `/elections/:id/import-voters`) creaban la cuenta con el mismo bloque copiado,
 * y solo una de las dos enviaba después la invitación — así que durante meses
 * `/users/import` creó cuentas a las que era imposible entrar (SCRUM-11).
 *
 * Devuelve los datos de la invitación en vez de encolarla: quien llama la
 * acumula y la envía DESPUÉS del commit. Encolar aquí dentro significaría que un
 * ROLLBACK deja correos con enlaces a cuentas que ya no existen, y un correo no
 * se puede deshacer.
 */
export async function createCensusUser(
  tx: DbClient,
  entry: { email: string; full_name: string; student_id: string; role?: string },
  approvedBy: number,
): Promise<{ userId: number; invite: { to: string; userId: number; name: string } }> {
  const tempPassword = crypto.randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);
  const inserted = await tx.exec(
    `INSERT INTO users (email, password_hash, name, student_id, role,
                       is_approved, approved_by, approved_at, is_eligible, must_change_password)
     VALUES (?, ?, ?, ?, ?, TRUE, ?, CURRENT_TIMESTAMP, TRUE, TRUE)`,
    [entry.email, passwordHash, entry.full_name, entry.student_id, entry.role ?? 'student', approvedBy],
  );
  const userId = inserted.lastID;
  return { userId, invite: { to: entry.email, userId, name: entry.full_name } };
}

/**
 * Parse CSV buffer into rows.
 *
 * S16 fix: usa csv-parse (RFC 4180) en lugar de split(','), de forma que
 * campos entre comillas que contienen comas (e.g. "García, Juan") se
 * parsean correctamente sin corromper los datos del censo.
 */
export function parseCSV(buffer: Buffer): Record<string, string>[] {
  try {
    const records = parseCSVLib(buffer, {
      columns: (headers: string[]) => headers.map(h => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,          // ignora el BOM de Excel en UTF-8
      relaxQuotes: true,  // tolera comillas no cerradas
      cast: false,        // todos los valores como string
    }) as Record<string, string>[];
    return records;
  } catch (err) {
    console.error('[parseCSV] error al parsear CSV:', err);
    return [];
  }
}
