/**
 * Gestión de cuentas: alta, importación de censo, aprobación y baja.
 * Parte de la partición de admin.ts (SCRUM-13) — ver admin/index.ts.
 */
import express, { Request, Response } from "express";
import { getDbClient, withTransaction, type DbClient } from "../../db/index.js";
import { hashPassword } from "../../utils/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { formatError } from "../../utils/errors.js";
import { emailSchema, passwordSchema, firstIssue } from "../../utils/validation.js";
import { sendCensusInvitation } from "../../services/email/index.js";
import {
  upload, isSuperAdmin, getAdminDomain, isSubDomain, createCensusUser, parseCSV,
} from "./shared.js";

const router = express.Router();
const db = getDbClient();

/**
 * Auto-assign a newly created/approved user to all elections whose domain matches.
 *
 * `client` existe para poder llamar a este helper desde dentro de una
 * transacción. Si usara el `db` del módulo, sus INSERT irían por otra conexión
 * del pool en PostgreSQL y quedarían fuera del BEGIN: un ROLLBACK del bloque que
 * lo invoca no los desharía.
 */
async function autoAssignElectionsToUser(
  userId: number,
  emailDomain: string,
  client: DbClient = db,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const elections = await client.run<{ election_id: number }>(
    `SELECT ea.election_id
       FROM election_access ea
       JOIN elections e ON e.id = ea.election_id
      WHERE (ea.email_domain = ? OR ea.email_domain = '*')
        AND e.start_time > ?`,
    [emailDomain, now]
  );
  for (const row of elections) {
    await client.exec(
      "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
      [row.election_id, userId]
    );
  }
}

/**
 * @route GET /admin/users
 */
router.get("/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const approvedFilter = req.query.approved as string;
    const conditions: string[] = ["deleted_at IS NULL"];
    const params: any[] = [];

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      conditions.push("(email LIKE '%@' || ? OR email LIKE '%@%.' || ?)");
      params.push(adminDomain, adminDomain);
      conditions.push("role NOT IN ('superadmin')");
    }

    if (approvedFilter === "true") {
      conditions.push("is_approved = TRUE");
    } else if (approvedFilter === "false") {
      conditions.push("is_approved = FALSE");
    }

    const where = "WHERE " + conditions.join(" AND ");
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const totalCount = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM users ${where}`,
      params
    );

    const users = await db.run<any>(
      `SELECT id, email, name, student_id, role, admin_domain,
              school, degree, year, study_group,
              is_approved, approved_at, is_eligible, created_at
       FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      users: users || [],
      pagination: {
        page,
        limit,
        total: totalCount?.count || 0,
        totalPages: Math.ceil((totalCount?.count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Error listando usuarios:", error);
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});
/**
 * @route POST /admin/users
 */
router.post("/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, student_id, role = "student", admin_domain = null } = req.body;

    if (!req.body.email || !req.body.password || !name || !student_id) {
      res.status(400).json({ error: "Faltan campos requeridos" });
      return;
    }

    // Misma política que el resto de altas (SCRUM-21): hasta aquí esta ruta
    // aceptaba cualquier contraseña, también de un carácter, y guardaba el
    // email con las mayúsculas que trajera — una cuenta que luego no podía
    // entrar, porque el login busca en minúsculas.
    const emailCheck = emailSchema.safeParse(req.body.email);
    const passwordCheck = passwordSchema.safeParse(req.body.password);
    if (!emailCheck.success || !passwordCheck.success) {
      const issue = !emailCheck.success ? emailCheck.error : passwordCheck.error!;
      res.status(400).json({ error: firstIssue(issue) });
      return;
    }
    const email = emailCheck.data;
    const password = passwordCheck.data;

    let finalAdminDomain = admin_domain;

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      if (!adminDomain) {
        res.status(403).json({ error: "No tienes permisos para gestionar usuarios sin un dominio asignado" });
        return;
      }
      const emailDomain = email.split("@")[1];
      if (!emailDomain || !isSubDomain(emailDomain, adminDomain)) {
        res.status(403).json({
          error: `Solo puedes crear usuarios del dominio @${adminDomain} y sus subdominios`,
        });
        return;
      }
      if (role === "superadmin") {
        res.status(403).json({ error: "No tienes permisos para crear superadministradores" });
        return;
      }
      if (role === "admin") {
        if (admin_domain !== undefined && (admin_domain === null || !isSubDomain(admin_domain, adminDomain))) {
          res.status(403).json({
            error: `Solo puedes crear administradores para tu propio dominio @${adminDomain}`,
          });
          return;
        }
        finalAdminDomain = admin_domain || adminDomain;
      } else {
        finalAdminDomain = null;
      }
    } else {
      if (role !== "admin") {
        finalAdminDomain = null;
      }
    }

    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    const passwordHash = await hashPassword(password);

    // Crear la cuenta y meterla en los censos que le corresponden por dominio
    // es una sola operación: un usuario creado pero fuera de sus elecciones no
    // puede votar y nada en la interfaz lo delata.
    const userId = await withTransaction(async (tx) => {
      const inserted = await tx.exec(
        `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain,
                           is_approved, approved_by, approved_at, is_eligible)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, CURRENT_TIMESTAMP, TRUE)`,
        [email, passwordHash, name, student_id, role, finalAdminDomain, req.user!.userId]
      );

      const emailDomain = email.split('@')[1];
      if (emailDomain) {
        await autoAssignElectionsToUser(inserted.lastID, emailDomain, tx);
      }
      return inserted.lastID;
    });

    res.json({
      success: true,
      userId,
      message: `Usuario ${name} creado y aprobado exitosamente`,
    });
  } catch (error) {
    console.error("Error creando usuario:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

/**
 * @route POST /admin/users/import
 * CSV import: bulk user creation
 */
router.post("/users/import", requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se ha adjuntado ningún archivo" });
      return;
    }

    const rows = parseCSV(req.file.buffer);

    // ── FASE 1: validar el fichero entero sin escribir ──────────────────────
    // Misma estructura que import-voters: o entra el CSV completo, o no entra
    // nada. Antes el bucle validaba y escribía a la vez, así que un fallo a
    // mitad dejaba media plantilla creada.
    const adminDomain = getAdminDomain(req);
    if (!isSuperAdmin(req) && !adminDomain) {
      res.status(403).json({
        success: false,
        error: "No tienes permisos para importar usuarios sin un dominio asignado",
      });
      return;
    }

    const errors: string[] = [];
    const plan: Array<{
      email: string; full_name: string; student_id: string; role: string; exists: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const [i, row] of rows.entries()) {
      const linea = i + 2;
      const email = row.email?.trim();
      const full_name = row.full_name?.trim() || row.name?.trim();
      const student_id = row.student_id?.trim();
      const role = row.role?.trim() || 'student';

      if (!email || !full_name || !student_id) {
        errors.push(`Línea ${linea}: faltan email, full_name o student_id`);
        continue;
      }

      const normalized = email.toLowerCase();
      if (seen.has(normalized)) {
        errors.push(`Línea ${linea}: ${email} está repetido en el fichero`);
        continue;
      }
      seen.add(normalized);

      if (!isSuperAdmin(req)) {
        if (role === 'superadmin') {
          errors.push(`Línea ${linea}: No tienes permisos para crear superadministradores`);
          continue;
        }
        if (role === 'admin') {
          errors.push(`Línea ${linea}: La importación masiva de censo no permite rol admin`);
          continue;
        }
        const emailDomain = email.split('@')[1];
        if (!emailDomain || !isSubDomain(emailDomain, adminDomain!)) {
          errors.push(`Línea ${linea}: ${email} no pertenece al dominio @${adminDomain}`);
          continue;
        }
      }

      const existing = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
      plan.push({ email, full_name, student_id, role, exists: existing !== undefined });
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'El fichero tiene errores. No se ha importado nada.',
        errors,
        totalRows: rows.length,
      });
      return;
    }

    // ── FASE 2: escribir todo en una transacción ────────────────────────────
    //
    // Las invitaciones se acumulan en memoria y se envían en la fase 3, ya con
    // el commit hecho: mismo criterio que import-voters. Ver createCensusUser().
    const wlDomain = adminDomain || '*';
    const institutionName = adminDomain ?? 'tu institución';
    const pendingInvites: Array<{ to: string; userId: number; name: string }> = [];
    let created = 0;
    let skipped = 0;

    await withTransaction(async (tx) => {
      for (const entry of plan) {
        // El whitelist se rellena siempre, también para quien ya tiene cuenta:
        // sirve para auto-aprobar futuras solicitudes de registro.
        await tx.exec(
          `INSERT OR IGNORE INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)`,
          [entry.email.toLowerCase(), entry.full_name, entry.student_id, wlDomain]
        );

        if (entry.exists) {
          skipped++;
          continue;
        }

        const { userId, invite } = await createCensusUser(tx, entry, req.user!.userId);
        pendingInvites.push(invite);

        const emailDomain = entry.email.split('@')[1];
        if (emailDomain) await autoAssignElectionsToUser(userId, emailDomain, tx);
        created++;
      }
    });

    // ── FASE 3: invitar, ya con la transacción confirmada ───────────────────
    //
    // Sin esto, las cuentas nacían con una contraseña temporal aleatoria que no
    // conocía nadie y sin forma de activarlas: 800 altas y ni un correo.
    //
    // No se nombra ninguna elección: esta ruta importa el censo de la
    // institución, y autoAssignElectionsToUser puede haber dejado a la persona
    // en ninguna elección o en quince. La plantilla tiene una variante para eso.
    for (const invite of pendingInvites) {
      sendCensusInvitation({ ...invite, institutionName });
    }

    res.json({
      success: true,
      results: { created, skipped, invited: pendingInvites.length, errors: [] },
    });
  } catch (error) {
    console.error("Error importing users CSV:", formatError(error));
    res.status(500).json({ error: "Error al importar usuarios. No se ha importado nada." });
  }
});

/**
 * @route PATCH /admin/users/:id/approval
 */
router.patch("/users/:id/approval", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved, reason } = req.body;
    void reason; // no se usa en esta ruta; se mantiene por fidelidad a la original (SCRUM-13)

    if (typeof approved !== "boolean") {
      res.status(400).json({ error: "El campo 'approved' debe ser true o false" });
      return;
    }

    const targetUser = await db.get<{
      id: number;
      email: string;
      role: string;
    }>("SELECT id, email, role FROM users WHERE id = ?", [id]);

    if (!targetUser) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      if (!adminDomain) {
        res.status(403).json({ error: "No tienes permisos para gestionar usuarios sin un dominio asignado" });
        return;
      }
      const userDomain = targetUser.email.split("@")[1];
      if (!userDomain || !isSubDomain(userDomain, adminDomain)) {
        res.status(403).json({ error: "No tienes permisos para gestionar usuarios de otro dominio" });
        return;
      }
      if (targetUser.role === "superadmin" || targetUser.role === "admin") {
        res.status(403).json({ error: "No tienes permisos para gestionar administradores" });
        return;
      }
    }

    if (approved) {
      await db.exec(
        `UPDATE users SET is_approved = TRUE, approved_by = ?, approved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user!.userId, id]
      );
      res.json({ success: true, message: "Cuenta aprobada correctamente" });
    } else {
      await withTransaction(async (tx) => {
        await tx.exec(
          `UPDATE users SET is_approved = FALSE, approved_by = NULL, approved_at = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [id]
        );
        await tx.exec(
          `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?`,
          [id]
        );
      });
      res.json({ success: true, message: "Aprobación revocada correctamente" });
    }
  } catch (error) {
    console.error("Error al cambiar aprobación de usuario:", error);
    res.status(500).json({ error: "Error al actualizar aprobación" });
  }
});

/**
 * @route DELETE /admin/users/:id
 */
router.delete("/users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db.get<{ id: number; email: string; role: string }>(
      "SELECT id, email, role FROM users WHERE id = ?",
      [id]
    );

    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      if (!adminDomain) {
        res.status(403).json({ error: "No tienes permisos para eliminar usuarios sin un dominio asignado" });
        return;
      }
      const userDomain = user.email.split("@")[1];
      if (!userDomain || !isSubDomain(userDomain, adminDomain)) {
        res.status(403).json({ error: "No tienes permisos para eliminar usuarios de otro dominio" });
        return;
      }
      if (user.role === "superadmin" || user.role === "admin") {
        res.status(403).json({ error: "No tienes permisos para eliminar administradores" });
        return;
      }
    }

    if (parseInt(id as string) === req.user!.userId) {
      res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
      return;
    }

    // Borrado lógico: preserva FKs (election_voters, nullifier_audit) y permite auditoría.
    // Además se revoca cualquier sesión/refresh token activo.
    await withTransaction(async (tx) => {
      await tx.exec(
        "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id],
      );
      await tx.exec(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?",
        [id],
      );
    });

    res.json({ success: true, message: "Usuario eliminado" });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

export default router;
