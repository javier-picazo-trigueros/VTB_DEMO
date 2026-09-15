import crypto from "crypto";
import express, { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { parse as parseCSVLib } from "csv-parse/sync";
import { getDbClient, isUniqueViolation, withTransaction, type DbClient } from "../db/index.js";
import { hashPassword, generateToken } from "../utils/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { formatError } from "../utils/errors.js";
import { syncElectionsToBlockchain, isChainConfigured } from "../scripts/syncElections.js";
import { ethers } from "ethers";
import {
  sendCensusInvitation,
  sendElectionOpen,
  sendElectionClose,
} from "../services/email/index.js";

const router = express.Router();
const db = getDbClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const createElectionSchema = z.object({
  name:               z.string().min(1).max(200),
  description:        z.string().max(2000).optional(),
  start_time:         z.number().int().positive(),
  end_time:           z.number().int().positive(),
  banner_color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  target_type:        z.enum(['all', 'domain', 'school', 'degree', 'year', 'group']).optional(),
  target_values:      z.array(z.string().min(1).max(253)).max(100).optional(),
  target_schools:     z.array(z.string().min(1).max(200)).max(100).optional(),
  target_degrees:     z.array(z.string().min(1).max(200)).max(100).optional(),
  target_description: z.string().max(500).optional(),
  voter_role:         z.enum(['student', 'voter', 'teacher', 'staff', 'admin', 'both']).optional(),
  // Los candidatos llegan con la elección y se guardan en la misma transacción.
  candidates:         z.array(z.object({
    name:        z.string().trim().min(1, 'Cada candidato necesita un nombre').max(200),
    description: z.string().trim().max(2000).optional(),
  })).max(100).optional(),
}).refine(d => d.end_time > d.start_time, {
  message: 'end_time debe ser posterior a start_time',
  path: ['end_time'],
});

const importVotersParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id debe ser un entero positivo'),
});



// Helper functions for domain scoping
const isSuperAdmin = (req: Request) => req.user?.role === 'superadmin';
const getAdminDomain = (req: Request): string | null => req.user?.adminDomain || null;

function isSubDomain(domain: string, parentDomain: string): boolean {
  return domain === parentDomain || domain.endsWith('.' + parentDomain);
}

/**
 * Auto-assign all approved users with a given domain to an election.
 *
 * `client` existe para poder llamar a este helper desde dentro de una
 * transacción. Si usara el `db` del módulo, sus INSERT irían por otra conexión
 * del pool en PostgreSQL y quedarían fuera del BEGIN: un ROLLBACK del bloque que
 * lo invoca no los desharía.
 */
async function autoAssignUsersByDomain(
  electionId: number,
  domain: string,
  client: DbClient = db,
): Promise<void> {
  const users = await client.run<{ id: number }>(
    "SELECT id FROM users WHERE email LIKE '%@' || ? AND is_approved = TRUE AND role IN ('student','voter')",
    [domain]
  );
  for (const user of users) {
    await client.exec(
      "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
      [electionId, user.id]
    );
  }
}

/**
 * Auto-assign a newly created/approved user to all elections whose domain matches.
 *
 * Mismo motivo que arriba para `client`.
 */
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
async function createCensusUser(
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

async function autoAssignElectionsToUser(
  userId: number,
  emailDomain: string,
  client: DbClient = db,
): Promise<void> {
  const elections = await client.run<{ election_id: number }>(
    "SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = '*'",
    [emailDomain]
  );
  for (const row of elections) {
    await client.exec(
      "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
      [row.election_id, userId]
    );
  }
}

/**
 * Parse CSV buffer into rows.
 *
 * S16 fix: usa csv-parse (RFC 4180) en lugar de split(','), de forma que
 * campos entre comillas que contienen comas (e.g. "García, Juan") se
 * parsean correctamente sin corromper los datos del censo.
 */
function parseCSV(buffer: Buffer): Record<string, string>[] {
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

/**
 * @route GET /admin/dashboard
 */
router.get("/dashboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminDomain = getAdminDomain(req);
    const isSuper = isSuperAdmin(req);
    const domainFilter = isSuper ? null : adminDomain;

    const dw = domainFilter
      ? "AND (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)"
      : "";
    const dp = domainFilter ? [domainFilter, domainFilter] : [];

    const totalUsers = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM users u WHERE 1=1 ${dw}`, dp
    );
    const pendingRequests = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM registration_requests rr WHERE status = 'pending'
       ${domainFilter ? "AND rr.email LIKE '%@' || ?" : ""}`,
      domainFilter ? [domainFilter] : []
    );
    const totalElections = await db.get<{ count: number }>(
      isSuper
        ? "SELECT COUNT(*) as count FROM elections"
        : `SELECT COUNT(DISTINCT e.id) as count FROM elections e
           JOIN election_access ea ON e.id = ea.election_id
           WHERE (ea.email_domain = ? OR ea.email_domain LIKE '%.' || ?)`,
      isSuper ? [] : [adminDomain!, adminDomain!]
    );
    // El epoch se calcula en JS y se pasa como parámetro: `strftime('%s','now')`
    // no existe en PostgreSQL, y `EXTRACT(EPOCH FROM NOW())` no existe en SQLite.
    // start_time y end_time son BIGINT (epoch en segundos) en los dos motores.
    const nowEpoch = Math.floor(Date.now() / 1000);
    const activeElections = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM elections WHERE is_active = TRUE
       AND start_time <= ? AND end_time >= ?`,
      [nowEpoch, nowEpoch]
    );
    const totalVotes = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM nullifier_audit na
       JOIN users u ON na.user_id = u.id WHERE 1=1
       ${domainFilter ? "AND (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)" : ""}`,
      domainFilter ? [domainFilter, domainFilter] : []
    );

    const recentVotes = await db.run<any>(
      `SELECT na.generated_at, u.email, e.name as election_name
       FROM nullifier_audit na
       JOIN users u ON na.user_id = u.id
       JOIN elections e ON na.election_id = e.id
       ${domainFilter ? "WHERE (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)" : ""}
       ORDER BY na.generated_at DESC LIMIT 5`,
      domainFilter ? [domainFilter, domainFilter] : []
    );

    const electionParticipation = await db.run<any>(
      `SELECT e.id, e.name,
         COUNT(DISTINCT ev.user_id) as total_voters,
         COUNT(DISTINCT na.user_id) as votes_cast,
         ROUND(COUNT(DISTINCT na.user_id) * 100.0 / NULLIF(COUNT(DISTINCT ev.user_id),0), 1) as rate
       FROM elections e
       LEFT JOIN election_voters ev ON e.id = ev.election_id
       LEFT JOIN nullifier_audit na ON e.id = na.election_id
       WHERE e.is_active = TRUE
       GROUP BY e.id ORDER BY e.created_at DESC LIMIT 5`
    );

    // El corte se calcula en JS: `date('now', '-7 days')` es la forma de dos
    // argumentos de SQLite y no existe en PostgreSQL.
    //
    // El formato 'YYYY-MM-DD HH:MM:SS' es el que vale en los dos motores: en
    // SQLite created_at es TEXT y la comparación es lexicográfica (correcta
    // porque el formato está zero-padded y ordena bien), y PostgreSQL lo
    // interpreta como timestamp. Un ISO-8601 con la 'T' rompería la comparación
    // en SQLite sin dar ningún error.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    // `date(x)` sí existe en ambos motores, así que el truncado a día se queda en SQL.
    const requestsTrend = await db.run<any>(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM registration_requests
       WHERE created_at >= ?
       GROUP BY date(created_at) ORDER BY day ASC`,
      [sevenDaysAgo]
    );

    res.json({
      stats: {
        totalUsers: totalUsers?.count || 0,
        pendingRequests: pendingRequests?.count || 0,
        totalElections: totalElections?.count || 0,
        activeElections: activeElections?.count || 0,
        totalVotes: totalVotes?.count || 0,
      },
      recentVotes: recentVotes || [],
      electionParticipation: electionParticipation || [],
      requestsTrend: requestsTrend || [],
    });
  } catch (error) {
    console.error("Error in dashboard:", error);
    res.status(500).json({ error: "Error al cargar las estadísticas del panel" });
  }
});

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
    const { email, password, name, student_id, role = "student", admin_domain = null } = req.body;

    if (!email || !password || !name || !student_id) {
      res.status(400).json({ error: "Faltan campos requeridos" });
      return;
    }

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      const emailDomain = email.split("@")[1];
      if (adminDomain && !isSubDomain(emailDomain, adminDomain)) {
        res.status(403).json({
          error: `Solo puedes crear usuarios del dominio @${adminDomain} y sus subdominios`,
        });
        return;
      }
      if (role === "superadmin") {
        res.status(403).json({ error: "No tienes permisos para crear superadministradores" });
        return;
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
        [email, passwordHash, name, student_id, role, admin_domain, req.user!.userId]
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

      if (!isSuperAdmin(req) && adminDomain) {
        const emailDomain = email.split('@')[1];
        if (!emailDomain || !isSubDomain(emailDomain, adminDomain)) {
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
      const userDomain = targetUser.email.split("@")[1];
      if (adminDomain && !isSubDomain(userDomain, adminDomain)) {
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
      await db.exec(
        `UPDATE users SET is_approved = FALSE, approved_by = NULL, approved_at = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );
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
      const userDomain = user.email.split("@")[1];
      if (adminDomain && !isSubDomain(userDomain, adminDomain)) {
        res.status(403).json({ error: "No tienes permisos para eliminar usuarios de otro dominio" });
        return;
      }
      if (user.role === "superadmin" || user.role === "admin") {
        res.status(403).json({ error: "No tienes permisos para eliminar administradores" });
        return;
      }
    }

    if (parseInt(id) === req.user!.userId) {
      res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
      return;
    }

    // Borrado lógico: preserva FKs (election_voters, nullifier_audit) y permite auditoría
    await db.exec(
      "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id],
    );

    res.json({ success: true, message: "Usuario eliminado" });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

/**
 * @route GET /admin/elections
 */
router.get("/elections", requireAdmin, async (req: Request, res: Response) => {
  try {
    let elections;
    if (isSuperAdmin(req)) {
      elections = await db.run<any>(
        "SELECT * FROM elections ORDER BY created_at DESC"
      );
    } else {
      const adminDomain = getAdminDomain(req);
      elections = await db.run<any>(
        "SELECT DISTINCT e.* FROM elections e JOIN election_access ea ON e.id = ea.election_id WHERE (ea.email_domain = ? OR ea.email_domain LIKE '%.' || ?) ORDER BY e.created_at DESC",
        [adminDomain, adminDomain]
      );
    }

    const electionList = elections || [];
    for (const election of electionList) {
      const domains = await db.run<any>(
        "SELECT email_domain FROM election_access WHERE election_id = ?",
        [election.id]
      );
      election.domains = domains.map((d: any) => d.email_domain);

      const candidates = await db.run<any>(
        "SELECT id, name FROM candidates WHERE election_id = ? ORDER BY position ASC",
        [election.id]
      );
      election.candidates = candidates;

      const targets = await db.run<any>(
        "SELECT target_type, target_value FROM election_targets WHERE election_id = ?",
        [election.id]
      );
      election.targets = targets || [];
    }

    res.json({ elections: electionList });
  } catch (error) {
    console.error("Error listando elecciones:", error);
    res.status(500).json({ error: "Error al listar elecciones" });
  }
});

/**
 * @route POST /admin/elections
 */
router.post("/elections", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = createElectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }
    const {
      name, description, start_time, end_time,
      banner_color,
      target_type        = 'all',
      target_values      = [] as string[],
      target_schools     = [] as string[],
      target_degrees     = [] as string[],
      target_description,
      voter_role         = 'student',
      candidates         = [],
    } = parsed.data;

    const adminDomain = getAdminDomain(req);

    // Build targets array
    const targets: { type: string; value: string }[] =
      target_type === 'all'
        ? [{ type: 'all', value: adminDomain || '*' }]
        : (target_values as string[]).map((v: string) => ({ type: target_type, value: v }));

    // ── Toda la parte de base de datos, en una transacción ──────────────────
    //
    // Crear la elección, sus targets, su acceso por dominio y su censo es una
    // sola cosa desde el punto de vista del administrador. Suelto, un fallo a
    // mitad dejaba la elección creada y visible pero con el censo incompleto:
    // gente que debería poder votar y no puede, sin ningún aviso.
    //
    // Los `.catch(() => {})` que llevaba cada INSERT se han quitado a propósito.
    // Dentro de una transacción de PostgreSQL, tragarse un error no sirve de
    // nada: tras el primer fallo la transacción queda abortada y toda consulta
    // posterior devuelve "current transaction is aborted". Es mejor que el error
    // suba y revierta el bloque entero.
    const electionId = await withTransaction(async (tx) => {
      // election_id_blockchain = 0 mientras está 'pending': los ids del contrato
      // empiezan en 1, así que 0 nunca apunta a una elección real. El definitivo
      // lo escribe la sincronización con el id del evento ElectionCreated.
      const inserted = await tx.exec(
        `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active,
                                banner_color, target_type, target_description, voter_role, chain_status)
         VALUES (0, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, 'pending')`,
        [name, description, start_time, end_time,
         banner_color || '#1E3A5F', target_type, target_description || null, voter_role]
      );
      const newId = inserted.lastID;

      // Los candidatos, en la misma transacción. Antes el frontend los añadía uno
      // a uno DESPUÉS de la respuesta: si esta no llegaba (el navegador corta a los
      // 15 s y la espera a Sepolia tardaba más), la elección quedaba sin ellos.
      for (const [position, candidate] of candidates.entries()) {
        await tx.exec(
          'INSERT INTO candidates (election_id, name, description, position) VALUES (?, ?, ?, ?)',
          [newId, candidate.name, candidate.description ?? '', position]
        );
      }

      // Insert election_targets and maintain election_access for backward compat
      for (const target of targets) {
        await tx.exec(
          'INSERT OR IGNORE INTO election_targets (election_id, target_type, target_value) VALUES (?, ?, ?)',
          [newId, target.type, target.value]
        );
        await tx.exec(
          'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
          [newId, target.value]
        );
      }

      // Build student/voter census (skip when voter_role === 'admin')
      if (voter_role === 'student' || voter_role === 'both') {
        if (target_type === 'all' || targets.some(t => t.value === '*')) {
          if (adminDomain) {
            await autoAssignUsersByDomain(newId, adminDomain, tx);
          }
        } else {
          for (const target of targets) {
            const targetUsers = await tx.run<{ id: number }>(
              `SELECT DISTINCT u.id FROM users u
               WHERE (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ? OR u.org_unit = ?)
                 AND u.is_approved = TRUE AND u.role IN ('student','voter')`,
              [target.value, target.value, target.value]
            );
            for (const user of targetUsers) {
              await tx.exec(
                'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
                [newId, user.id]
              );
            }
          }
        }
      }

      // Build census by school/degree attributes
      if ((target_schools as string[]).length > 0 || (target_degrees as string[]).length > 0) {
        const conditions: string[] = [];
        const params2: any[] = [];
        if ((target_schools as string[]).length > 0) {
          conditions.push(`school IN (${(target_schools as string[]).map(() => '?').join(',')})`);
          params2.push(...(target_schools as string[]));
        }
        if ((target_degrees as string[]).length > 0) {
          conditions.push(`degree IN (${(target_degrees as string[]).map(() => '?').join(',')})`);
          params2.push(...(target_degrees as string[]));
        }
        const targetUsers = await tx.run<{ id: number }>(
          `SELECT id FROM users WHERE ${conditions.join(' OR ')} AND is_approved = TRUE`,
          params2
        );
        for (const user of targetUsers) {
          await tx.exec(
            'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
            [newId, user.id]
          );
        }
      }

      // Build admin census
      if (voter_role === 'admin' || voter_role === 'both') {
        if (adminDomain) {
          const subAdmins = await tx.run<{ id: number }>(
            `SELECT id FROM users
             WHERE role IN ('admin', 'superadmin')
               AND (admin_domain = ? OR admin_domain LIKE ?)
               AND is_approved = TRUE`,
            [adminDomain, '%.' + adminDomain]
          );
          for (const user of subAdmins) {
            await tx.exec(
              'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [newId, user.id]
            );
          }
          // Also add the creating admin themselves
          await tx.exec(
            'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
            [newId, req.user!.userId]
          );
        }
      }

      // Legacy: ensure election_access entry for backward compat
      if (adminDomain && (target_type === 'all' || voter_role === 'admin')) {
        await tx.exec(
          'INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)',
          [newId, adminDomain]
        );
      }

      return newId;
    });

    // ── Registro en la cadena: en segundo plano, sin esperarlo ──────────────
    //
    // Antes se enviaba createElection aquí y se esperaba el recibo (12-40 s en
    // Sepolia) antes de responder. El navegador corta a los 15 s, así que a menudo
    // el administrador veía "No se ha podido crear la elección" con la elección ya
    // creada. Ahora la elección queda 'pending' y la registra la sincronización
    // (scripts/syncElections.ts): se lanza ya, sin esperarla, y el job periódico de
    // index.ts la reintenta si falla. El panel muestra el estado.
    const chainConfigured = isChainConfigured();
    if (chainConfigured) {
      void syncElectionsToBlockchain().catch((err) =>
        console.error("[chain-sync] error tras crear la elección:", formatError(err)),
      );
    }

    res.json({
      success: true,
      electionId,
      chainStatus: 'pending',
      chainConfigured,
      candidates: candidates.length,
      message: `Elección "${name}" creada exitosamente`,
    });
  } catch (error) {
    console.error("Error creando elección:", formatError(error));
    res.status(500).json({ error: "Error al crear elección" });
  }
});

/**
 * @route PUT /admin/elections/:id
 */
router.put("/elections/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active, banner_color, target_type, target_description } = req.body;

    const sets: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const params: any[] = [];

    if (is_active !== undefined) { sets.push("is_active = ?"); params.push(Boolean(is_active)); }
    if (banner_color !== undefined) { sets.push("banner_color = ?"); params.push(banner_color); }
    if (target_type !== undefined) { sets.push("target_type = ?"); params.push(target_type); }
    if (target_description !== undefined) { sets.push("target_description = ?"); params.push(target_description); }

    params.push(id);
    await db.exec(`UPDATE elections SET ${sets.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: "Elección actualizada" });
  } catch (error) {
    console.error("Error actualizando elección:", error);
    res.status(500).json({ error: "Error al actualizar elección" });
  }
});

/**
 * @route PATCH /admin/elections/:id
 * @desc Edit election name, description, end_time
 */
router.patch("/elections/:id", requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, end_time } = req.body;
  try {
    const election = await db.get("SELECT * FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }
    await db.exec(
      `UPDATE elections SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        end_time = COALESCE(?, end_time),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || null, description || null, end_time || null, id]
    );
    res.json({ success: true, message: "Elección actualizada" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route POST /admin/elections/:id/image
 */
router.post("/elections/:id/image", requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      res.status(400).json({ error: "No se ha adjuntado ninguna imagen" });
      return;
    }

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const imageUrl = `data:${mimeType};base64,${base64}`;

    await db.exec("UPDATE elections SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [imageUrl, id]);

    res.json({ success: true, message: 'Imagen subida correctamente' });
  } catch (error) {
    console.error("Error uploading election image:", error);
    res.status(500).json({ error: "Error al subir la imagen" });
  }
});

/**
 * @route POST /admin/elections/:id/import-voters
 * CSV import: add voters to an election
 */
router.post("/elections/:id/import-voters", requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const paramParsed = importVotersParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ error: paramParsed.error.issues[0]?.message ?? 'Parámetro inválido' });
      return;
    }
    const { id } = paramParsed.data;

    if (!req.file) {
      res.status(400).json({ error: "No se ha adjuntado ningún archivo" });
      return;
    }

    const election = await db.get<{ id: number; name: string }>(
      "SELECT id, name FROM elections WHERE id = ?", [id]
    );
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const rows = parseCSV(req.file.buffer);

    // ── FASE 1: validar el CSV entero sin escribir nada ─────────────────────
    //
    // Antes esto era un solo bucle que validaba y escribía a la vez, fila a
    // fila. Un CSV de 800 personas que fallara en la 300 dejaba 299 cuentas
    // creadas y el censo a medias, sin forma de saber desde fuera por dónde se
    // había quedado.
    //
    // Separar la validación permite rechazar el fichero entero antes de tocar la
    // base de datos, y devolver TODOS los errores de una vez en vez del primero.
    const adminDomain = getAdminDomain(req);
    const errors: string[] = [];
    const plan: Array<{
      email: string;
      full_name: string;
      student_id: string;
      existingUserId: number | null;
    }> = [];
    const seen = new Set<string>();

    for (const [i, row] of rows.entries()) {
      const linea = i + 2; // +1 por índice base 0, +1 por la cabecera del CSV
      const email = row.email?.trim();
      const full_name = row.full_name?.trim() || row.name?.trim();
      const student_id = row.student_id?.trim();

      if (!email) {
        errors.push(`Línea ${linea}: fila sin email`);
        continue;
      }

      const normalized = email.toLowerCase();
      if (seen.has(normalized)) {
        errors.push(`Línea ${linea}: ${email} está repetido en el fichero`);
        continue;
      }
      seen.add(normalized);

      if (!isSuperAdmin(req) && adminDomain) {
        const emailDomain = email.split('@')[1];
        if (!emailDomain || !isSubDomain(emailDomain, adminDomain)) {
          errors.push(`Línea ${linea}: ${email} no pertenece al dominio @${adminDomain}`);
          continue;
        }
      }

      const existing = await db.get<{ id: number }>(
        "SELECT id FROM users WHERE email = ?", [email]
      );

      if (!existing && (!full_name || !student_id)) {
        errors.push(`Línea ${linea}: ${email} es una cuenta nueva y le falta full_name o student_id`);
        continue;
      }

      plan.push({
        email,
        full_name: full_name ?? '',
        student_id: student_id ?? '',
        existingUserId: existing?.id ?? null,
      });
    }

    // Un solo error aborta el fichero entero. Es el precio de la atomicidad: no
    // se puede prometer "o todo o nada" y a la vez importar 797 de 800.
    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'El fichero tiene errores. No se ha importado nada.',
        errors,
        totalRows: rows.length,
      });
      return;
    }

    // ── FASE 2: escribir todo dentro de una transacción ─────────────────────
    //
    // Las invitaciones se acumulan en memoria en vez de encolarse aquí: un
    // correo no se puede deshacer, así que encolarlo dentro de la transacción
    // significaría que un ROLLBACK deja a 700 personas con un correo para una
    // cuenta que ya no existe.
    //
    // El token de "establece tu contraseña" tampoco se genera aquí: lo emite el
    // worker de la cola al enviar, para que el enlace no quede en claro en
    // email_log (P1-7).
    const institutionName = adminDomain ?? 'tu institución';

    const pendingInvites: Array<{ to: string; userId: number; name: string }> = [];
    let created = 0;
    let added = 0;
    let skipped = 0;

    await withTransaction(async (tx) => {
      for (const entry of plan) {
        let userId = entry.existingUserId;

        if (userId === null) {
          const alta = await createCensusUser(tx, entry, req.user!.userId);
          userId = alta.userId;
          created++;

          pendingInvites.push(alta.invite);
        }

        const assigned = await tx.exec(
          "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
          [id, userId]
        );
        // changes = 0 significa que el ON CONFLICT no insertó: ya estaba en el censo.
        if (assigned.changes > 0) added++;
        else skipped++;
      }
    });

    // ── FASE 3: enviar los correos, ya con la transacción confirmada ────────
    //
    // A partir de aquí los datos están commiteados: si falla un envío, el censo
    // sigue bien y la invitación se puede reenviar. Al revés no tiene arreglo.
    for (const invite of pendingInvites) {
      sendCensusInvitation({
        to:              invite.to,
        userId:          invite.userId,
        name:            invite.name,
        electionName:    election.name,
        institutionName,
      });
    }

    res.json({
      success: true,
      results: { created, added, skipped, invited: pendingInvites.length, errors: [] },
    });
  } catch (error) {
    console.error("Error importing voters CSV:", formatError(error));
    res.status(500).json({ error: "Error al importar votantes. No se ha importado nada." });
  }
});

/**
 * @route GET /admin/audit
 */
router.get("/audit", requireAdmin, async (req: Request, res: Response) => {
  try {
    let query = `
      SELECT
        na.id,
        na.user_id,
        u.email,
        u.name,
        na.election_id,
        e.name as election_name,
        na.nullifier_hash,
        na.generated_at
      FROM nullifier_audit na
      JOIN users u ON na.user_id = u.id
      JOIN elections e ON na.election_id = e.id
    `;
    const params: any[] = [];

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      query += " WHERE (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)";
      params.push(adminDomain, adminDomain);
    }

    query += " ORDER BY na.generated_at DESC LIMIT 100";

    const audit = await db.run<any>(query, params);

    res.json({ audit: audit || [] });
  } catch (error) {
    console.error("Error en auditoría:", error);
    res.status(500).json({ error: "Error al obtener auditoría" });
  }
});

/**
 * @route GET /admin/stats/voters
 */
router.get("/stats/voters", requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await db.run<any>(
      `SELECT
        e.id,
        e.name as election_name,
        COUNT(DISTINCT na.id) as total_voters,
        COUNT(DISTINCT ev.user_id) as total_voters_assigned,
        ROUND(COUNT(DISTINCT na.id) * 100.0 / NULLIF(COUNT(DISTINCT ev.user_id), 0), 1) as participation_rate,
        e.is_active,
        e.created_at
      FROM elections e
      LEFT JOIN nullifier_audit na ON e.id = na.election_id
      LEFT JOIN election_voters ev ON e.id = ev.election_id
      GROUP BY e.id
      ORDER BY e.created_at DESC`
    );

    res.json({ stats: stats || [] });
  } catch (error) {
    console.error("Error en estadísticas:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * @route GET /admin/registration-requests
 */
router.get("/registration-requests", requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const adminDomain = getAdminDomain(req);
    const isSuper = isSuperAdmin(req);

    let query = "SELECT * FROM registration_requests";
    const params: any[] = [];
    const conditions: string[] = [];

    if (status !== 'all') {
      conditions.push("status = ?");
      params.push(status);
    }

    if (!isSuper && adminDomain) {
      conditions.push("(email LIKE '%@' || ? OR email LIKE '%@%.' || ?)");
      params.push(adminDomain, adminDomain);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // S12 fix: paginación en SQL (LIMIT/OFFSET) en lugar de traer todos los
    // registros a memoria y hacer slice() en JS.
    // Nota: `query` ya tiene el WHERE de las conditions de arriba.
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = 20;
    const offset   = (page - 1) * pageSize;

    // Total: misma condición WHERE pero COUNT(*)
    const baseTable  = 'registration_requests';
    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countRow = await db.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM ${baseTable}${whereClause}`,
      params,
    );
    const total = countRow?.total ?? 0;

    // Datos paginados (query ya tiene el WHERE; solo añadimos ORDER BY + LIMIT)
    const paginatedQuery = query + ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const paginatedRequests = await db.run<{
      id: number; email: string; name: string; student_id: string;
      institution: string | null; status: string;
      created_at: string; reviewed_at: string | null;
      rejection_reason: string | null;
    }>(paginatedQuery, [...params, pageSize, offset]);

    res.json({
      requests: paginatedRequests,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error obteniendo solicitudes:", error);
    res.status(500).json({ error: "Error al obtener solicitudes" });
  }
});

/**
 * @route PATCH /admin/registration-requests/:id
 */
router.patch("/registration-requests/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({ error: "Acción inválida. Use 'approve' o 'reject'" });
      return;
    }

    const request = await db.get<{
      id: number;
      full_name: string;
      email: string;
      student_id: string;
      status: string;
      password_hash: string | null;
      org_unit: string | null;
      school: string | null;
      degree: string | null;
      year: number | null;
      study_group: string | null;
    }>(
      "SELECT * FROM registration_requests WHERE id = ?",
      [id]
    );

    if (!request) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }

    if (action === 'approve') {
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && !isSubDomain(requestDomain, adminDomain)) {
          res.status(403).json({ error: "Solo puedes gestionar solicitudes de tu propio dominio" });
          return;
        }
      }

      let passwordHash = request.password_hash;
      let tempPassword: string | null = null;

      if (!passwordHash) {
        tempPassword = crypto.randomBytes(12).toString('base64url');
        passwordHash = await hashPassword(tempPassword);
      }

      const orgUnit = request.org_unit || null;
      const { school, degree, year, study_group } = request;

      // Aprobar es: crear la cuenta, marcar la solicitud como aprobada y meter a
      // la persona en sus censos. Suelto, el estado intermedio más feo era la
      // solicitud marcada 'approved' con el usuario sin crear: desaparece de la
      // bandeja del administrador y la persona no tiene cuenta, sin rastro.
      const domain = request.email.split('@')[1];

      await withTransaction(async (tx) => {
        const insertResult = await tx.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role, org_unit,
                             school, degree, year, study_group,
                             is_approved, approved_by, approved_at, is_eligible, must_change_password, created_at)
           VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, TRUE, ?, CURRENT_TIMESTAMP, TRUE, ?, CURRENT_TIMESTAMP)`,
          [request.email, passwordHash, request.full_name, request.student_id, orgUnit,
           school || null, degree || null, year || null, study_group || null, req.user!.userId,
           tempPassword !== null]
        );

        const newUserId = insertResult.lastID;

        await tx.exec(
          "UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [id]
        );

        if (domain) {
          const elections = await tx.run<{ election_id: number }>(
            "SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = '*'",
            [domain]
          );
          for (const election of elections) {
            await tx.exec(
              'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [election.election_id, newUserId]
            );
          }
        }

        // Also auto-assign to elections targeting user's org_unit
        if (orgUnit) {
          const targetedElections = await tx.run<{ election_id: number }>(
            `SELECT DISTINCT election_id FROM election_targets
             WHERE target_value = ? OR target_value = '*'`,
            [orgUnit]
          );
          for (const election of targetedElections) {
            await tx.exec(
              'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [election.election_id, newUserId]
            );
          }
        }
      });

      res.json({
        message: tempPassword
          ? "User approved with temporary password"
          : "User approved. They can now log in with the password they chose during registration.",
        tempPassword,
      });

    } else if (action === 'reject') {
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && !isSubDomain(requestDomain, adminDomain)) {
          res.status(403).json({ error: "No tienes permisos para gestionar solicitudes de otro dominio" });
          return;
        }
      }

      if (!reason?.trim()) {
        res.status(400).json({ error: "El motivo de rechazo es obligatorio" });
        return;
      }

      await db.exec(
        "UPDATE registration_requests SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [reason, id]
      );

      res.json({ message: "Solicitud rechazada" });
    }

  } catch (error) {
    console.error("Error procesando solicitud:", error);
    res.status(500).json({ error: "Error al procesar solicitud" });
  }
});

/**
 * @route POST /admin/elections/:id/domains
 */
router.post("/elections/:id/domains", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { domain } = req.body;

    if (!domain?.trim()) {
      res.status(400).json({ error: "El dominio es obligatorio" });
      return;
    }

    const election = await db.get("SELECT id FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    try {
      await db.exec(
        "INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)",
        [id, domain.trim()]
      );
      if (domain.trim() !== '*') {
        await autoAssignUsersByDomain(parseInt(id), domain.trim());
      }
      res.json({ success: true, message: `Dominio ${domain} añadido correctamente` });
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        res.status(409).json({ error: "Este dominio ya está permitido para esta elección" });
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error("Error añadiendo dominio:", error);
    res.status(500).json({ error: "Error al añadir el dominio a la elección" });
  }
});

/**
 * @route POST /admin/elections/:id/voters
 */
router.post("/elections/:id/voters", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email?.trim()) {
      res.status(400).json({ error: "El email del usuario es obligatorio" });
      return;
    }

    const election = await db.get("SELECT id FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const user = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email.trim()]);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    try {
      await db.exec(
        "INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)",
        [id, user.id]
      );
      res.json({ success: true, message: `Usuario ${email} añadido a la elección` });
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        res.status(409).json({ error: "El usuario ya está asignado a esta elección" });
      } else {
        throw e;
      }
    }
  } catch (error) {
    res.status(500).json({ error: "Error al asignar el usuario a la elección" });
  }
});

/**
 * @route POST /admin/elections/:id/candidates
 */
router.post("/elections/:id/candidates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre del candidato es obligatorio" });
      return;
    }

    const election = await db.get("SELECT id FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const result = await db.exec(
      "INSERT INTO candidates (election_id, name, description) VALUES (?, ?, ?)",
      [id, name.trim(), description?.trim() || ""]
    );
    res.json({ success: true, candidateId: result.lastID, message: `Candidato ${name} añadido` });
  } catch (error) {
    console.error("Error añadiendo candidato:", error);
    res.status(500).json({ error: "Error al añadir candidato a la elección" });
  }
});

/**
 * @route GET /admin/org-units
 */
router.get("/org-units", requireAdmin, async (req: Request, res: Response) => {
  try {
    let units;
    if (isSuperAdmin(req)) {
      units = await db.run<any>(
        "SELECT * FROM org_units ORDER BY institution_domain, unit_type, name"
      );
    } else {
      const adminDomain = getAdminDomain(req);
      units = await db.run<any>(
        `SELECT * FROM org_units
         WHERE institution_domain = ? OR domain = ? OR domain LIKE ?
         ORDER BY unit_type, name`,
        [adminDomain, adminDomain, '%.' + adminDomain]
      );
    }
    res.json({ units: units || [] });
  } catch (error) {
    console.error("Error getting org units:", error);
    res.status(500).json({ error: "Error al obtener las unidades organizativas" });
  }
});

/**
 * @route POST /admin/org-units
 */
router.post("/org-units", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, domain, parent_domain, unit_type } = req.body;

    if (!name || !domain || !unit_type) {
      res.status(400).json({ error: "Nombre, dominio y tipo de unidad son obligatorios" });
      return;
    }

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      if (!adminDomain || !isSubDomain(domain, adminDomain)) {
        res.status(403).json({ error: "Solo puedes crear unidades organizativas dentro de tu dominio" });
        return;
      }
    }

    const adminDomain = getAdminDomain(req);
    const parentUnit = parent_domain
      ? await db.get<{ institution_domain: string }>(
          'SELECT institution_domain FROM org_units WHERE domain = ?', [parent_domain]
        )
      : null;
    const institution_domain = parentUnit?.institution_domain || adminDomain || domain;

    const result = await db.exec(
      "INSERT INTO org_units (name, domain, parent_domain, unit_type, institution_domain) VALUES (?, ?, ?, ?, ?)",
      [name, domain, parent_domain || null, unit_type, institution_domain]
    );

    res.json({ success: true, id: result.lastID, message: `Unidad organizativa "${name}" creada` });
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Ese dominio ya existe entre las unidades organizativas" });
    } else {
      console.error("Error creating org unit:", error);
      res.status(500).json({ error: "Error al crear la unidad organizativa" });
    }
  }
});

/**
 * @route POST /admin/domain-admins
 */
router.post("/domain-admins", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      res.status(403).json({ error: "Solo el superadministrador puede crear administradores de dominio" });
      return;
    }

    const { email, password, name, student_id, admin_domain } = req.body;

    if (!email || !password || !name || !student_id || !admin_domain) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["email", "password", "name", "student_id", "admin_domain"],
      });
      return;
    }

    const emailDomain = email.split("@")[1];
    if (emailDomain !== admin_domain) {
      res.status(400).json({
        error: `El email del administrador debe pertenecer al dominio que va a gestionar (@${admin_domain})`,
      });
      return;
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
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain,
                         is_approved, approved_by, approved_at, is_eligible)
       VALUES (?, ?, ?, ?, 'admin', ?, TRUE, ?, CURRENT_TIMESTAMP, TRUE)`,
      [email, passwordHash, name, student_id, admin_domain, req.user!.userId]
    );

    res.json({
      success: true,
      userId: result.lastID,
      message: `Administrador de dominio @${admin_domain} creado correctamente`,
    });
  } catch (error) {
    console.error("Error creando admin de dominio:", error);
    res.status(500).json({ error: "Error al crear administrador de dominio" });
  }
});

/**
 * @route GET /admin/domain-admins
 */
router.get("/domain-admins", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      res.status(403).json({ error: "Solo el superadministrador puede ver los administradores de dominio" });
      return;
    }

    const admins = await db.run<any>(
      `SELECT id, email, name, student_id, admin_domain, is_approved, approved_at, created_at
       FROM users WHERE role = 'admin' ORDER BY admin_domain, created_at DESC`
    );

    res.json({ admins: admins || [] });
  } catch (error) {
    console.error("Error listando admins de dominio:", error);
    res.status(500).json({ error: "Error al listar administradores de dominio" });
  }
});

/**
 * @route GET /admin/domains
 */
router.get("/domains", requireAdmin, async (req: Request, res: Response) => {
  try {
    let domains: string[] = [];

    if (isSuperAdmin(req)) {
      // El dominio se extrae en JS, no en SQL: `instr` no existe en PostgreSQL y
      // `split_part` no existe en SQLite. El resultado ya se deduplicaba en un Set
      // aquí abajo, así que traer los emails distintos no cambia el resultado.
      const userEmails = await db.run<{ email: string }>(
        "SELECT DISTINCT email FROM users WHERE email LIKE '%@%'"
      );
      const accessDomains = await db.run<{ domain: string }>(
        "SELECT DISTINCT email_domain as domain FROM election_access WHERE email_domain != '*' ORDER BY email_domain"
      );
      const allDomains = new Set<string>([
        ...userEmails.map((u) => u.email.split('@')[1]).filter(Boolean),
        ...accessDomains.map((d: any) => d.domain),
      ]);
      domains = Array.from(allDomains).filter(Boolean).sort();
    } else {
      const adminDomain = getAdminDomain(req);
      if (adminDomain) domains = [adminDomain];
    }

    res.json({ domains });
  } catch (error) {
    console.error("Error obteniendo dominios:", error);
    res.status(500).json({ error: "Error al obtener dominios" });
  }
});

/**
 * @route GET /admin/blockchain-status
 * @desc Returns the live status of the connected blockchain node and contract.
 */
router.get("/blockchain-status", requireAdmin, async (req: Request, res: Response) => {
  const contractAddress = process.env.CONTRACT_ADDRESS || "";
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const explorerUrl = process.env.EXPLORER_URL || "";

  if (!contractAddress) {
    res.json({
      connected: false,
      reason: "CONTRACT_ADDRESS not configured",
      contractAddress: null,
      rpcUrl,
      explorerUrl,
    });
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const abi = ["function getElectionCount() public view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const electionCount = await contract.getElectionCount();

    res.json({
      connected: true,
      contractAddress,
      rpcUrl,
      explorerUrl,
      chainId: network.chainId.toString(),
      blockNumber,
      electionCount: electionCount.toString(),
    });
  } catch (err: any) {
    console.warn("blockchain-status check failed:", formatError(err));
    // NOTA (P1-15, HIGH sin tocar): `reason` sigue enviando err.message crudo
    // al cliente. El saneado de A1 cubre el log, no esta respuesta.
    res.json({
      connected: false,
      reason: err.message || "Could not connect to blockchain node",
      contractAddress,
      rpcUrl,
      explorerUrl,
    });
  }
});

/**
 * @route GET /admin/elections/:id/stats
 * @desc Detailed statistics for a single election (candidates, voters, domains)
 */
router.get("/elections/:id/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const election = await db.get<any>(
      "SELECT id, name, description, start_time, end_time, is_active FROM elections WHERE id = ?",
      [id]
    );
    if (!election) {
      res.status(404).json({ error: "Elección no encontrada" });
      return;
    }

    const totalVotersRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM election_voters WHERE election_id = ?",
      [id]
    );
    const totalVotesRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM nullifier_audit WHERE election_id = ?",
      [id]
    );
    const totalVotesNum = totalVotesRow?.count || 0;
    const totalVotersNum = totalVotersRow?.count || 0;

    const candidateStats = await db.run<any>(
      `SELECT c.id, c.name, c.description, COUNT(na.id) as votes
       FROM candidates c
       LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.candidate_id = c.id
       WHERE c.election_id = ?
       GROUP BY c.id ORDER BY votes DESC`,
      [id, id]
    );

    const candidatesWithPct = candidateStats.map((c: any) => ({
      ...c,
      percentage: totalVotesNum > 0
        ? Math.round((c.votes / totalVotesNum) * 1000) / 10
        : 0,
    }));

    const domains = await db.run<{ email_domain: string }>(
      "SELECT email_domain FROM election_access WHERE election_id = ?",
      [id]
    );

    const voters = await db.run<any>(
      `SELECT u.email,
         CASE WHEN na.id IS NOT NULL THEN 1 ELSE 0 END as has_voted
       FROM election_voters ev
       JOIN users u ON ev.user_id = u.id
       LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.user_id = u.id
       WHERE ev.election_id = ?
       ORDER BY has_voted DESC, u.email ASC`,
      [id, id]
    );

    res.json({
      election: {
        ...election,
        startDate: new Date(election.start_time * 1000).toISOString(),
        endDate: new Date(election.end_time * 1000).toISOString(),
      },
      stats: {
        totalVoters: totalVotersNum,
        totalVotes: totalVotesNum,
        participationRate: totalVotersNum > 0
          ? Math.round((totalVotesNum / totalVotersNum) * 1000) / 10
          : 0,
      },
      candidates: candidatesWithPct,
      domains: domains.map((d: any) => d.email_domain),
      voters: voters || [],
    });
  } catch (error) {
    console.error("Error in election stats:", error);
    res.status(500).json({ error: "Error al cargar las estadísticas de la elección" });
  }
});


// ── Notificaciones masivas de elección ────────────────────────────────────────

const MAX_NOTIFY_BATCH = 1000; // límite por llamada para no saturar la cola

/**
 * @route POST /admin/elections/:id/notify-open
 * @desc  Envía el aviso de apertura a todos los votantes de la elección.
 */
router.post("/elections/:id/notify-open", requireAdmin, async (req: Request, res: Response) => {
  try {
    const electionId = parseInt(req.params.id, 10);
    if (isNaN(electionId)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }

    const election = await db.get<{
      id: number; name: string; start_time: number; end_time: number;
    }>("SELECT id, name, start_time, end_time FROM elections WHERE id = ?", [electionId]);

    if (!election) {
      res.status(404).json({ error: 'Elección no encontrada' });
      return;
    }

    const voters = await db.run<{ email: string; name: string }>(
      `SELECT u.email, u.name
         FROM election_voters ev
         JOIN users u ON u.id = ev.user_id
        WHERE ev.election_id = ?
          AND u.deleted_at IS NULL
          AND u.email NOT LIKE '%@vtb.demo'
        LIMIT ${MAX_NOTIFY_BATCH}`,
      [electionId],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    for (const v of voters) {
      sendElectionOpen({
        to:           v.email,
        name:         v.name,
        electionName: election.name,
        startTime:    new Date(election.start_time * 1000),
        endTime:      new Date(election.end_time   * 1000),
        voteUrl:      `${frontendUrl}/elections/${electionId}`,
      });
    }

    res.json({ success: true, queued: voters.length });
  } catch (err) {
    console.error('notify-open error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @route POST /admin/elections/:id/notify-close
 * @desc  Envía el aviso de cierre y resultados disponibles a todos los votantes.
 */
router.post("/elections/:id/notify-close", requireAdmin, async (req: Request, res: Response) => {
  try {
    const electionId = parseInt(req.params.id, 10);
    if (isNaN(electionId)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }

    const election = await db.get<{ id: number; name: string; end_time: number }>(
      "SELECT id, name, end_time FROM elections WHERE id = ?", [electionId]
    );
    if (!election) {
      res.status(404).json({ error: 'Elección no encontrada' });
      return;
    }

    const voters = await db.run<{ email: string; name: string }>(
      `SELECT u.email, u.name
         FROM election_voters ev
         JOIN users u ON u.id = ev.user_id
        WHERE ev.election_id = ?
          AND u.deleted_at IS NULL
          AND u.email NOT LIKE '%@vtb.demo'
        LIMIT ${MAX_NOTIFY_BATCH}`,
      [electionId],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const closedAt = election.end_time
      ? new Date(election.end_time * 1000)
      : new Date();

    for (const v of voters) {
      sendElectionClose({
        to:           v.email,
        name:         v.name,
        electionName: election.name,
        closedAt,
        resultsUrl:   `${frontendUrl}/elections/${electionId}/results`,
      });
    }

    res.json({ success: true, queued: voters.length });
  } catch (err) {
    console.error('notify-close error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
