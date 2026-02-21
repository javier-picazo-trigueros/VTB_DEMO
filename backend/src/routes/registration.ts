import express, { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import { verifyToken, hashPassword } from "../utils/auth.js";

const router = express.Router();
const db = getDatabase();

/**
 * @route POST /auth/register-request (BLOQUE 3.1)
 * @desc Solicitar registro (usuario no registrado) - PÚBLICO, sin JWT
 * @body { fullName, email, studentId }
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    const { fullName, email, studentId } = req.body;

    // Validación: campos presentes y no vacíos
    if (!fullName?.trim() || !email?.trim() || !studentId?.trim()) {
      res.status(400).json({
        error: "Faltan campos requeridos: fullName, email, studentId",
      });
      return;
    }

    // Validación: formato de email
    if (!email.includes("@") || !email.includes(".")) {
      res.status(400).json({
        error: "Email inválido",
      });
      return;
    }

    // Comprobar que el email NO existe ya en `users`
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({
        error: "Este email ya tiene una cuenta activa",
      });
      return;
    }

    // Comprobar que NO existe request `pending` con ese email
    const existingRequest = await db.get<{ id: number }>(
      "SELECT id FROM registration_requests WHERE email = ? AND status = 'pending'",
      [email]
    );

    if (existingRequest) {
      res.status(409).json({
        error: "Ya tienes una solicitud pendiente de revisión",
      });
      return;
    }

    // Insertar en registration_requests con status: 'pending'
    const result = await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, status, created_at)
       VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [fullName, email, studentId]
    );

    res.json({
      message: "Solicitud enviada correctamente. Un administrador revisará tu petición en breve.",
    });
  } catch (error) {
    console.error("Error en solicitud de registro:", error);
    res.status(500).json({ error: "Error al procesar solicitud de registro" });
  }
});

export default router;
