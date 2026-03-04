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

    // Verificar que sea admin
    const admin = await db.get<{ role: string }>(
      "SELECT role FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (!admin || admin.role !== "admin") {
      res.status(403).json({ error: "Acceso denegado. Se requieren permisos de administrador" });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(500).json({ error: "Error de autenticación" });
  }
};

/**
 * @route GET /admin/dashboard
 * @desc Obtiene estadísticas principales del sistema
 */
router.get("/dashboard", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const totalUsers = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM users"
    );

    const adminCount = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    );

    const studentCount = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'student'"
    );

    const totalElections = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM elections"
    );

    const nullifierAudit = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM nullifier_audit"
    );

    res.json({
      stats: {
        totalUsers: totalUsers?.count || 0,
        adminCount: adminCount?.count || 0,
        studentCount: studentCount?.count || 0,
        totalElections: totalElections?.count || 0,
        totalNullifiers: nullifierAudit?.count || 0,
      },
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * @route GET /admin/users
 * @desc Lista todos los usuarios
 */
router.get("/users", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const users = await db.run<any>(
      "SELECT id, email, name, student_id, role, is_eligible, created_at FROM users ORDER BY created_at DESC"
    );

    res.json({ users: users || [] });
  } catch (error) {
    console.error("Error listando usuarios:", error);
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

/**
 * @route POST /admin/users
 * @desc Crear nuevo usuario (ya existe en auth.ts con validación admin)
 */
router.post("/users", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { email, password, name, student_id, role = "student" } = req.body;

    if (!email || !password || !name || !student_id) {
      res.status(400).json({ error: "Faltan campos requeridos" });
      return;
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

    // Crear usuario
    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `
      INSERT INTO users (email, password_hash, name, student_id, role, is_eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      [email, passwordHash, name, student_id, role]
    );

    res.json({
      success: true,
      userId: result.lastID,
      message: `Usuario ${name} creado exitosamente`,
    });
  } catch (error) {
    console.error("Error creando usuario:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

/**
 * @route DELETE /admin/users/:id
 * @desc Eliminar un usuario
 */
router.delete("/users/:id", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const user = await db.get<{ id: number }>("SELECT id FROM users WHERE id = ?", [id]);

    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    // Eliminar
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
    const elections = await db.run<any>(
      "SELECT * FROM elections ORDER BY created_at DESC"
    );

    res.json({ elections: elections || [] });
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
    const audit = await db.run<any>(
      `
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
      ORDER BY na.generated_at DESC
      LIMIT 100
    `
    );

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

    let query = "SELECT * FROM registration_requests";
    const params: any[] = [];

    if (status !== 'all') {
      query += " WHERE status = ?";
      params.push(status);
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
    }>(
      "SELECT * FROM registration_requests WHERE id = ?",
      [id]
    );

    if (!request) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }

    if (action === 'approve') {
      // Crear usuario con contraseña temporal: VTB_${studentId}_temp
      const tempPassword = `VTB_${request.student_id}_temp`;
      const passwordHash = await hashPassword(tempPassword);

      // Insertar usuario
      const insertResult = await db.exec(
        `INSERT INTO users (email, password_hash, name, student_id, role, is_eligible, created_at)
         VALUES (?, ?, ?, ?, 'student', 1, CURRENT_TIMESTAMP)`,
        [request.email, passwordHash, request.full_name, request.student_id]
      );

      const newUserId = insertResult.lastID;

      // Actualizar solicitud como aprobada
      await db.exec(
        "UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );

      // --- ASIGNACIÓN AUTOMÁTICA POR DOMINIO ---
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
            // Ignorar error de UNIQUE constraint si ya estaba asignado
            if (!e.message?.includes('UNIQUE')) {
              console.error(`Error auto-asignando usuario ${newUserId} a elección ${election.election_id}:`, e);
            }
          }
        }
      }

      res.json({
        message: "Usuario aprobado y asignado a elecciones correspondientes",
        tempPassword, // Para que el admin pueda comunicársela
      });

    } else if (action === 'reject') {
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

export default router;
