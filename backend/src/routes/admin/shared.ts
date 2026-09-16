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
import { Request } from "express";
import { parse as parseCSVLib } from "csv-parse/sync";
import { hashPassword } from "../../utils/auth.js";
import type { DbClient } from "../../db/index.js";

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
