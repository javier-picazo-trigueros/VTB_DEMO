import express, { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import { verifyToken, hashPassword, generateToken } from "../utils/auth.js";
import { ethers } from "ethers";

const router = express.Router();
const db = getDatabase();

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

/**
 * @route GET /admin/dashboard
 * @desc Obtiene estadísticas principales del sistema
 */
router.get("/dashboard", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const adminDomain = getAdminDomain(req);
    const isSuper = isSuperAdmin(req);

    let totalUsers, adminCount, studentCount, totalElections, nullifierAudit;

    let pendingApproval;

    if (isSuper) {
      totalUsers = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users");
      adminCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role IN ('admin','superadmin')");
      studentCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role IN ('student','voter')");
      totalElections = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM elections");
      nullifierAudit = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM nullifier_audit");
      pendingApproval = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE is_approved = 0");
    } else {
      totalUsers = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE email LIKE '%@' || ? AND role NOT IN ('superadmin')",
        [adminDomain]
      );
      adminCount = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND admin_domain = ?",
        [adminDomain]
      );
      studentCount = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE role IN ('student','voter') AND email LIKE '%@' || ?",
        [adminDomain]
      );
      totalElections = await db.get<{ count: number }>(
        "SELECT COUNT(DISTINCT e.id) as count FROM elections e JOIN election_access ea ON e.id = ea.election_id WHERE ea.email_domain = ?",
        [adminDomain]
      );
      nullifierAudit = await db.get<{ count: number }>(
        "SELECT COUNT(na.id) as count FROM nullifier_audit na JOIN users u ON na.user_id = u.id WHERE u.email LIKE '%@' || ?",
        [adminDomain]
      );
      pendingApproval = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE is_approved = 0 AND email LIKE '%@' || ?",
        [adminDomain]
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
 * @desc Lista todos los usuarios (filtrado por dominio para admins de dominio)
 * @query approved - 'all' (default), 'true', 'false'
 */
router.get("/users", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const approvedFilter = req.query.approved as string;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      conditions.push("email LIKE '%@' || ?");
      params.push(adminDomain);
      // Admin de dominio no puede ver otros admins de dominio ni superadmins
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
 * @desc Crear nuevo usuario (auto-aprobado al ser creado por un admin)
 */
router.post("/users", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { email, password, name, student_id, role = "student", admin_domain = null } = req.body;

    if (!email || !password || !name || !student_id) {
      res.status(400).json({ error: "Faltan campos requeridos" });
      return;
    }

    // Admin de dominio: solo puede crear usuarios de su mismo dominio
    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      const emailDomain = email.split("@")[1];
      if (adminDomain && emailDomain !== adminDomain) {
        res.status(403).json({
          error: `Solo puedes crear usuarios del dominio @${adminDomain}`,
        });
        return;
      }
      // Admin de dominio no puede crear superadmins ni admins de otros dominios
      if (role === "superadmin") {
        res.status(403).json({ error: "No tienes permisos para crear superadministradores" });
        return;
      }
    }

    // Verificar que email no exista
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    // Los usuarios creados directamente por admins quedan auto-aprobados
    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain,
                         is_approved, approved_by, approved_at, is_eligible)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, 1)`,
      [email, passwordHash, name, student_id, role, admin_domain, req.user.userId]
    );

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
 * @route PATCH /admin/users/:id/approval
 * @desc Aprobar o revocar la aprobación de una cuenta de usuario
 * @body { approved: boolean, reason?: string }
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

    // Admin de dominio: solo puede aprobar/revocar usuarios de su dominio
    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      const userDomain = targetUser.email.split("@")[1];
      if (adminDomain && userDomain !== adminDomain) {
        res.status(403).json({ error: "No tienes permisos para gestionar usuarios de otro dominio" });
        return;
      }
      // No puede aprobar/revocar superadmins ni otros admins
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
 * @desc Eliminar un usuario (solo del mismo dominio para admins de dominio)
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

    // Admin de dominio: solo puede eliminar usuarios de su dominio y no puede eliminar admins
    if (!isSuperAdmin(req)) {
      const adminDomain = getAdminDomain(req);
      const userDomain = user.email.split("@")[1];
      if (adminDomain && userDomain !== adminDomain) {
        res.status(403).json({ error: "No tienes permisos para eliminar usuarios de otro dominio" });
        return;
      }
      if (user.role === "superadmin" || user.role === "admin") {
        res.status(403).json({ error: "No tienes permisos para eliminar administradores" });
        return;
      }
    }

    // Evitar que un admin se elimine a sí mismo
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
 * @desc Lista todas las elecciones
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
        "SELECT DISTINCT e.* FROM elections e JOIN election_access ea ON e.id = ea.election_id WHERE ea.email_domain = ? ORDER BY e.created_at DESC",
        [adminDomain]
      );
    }

    const electionList = elections || [];
    for (const election of electionList) {
      const domains = await db.run<any>(
        "SELECT email_domain FROM election_access WHERE election_id = ?",
        [election.id]
      );
      election.domains = domains.map((d: any) => d.email_domain);
    }

    res.json({ elections: electionList });
  } catch (error) {
    console.error("Error listando elecciones:", error);
    res.status(500).json({ error: "Error al listar elecciones" });
  }
});

/**
 * @route POST /admin/elections
 * @desc Crear nueva votación/elección
 */
router.post("/elections", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, start_time, end_time } = req.body;

    if (!name || !start_time || !end_time) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["name", "start_time", "end_time"],
      });
      return;
    }

    // Generar election_id_blockchain único
    const lastElection = await db.get<{ id: number }>(
      "SELECT MAX(election_id_blockchain) as id FROM elections"
    );
    const election_id_blockchain = (lastElection?.id || 0) + 1;

    const result = await db.exec(
      `
      INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      [election_id_blockchain, name, description, start_time, end_time]
    );

    // If domain admin, automatically add their domain to election_access
    const adminDomain = getAdminDomain(req);
    if (adminDomain) {
      try {
        await db.exec(
          "INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)",
          [result.lastID, adminDomain]
        );
      } catch (e: any) {
        // Ignore UNIQUE constraint
      }
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
 * @desc Actualizar elección (activar/desactivar)
 */
router.put("/elections/:id", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    await db.exec("UPDATE elections SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      is_active ? 1 : 0,
      id,
    ]);

    res.json({ success: true, message: "Elección actualizada" });
  } catch (error) {
    console.error("Error actualizando elección:", error);
    res.status(500).json({ error: "Error al actualizar elección" });
  }
});

/**
 * @route GET /admin/audit
 * @desc Ver logs de auditoría (generación de nullifiers)
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
      query += " WHERE u.email LIKE '%@' || ?";
      params.push(adminDomain);
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
 * @desc Estadísticas de votantes por elección
 */
router.get("/stats/voters", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await db.run<any>(
      `
      SELECT 
        e.id,
        e.name as election_name,
        COUNT(na.id) as total_voters,
        e.is_active,
        e.created_at
      FROM elections e
      LEFT JOIN nullifier_audit na ON e.id = na.election_id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `
    );

    res.json({ stats: stats || [] });
  } catch (error) {
    console.error("Error en estadísticas:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * @route GET /admin/registration-requests (BLOQUE 3.1)
 * @desc Obtener solicitudes de registro filtradas por status
 * @query status - 'pending' (default), 'approved', 'rejected', 'all'
 * @protected Admin only
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
      conditions.push("email LIKE '%@' || ?");
      params.push(adminDomain);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY created_at DESC";

    const requests = await db.run<any>(query, params);
    const total = requests?.length || 0;
    const page = parseInt(req.query.page as string) || 1;

    // Paginación simple
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
 * @route PATCH /admin/registration-requests/:id (BLOQUE 3.1)
 * @desc Aprobar o rechazar una solicitud de registro
 * @body { action: 'approve' | 'reject', reason?: string }
 * @protected Admin only
 */
router.patch("/registration-requests/:id", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    // Validar parámetros
    if (!action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({ error: "Acción inválida. Use 'approve' o 'reject'" });
      return;
    }

    // Obtener solicitud
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
      // Domain admin: verify request email matches admin domain
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && requestDomain !== adminDomain) {
          res.status(403).json({ error: "You can only manage requests from your domain" });
          return;
        }
      }

      // Use the password hash the user provided during registration
      // If they didn't provide one (legacy request), generate a temp password
      let passwordHash = request.password_hash;
      let tempPassword: string | null = null;
      
      if (!passwordHash) {
        tempPassword = `VTB_${request.student_id}_temp`;
        passwordHash = await hashPassword(tempPassword);
      }

      // Insertar usuario aprobado con referencia al admin que aprobó
      const insertResult = await db.exec(
        `INSERT INTO users (email, password_hash, name, student_id, role,
                           is_approved, approved_by, approved_at, is_eligible, created_at)
         VALUES (?, ?, ?, ?, 'student', 1, ?, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)`,
        [request.email, passwordHash, request.full_name, request.student_id, req.user.userId]
      );

      const newUserId = insertResult.lastID;

      // Update request as approved
      await db.exec(
        "UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );

      // --- AUTO-ASSIGN TO ELECTIONS BY DOMAIN ---
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
        tempPassword, // Only set for legacy requests without password_hash
      });

    } else if (action === 'reject') {
      // Admin de dominio: solo puede rechazar solicitudes de su dominio
      if (!isSuperAdmin(req)) {
        const adminDomain = getAdminDomain(req);
        const requestDomain = request.email.split('@')[1];
        if (adminDomain && requestDomain !== adminDomain) {
          res.status(403).json({ error: "No tienes permisos para gestionar solicitudes de otro dominio" });
          return;
        }
      }

      // Motivo es obligatorio si action es reject
      if (!reason?.trim()) {
        res.status(400).json({ error: "El motivo de rechazo es obligatorio" });
        return;
      }

      // Actualizar solicitud como rechazada
      await db.exec(
        "UPDATE registration_requests SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [reason, id]
      );

      res.json({
        message: "Solicitud rechazada",
      });
    }

  } catch (error) {
    console.error("Error procesando solicitud:", error);
    res.status(500).json({ error: "Error al procesar solicitud" });
  }
});

/**
 * @route POST /admin/elections/:id/domains
 * @desc Añadir un dominio permitido a una elección
 * @body { domain: string }
 * @protected Admin only
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
 * @desc Añadir individualmente un usuario a una elección (por email)
 * @body { email: string }
 * @protected Admin only
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
 * @desc Añadir un candidato a una elección
 * @body { name: string, description: string }
 * @protected Admin only
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
 * @route POST /admin/domain-admins
 * @desc Crear un administrador de dominio (solo superadmin)
 * @body { email, password, name, student_id, admin_domain }
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

    // El email del admin debe coincidir con su propio dominio de administración
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
 * @desc Lista todos los administradores de dominio (solo superadmin)
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

export default router;
