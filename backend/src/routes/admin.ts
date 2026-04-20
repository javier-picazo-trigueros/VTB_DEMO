import express, { Request, Response } from "express";
import multer from "multer";
import { getDatabase } from "../config/database.js";
import { verifyToken, hashPassword, generateToken } from "../utils/auth.js";
import { ethers } from "ethers";

const router = express.Router();
const db = getDatabase();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// Extender tipo de Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * Middleware: Verificar que sea admin
 */
const authAdminMiddleware = async (req: Request, res: Response, next: any) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token requerido" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token) as any;

    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: "Token inválido" });
      return;
    }

    // Verificar que sea admin o superadmin
    const admin = await db.get<{ role: string; admin_domain: string | null }>(
      "SELECT role, admin_domain FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (!admin || (admin.role !== 'admin' && admin.role !== 'superadmin')) {
      res.status(403).json({ error: "Acceso denegado. Se requieren permisos de administrador" });
      return;
    }

    req.user = { ...decoded, adminDomain: admin.admin_domain, role: admin.role };
    next();
  } catch (error) {
    res.status(500).json({ error: "Error de autenticación" });
  }
};

// Helper functions for domain scoping
const isSuperAdmin = (req: Request) => req.user?.role === 'superadmin';
const getAdminDomain = (req: Request): string | null => req.user?.adminDomain || null;

function isSubDomain(domain: string, parentDomain: string): boolean {
  return domain === parentDomain || domain.endsWith('.' + parentDomain);
}

/**
 * Auto-assign all approved users with a given domain to an election.
 */
async function autoAssignUsersByDomain(electionId: number, domain: string): Promise<void> {
  const users = await db.run<{ id: number }>(
    "SELECT id FROM users WHERE email LIKE '%@' || ? AND is_approved = 1 AND role IN ('student','voter')",
    [domain]
  );
  for (const user of users) {
    try {
      await db.exec(
        "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
        [electionId, user.id]
      );
    } catch { /* ignore */ }
  }
}

/**
 * Auto-assign a newly created/approved user to all elections whose domain matches.
 */
async function autoAssignElectionsToUser(userId: number, emailDomain: string): Promise<void> {
  const elections = await db.run<{ election_id: number }>(
    'SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = \'*\'',
    [emailDomain]
  );
  for (const row of elections) {
    try {
      await db.exec(
        "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
        [row.election_id, userId]
      );
    } catch { /* ignore */ }
  }
}

/**
 * Parse CSV buffer into rows
 */
function parseCSV(buffer: Buffer): Record<string, string>[] {
  const csvText = buffer.toString('utf-8');
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
}

/**
 * @route GET /admin/dashboard
 */
router.get("/dashboard", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const adminDomain = getAdminDomain(req);
    const isSuper = isSuperAdmin(req);

    let totalUsers, adminCount, studentCount, totalElections, nullifierAudit, pendingApproval;

    if (isSuper) {
      totalUsers = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users");
      adminCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role IN ('admin','superadmin')");
      studentCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role IN ('student','voter')");
      totalElections = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM elections");
      nullifierAudit = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM nullifier_audit");
      pendingApproval = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE is_approved = 0");
    } else {
      totalUsers = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE (email LIKE '%@' || ? OR email LIKE '%@%.' || ?) AND role NOT IN ('superadmin')",
        [adminDomain, adminDomain]
      );
      adminCount = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND (admin_domain = ? OR admin_domain LIKE '%.' || ?)",
        [adminDomain, adminDomain]
      );
      studentCount = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE role IN ('student','voter') AND (email LIKE '%@' || ? OR email LIKE '%@%.' || ?)",
        [adminDomain, adminDomain]
      );
      totalElections = await db.get<{ count: number }>(
        "SELECT COUNT(DISTINCT e.id) as count FROM elections e JOIN election_access ea ON e.id = ea.election_id WHERE (ea.email_domain = ? OR ea.email_domain LIKE '%.' || ?)",
        [adminDomain, adminDomain]
      );
      nullifierAudit = await db.get<{ count: number }>(
        "SELECT COUNT(na.id) as count FROM nullifier_audit na JOIN users u ON na.user_id = u.id WHERE (u.email LIKE '%@' || ? OR u.email LIKE '%@%.' || ?)",
        [adminDomain, adminDomain]
      );
      pendingApproval = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE is_approved = 0 AND (email LIKE '%@' || ? OR email LIKE '%@%.' || ?)",
        [adminDomain, adminDomain]
      );
    }

    res.json({
      stats: {
        totalUsers: totalUsers?.count || 0,
        adminCount: adminCount?.count || 0,
        studentCount: studentCount?.count || 0,
        totalElections: totalElections?.count || 0,
        totalNullifiers: nullifierAudit?.count || 0,
        pendingApproval: pendingApproval?.count || 0,
      },
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * @route GET /admin/users
 */
router.get("/users", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const approvedFilter = req.query.approved as string;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      conditions.push("(email LIKE '%@' || ? OR email LIKE '%@%.' || ?)");
      params.push(adminDomain, adminDomain);
      conditions.push("role NOT IN ('superadmin')");
    }

    if (approvedFilter === "true") {
      conditions.push("is_approved = 1");
    } else if (approvedFilter === "false") {
      conditions.push("is_approved = 0");
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const users = await db.run<any>(
      `SELECT id, email, name, student_id, role, admin_domain,
              is_approved, approved_at, is_eligible, created_at
       FROM users ${where} ORDER BY created_at DESC`,
      params
    );

    res.json({ users: users || [] });
  } catch (error) {
    console.error("Error listando usuarios:", error);
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

/**
 * @route POST /admin/users
 */
router.post("/users", authAdminMiddleware, async (req: Request, res: Response) => {
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
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain,
                         is_approved, approved_by, approved_at, is_eligible)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, 1)`,
      [email, passwordHash, name, student_id, role, admin_domain, req.user.userId]
    );

    const emailDomain = email.split('@')[1];
    if (emailDomain) {
      await autoAssignElectionsToUser(result.lastID, emailDomain);
    }

    res.json({
      success: true,
      userId: result.lastID,
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
router.post("/users/import", authAdminMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const rows = parseCSV(req.file.buffer);
    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const row of rows) {
      const email = row.email?.trim();
      const full_name = row.full_name?.trim() || row.name?.trim();
      const student_id = row.student_id?.trim();
      const role = row.role?.trim() || 'student';

      if (!email || !full_name || !student_id) {
        results.errors.push(`Skipped row with missing data: ${JSON.stringify(row)}`);
        continue;
      }

      // Domain check for non-superadmin
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const emailDomain = email.split('@')[1];
        if (adminDomain && !isSubDomain(emailDomain, adminDomain)) {
          results.errors.push(`Domain not allowed: ${email}`);
          continue;
        }
      }

      const existing = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
      if (existing) {
        results.skipped++;
        continue;
      }

      try {
        const tempPassword = `VTB_${student_id}_temp`;
        const passwordHash = await hashPassword(tempPassword);
        const result = await db.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role,
                             is_approved, approved_by, approved_at, is_eligible)
           VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, 1)`,
          [email, passwordHash, full_name, student_id, role, req.user.userId]
        );
        const emailDomain = email.split('@')[1];
        if (emailDomain) await autoAssignElectionsToUser(result.lastID, emailDomain);
        results.created++;
      } catch (e: any) {
        results.errors.push(`Error creating ${email}: ${e.message}`);
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error("Error importing users CSV:", error);
    res.status(500).json({ error: "Error importing users" });
  }
});

/**
 * @route PATCH /admin/users/:id/approval
 */
router.patch("/users/:id/approval", authAdminMiddleware, async (req: Request, res: Response) => {
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
        `UPDATE users SET is_approved = 1, approved_by = ?, approved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.userId, id]
      );
      res.json({ success: true, message: "Cuenta aprobada correctamente" });
    } else {
      await db.exec(
        `UPDATE users SET is_approved = 0, approved_by = NULL, approved_at = NULL,
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
router.delete("/users/:id", authAdminMiddleware, async (req: Request, res: Response) => {
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

    if (parseInt(id) === req.user.userId) {
      res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
      return;
    }

    await db.exec("DELETE FROM users WHERE id = ?", [id]);

    res.json({ success: true, message: "Usuario eliminado" });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

/**
 * @route GET /admin/elections
 */
router.get("/elections", authAdminMiddleware, async (req: Request, res: Response) => {
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
router.post("/elections", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, start_time, end_time, banner_color, target_type, target_description } = req.body;

    if (!name || !start_time || !end_time) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["name", "start_time", "end_time"],
      });
      return;
    }

    const lastElection = await db.get<{ id: number }>(
      "SELECT MAX(election_id_blockchain) as id FROM elections"
    );
    const election_id_blockchain = (lastElection?.id || 0) + 1;

    const result = await db.exec(
      `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active,
                              banner_color, target_type, target_description)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [election_id_blockchain, name, description, start_time, end_time,
       banner_color || '#1E3A5F', target_type || 'domain', target_description || null]
    );

    const adminDomain = getAdminDomain(req);
    if (adminDomain) {
      try {
        await db.exec(
          "INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)",
          [result.lastID, adminDomain]
        );
      } catch (e: any) { /* ignore UNIQUE */ }
      await autoAssignUsersByDomain(result.lastID, adminDomain);
    }

    res.json({
      success: true,
      electionId: result.lastID,
      blockchainId: election_id_blockchain,
      message: `Elección "${name}" creada exitosamente`,
    });
  } catch (error) {
    console.error("Error creando elección:", error);
    res.status(500).json({ error: "Error al crear elección" });
  }
});

/**
 * @route PUT /admin/elections/:id
 */
router.put("/elections/:id", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active, banner_color, target_type, target_description } = req.body;

    const sets: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const params: any[] = [];

    if (is_active !== undefined) { sets.push("is_active = ?"); params.push(is_active ? 1 : 0); }
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
 * @route POST /admin/elections/:id/image
 */
router.post("/elections/:id/image", authAdminMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const imageUrl = `data:${mimeType};base64,${base64}`;

    await db.exec("UPDATE elections SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [imageUrl, id]);

    res.json({ success: true, message: 'Image uploaded successfully' });
  } catch (error) {
    console.error("Error uploading election image:", error);
    res.status(500).json({ error: "Error uploading image" });
  }
});

/**
 * @route POST /admin/elections/:id/import-voters
 * CSV import: add voters to an election
 */
router.post("/elections/:id/import-voters", authAdminMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const election = await db.get("SELECT id FROM elections WHERE id = ?", [id]);
    if (!election) {
      res.status(404).json({ error: 'Election not found' });
      return;
    }

    const rows = parseCSV(req.file.buffer);
    const results = { created: 0, added: 0, skipped: 0, errors: [] as string[] };

    for (const row of rows) {
      const email = row.email?.trim();
      const full_name = row.full_name?.trim() || row.name?.trim();
      const student_id = row.student_id?.trim();

      if (!email) {
        results.errors.push(`Row missing email: ${JSON.stringify(row)}`);
        continue;
      }

      // Domain check for non-superadmin
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const emailDomain = email.split('@')[1];
        if (adminDomain && !isSubDomain(emailDomain, adminDomain)) {
          results.errors.push(`Domain not allowed: ${email}`);
          continue;
        }
      }

      let user = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);

      if (!user) {
        if (!full_name || !student_id) {
          results.errors.push(`New user ${email} missing full_name or student_id`);
          continue;
        }
        try {
          const tempPassword = `VTB_${student_id}_temp`;
          const passwordHash = await hashPassword(tempPassword);
          const result = await db.exec(
            `INSERT INTO users (email, password_hash, name, student_id, role,
                               is_approved, approved_by, approved_at, is_eligible)
             VALUES (?, ?, ?, ?, 'student', 1, ?, CURRENT_TIMESTAMP, 1)`,
            [email, passwordHash, full_name, student_id, req.user.userId]
          );
          user = { id: result.lastID };
          results.created++;
        } catch (e: any) {
          results.errors.push(`Error creating user ${email}: ${e.message}`);
          continue;
        }
      }

      try {
        await db.exec(
          "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
          [id, user.id]
        );
        results.added++;
      } catch (e: any) {
        if (e.message?.includes('UNIQUE')) {
          results.skipped++;
        } else {
          results.errors.push(`Error adding ${email} to election: ${e.message}`);
        }
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error("Error importing voters CSV:", error);
    res.status(500).json({ error: "Error importing voters" });
  }
});

/**
 * @route GET /admin/audit
 */
router.get("/audit", authAdminMiddleware, async (req: Request, res: Response) => {
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
router.get("/stats/voters", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await db.run<any>(
      `SELECT
        e.id,
        e.name as election_name,
        COUNT(na.id) as total_voters,
        e.is_active,
        e.created_at
      FROM elections e
      LEFT JOIN nullifier_audit na ON e.id = na.election_id
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
router.get("/registration-requests", authAdminMiddleware, async (req: Request, res: Response) => {
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

    query += " ORDER BY created_at DESC";

    const requests = await db.run<any>(query, params);
    const total = requests?.length || 0;
    const page = parseInt(req.query.page as string) || 1;

    const pageSize = 20;
    const startIdx = (page - 1) * pageSize;
    const paginatedRequests = requests?.slice(startIdx, startIdx + pageSize) || [];

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
router.patch("/registration-requests/:id", authAdminMiddleware, async (req: Request, res: Response) => {
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
    }>(
      "SELECT * FROM registration_requests WHERE id = ?",
      [id]
    );

    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (action === 'approve') {
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && !isSubDomain(requestDomain, adminDomain)) {
          res.status(403).json({ error: "You can only manage requests from your domain" });
          return;
        }
      }

      let passwordHash = request.password_hash;
      let tempPassword: string | null = null;

      if (!passwordHash) {
        tempPassword = `VTB_${request.student_id}_temp`;
        passwordHash = await hashPassword(tempPassword);
      }

      const insertResult = await db.exec(
        `INSERT INTO users (email, password_hash, name, student_id, role,
                           is_approved, approved_by, approved_at, is_eligible, created_at)
         VALUES (?, ?, ?, ?, 'student', 1, ?, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)`,
        [request.email, passwordHash, request.full_name, request.student_id, req.user.userId]
      );

      const newUserId = insertResult.lastID;

      await db.exec(
        "UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );

      const domain = request.email.split('@')[1];
      if (domain) {
        const elections = await db.run<{ election_id: number }>(
          'SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = "*"',
          [domain]
        );

        for (const election of elections) {
          try {
            await db.exec(
              'INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [election.election_id, newUserId]
            );
          } catch (e: any) {
            if (!e.message?.includes('UNIQUE')) {
              console.error(`Error auto-assigning user ${newUserId} to election ${election.election_id}:`, e);
            }
          }
        }
      }

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
router.post("/elections/:id/domains", authAdminMiddleware, async (req: Request, res: Response) => {
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
      if (e.message?.includes("UNIQUE")) {
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
router.post("/elections/:id/voters", authAdminMiddleware, async (req: Request, res: Response) => {
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
      if (e.message?.includes("UNIQUE")) {
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
router.post("/elections/:id/candidates", authAdminMiddleware, async (req: Request, res: Response) => {
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
router.get("/org-units", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    let orgUnits;
    if (isSuperAdmin(req)) {
      orgUnits = await db.run<any>("SELECT * FROM org_units ORDER BY domain ASC");
    } else {
      const adminDomain = getAdminDomain(req);
      orgUnits = await db.run<any>(
        "SELECT * FROM org_units WHERE (domain = ? OR domain LIKE '%.' || ?) ORDER BY domain ASC",
        [adminDomain, adminDomain]
      );
    }
    res.json({ orgUnits: orgUnits || [] });
  } catch (error) {
    console.error("Error getting org units:", error);
    res.status(500).json({ error: "Error getting org units" });
  }
});

/**
 * @route POST /admin/org-units
 */
router.post("/org-units", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, domain, parent_domain, unit_type } = req.body;

    if (!name || !domain) {
      res.status(400).json({ error: "name and domain are required" });
      return;
    }

    // Only superadmin or parent domain admin can create
    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      if (!adminDomain || !isSubDomain(domain, adminDomain)) {
        res.status(403).json({ error: "You can only create org units within your domain" });
        return;
      }
    }

    const result = await db.exec(
      "INSERT INTO org_units (name, domain, parent_domain, unit_type) VALUES (?, ?, ?, ?)",
      [name, domain, parent_domain || null, unit_type || 'institution']
    );

    res.json({ success: true, id: result.lastID, message: `Org unit ${name} created` });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      res.status(409).json({ error: "Domain already exists in org units" });
    } else {
      console.error("Error creating org unit:", error);
      res.status(500).json({ error: "Error creating org unit" });
    }
  }
});

/**
 * @route POST /admin/domain-admins
 */
router.post("/domain-admins", authAdminMiddleware, async (req: Request, res: Response) => {
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
       VALUES (?, ?, ?, ?, 'admin', ?, 1, ?, CURRENT_TIMESTAMP, 1)`,
      [email, passwordHash, name, student_id, admin_domain, req.user.userId]
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
router.get("/domain-admins", authAdminMiddleware, async (req: Request, res: Response) => {
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
router.get("/domains", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    let domains: string[] = [];

    if (isSuperAdmin(req)) {
      const userDomains = await db.run<{ domain: string }>(
        "SELECT DISTINCT substr(email, instr(email, '@') + 1) as domain FROM users WHERE email LIKE '%@%' ORDER BY domain"
      );
      const accessDomains = await db.run<{ domain: string }>(
        "SELECT DISTINCT email_domain as domain FROM election_access WHERE email_domain != '*' ORDER BY email_domain"
      );
      const allDomains = new Set<string>([
        ...userDomains.map((d: any) => d.domain),
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

export default router;
