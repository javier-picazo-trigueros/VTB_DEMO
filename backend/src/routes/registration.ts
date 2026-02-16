import express, { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import { generateToken } from "../utils/auth.js";

const router = express.Router();
const db = getDatabase();

/**
 * @route POST /registration/request
 * @desc Solicitar registro (usuario no registrado)
 * @body { email, name, student_id }
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    const { email, name, student_id } = req.body;

    if (!email || !name || !student_id) {
      res.status(400).json({
        error: "Faltan campos requeridos: email, name, student_id",
      });
      return;
    }

    // Verificar si el usuario ya existe
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    // Verificar si ya hay solicitud pendiente
    const existingRequest = await db.get<{ id: number }>(
      "SELECT id FROM registration_requests WHERE email = ? AND status = 'pending'",
      [email]
    );

    if (existingRequest) {
      res.status(409).json({ error: "Ya existe una solicitud pendiente para este email" });
      return;
    }

    // Crear solicitud de registro
    const result = await db.exec(
      `
      INSERT INTO registration_requests (email, name, student_id, status, requested_at)
      VALUES (?, ?, ?, 'pending', datetime('now'))
    `,
      [email, name, student_id]
    );

    res.json({
      success: true,
      requestId: result.lastID,
      message: "Solicitud de registro enviada. Un administrador la revisará pronto.",
    });
  } catch (error) {
    console.error("Error en solicitud de registro:", error);
    res.status(500).json({ error: "Error al procesar solicitud de registro" });
  }
});

/**
 * @route GET /registration/requests
 * @desc Obtener todas las solicitudes de registro (para admins)
 * @header Authorization: Bearer <token>
 */
router.get("/requests", async (req: Request, res: Response) => {
  try {
    // Verificar que sea admin (middleware debería validar)
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Token requerido" });
      return;
    }

    const requests = await db.run<any>(
      `SELECT * FROM registration_requests 
       WHERE status = 'pending' 
       ORDER BY requested_at DESC`
    );

    res.json({ requests: requests || [] });
  } catch (error) {
    console.error("Error obteniendo solicitudes:", error);
    res.status(500).json({ error: "Error al obtener solicitudes" });
  }
});

/**
 * @route POST /registration/approve/:requestId
 * @desc Aprobar solicitud de registro
 * @body { password }
 */
router.post("/approve/:requestId", async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: "Contraseña requerida" });
      return;
    }

    // Obtener solicitud
    const request = await db.get<{ email: string; name: string; student_id: string }>(
      "SELECT email, name, student_id FROM registration_requests WHERE id = ? AND status = 'pending'",
      [requestId]
    );

    if (!request) {
      res.status(404).json({ error: "Solicitud no encontrada o ya procesada" });
      return;
    }

    // Importar hashPassword del utils
    const { hashPassword } = await import("../utils/auth.js");
    const passwordHash = hashPassword(password);

    // Crear usuario
    await db.exec(
      `
      INSERT INTO users (email, password_hash, name, student_id, role, is_eligible)
      VALUES (?, ?, ?, ?, 'student', 1)
    `,
      [request.email, passwordHash, request.name, request.student_id]
    );

    // Marcar solicitud como aprobada
    await db.exec(
      "UPDATE registration_requests SET status = 'approved', processed_at = datetime('now') WHERE id = ?",
      [requestId]
    );

    res.json({
      success: true,
      message: `Usuario ${request.email} registrado exitosamente`,
    });
  } catch (error) {
    console.error("Error aprobando solicitud:", error);
    res.status(500).json({ error: "Error al aprobar solicitud" });
  }
});

/**
 * @route POST /registration/reject/:requestId
 * @desc Rechazar solicitud de registro
 * @body { reason }
 */
router.post("/reject/:requestId", async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    // Marcar solicitud como rechazada
    await db.exec(
      "UPDATE registration_requests SET status = 'rejected', reason = ?, processed_at = datetime('now') WHERE id = ?",
      [reason || "No especificado", requestId]
    );

    res.json({
      success: true,
      message: "Solicitud rechazada",
    });
  } catch (error) {
    console.error("Error rechazando solicitud:", error);
    res.status(500).json({ error: "Error al rechazar solicitud" });
  }
});

/**
 * @route GET /registration/elections-by-email/:email
 * @desc Obtener elecciones disponibles para un email
 */
router.get("/elections-by-email/:email", async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    // Extraer dominio del email
    const domain = email.split("@")[1];

    if (!domain) {
      res.status(400).json({ error: "Email inválido" });
      return;
    }

    // Buscar elecciones para este dominio
    const elections = await db.run<any>(
      `SELECT e.* FROM elections e
       JOIN election_access ea ON e.id = ea.election_id
       WHERE ea.email_domain = ? AND e.is_active = 1
       ORDER BY e.start_time ASC`,
      [domain]
    );

    res.json({
      domain,
      elections: elections || [],
      message: elections?.length === 0 ? "No hay elecciones disponibles para tu dominio" : undefined,
    });
  } catch (error) {
    console.error("Error obteniendo elecciones:", error);
    res.status(500).json({ error: "Error al obtener elecciones" });
  }
});

export default router;
