import express, { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateNullifier,
} from "../utils/auth.js";

const router = express.Router();
const db = getDatabase();
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NpkrpZqAG';

/**
 * Middleware: validates any authenticated user (not just admin)
 */
const authMiddleware = async (req: Request, res: Response, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token requerido" });
      return;
    }
    const token = authHeader.substring(7);
    const decoded = verifyToken(token) as any;
    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: "Token invÃ¡lido" });
      return;
    }
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(500).json({ error: "Error de autenticaciÃ³n" });
  }
};

/**
 * @route POST /auth/register
 * @desc Registra un nuevo usuario (profesor/estudiante)
 * @body { email, password, name, student_id }
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, student_id } = req.body;

    // Validaciones
    if (!email || !password || !name || !student_id) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["email", "password", "name", "student_id"],
      });
      return;
    }

    // Verificar que email no exista
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({ error: "El email ya estÃ¡ registrado" });
      return;
    }

    // Crear usuario pendiente de aprobaciÃ³n (is_approved = 0)
    // Los usuarios registrados directamente deben ser aprobados por un admin
    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, is_approved, is_eligible)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [email, passwordHash, name, student_id]
    );

    res.status(201).json({
      success: true,
      userId: result.lastID,
      message: `Solicitud registrada. Tu cuenta estÃ¡ pendiente de aprobaciÃ³n por un administrador.`,
    });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

/**
 * @route POST /auth/login
 * @desc Login de usuario, genera JWT puro (sin nullifier)
 * @body { email, password }
 *
 * CAMBIO ARQUITECTÃ“NICO (1.3):
 * - Ya NO requiere electionId
 * - Ya NO devuelve nullifier
 * - El nullifier se genera en tiempo de votaciÃ³n
 * - SeparaciÃ³n clara: JWT = autenticaciÃ³n, nullifier = votaciÃ³n
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["email", "password"],
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await db.get<{
      id: number;
      email: string;
      password_hash: string;
      name: string;
      student_id: string;
      role: string;
      is_approved: boolean;
      is_eligible: boolean;
      admin_domain: string | null;
    }>(
      "SELECT id, email, password_hash, name, student_id, role, is_approved, is_eligible, admin_domain FROM users WHERE email = ?",
      [normalizedEmail]
    );

    const passwordMatch = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!user || !passwordMatch || !user.is_approved) {
      if (user && !user.is_approved) {
        res.status(403).json({
          error: "Tu cuenta está pendiente de aprobación por un administrador",
          code: "ACCOUNT_PENDING_APPROVAL",
        });
        return;
      }
      res.status(401).json({ error: "Email o contraseña incorrectos" });
      return;
    }

    const token = generateToken(user.id, user.email, user.role, user.admin_domain);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        student_id: user.student_id,
        role: user.role,
        adminDomain: user.admin_domain,
      },
    });
  } catch (error: any) {
    console.error("Login error for", req.body?.email, ":", error.message);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});
/**
 * @route GET /auth/verify
 * @desc Verifica que un JWT sea vÃ¡lido
 * Headers: Authorization: Bearer <token>
 */
router.get("/verify", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token no proporcionado" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({ error: "Token invÃ¡lido o expirado" });
      return;
    }

    res.json({
      valid: true,
      user: {
        userId: decoded.userId,
        email: decoded.email,
      },
    });
  } catch (error) {
    console.error("Error en verificaciÃ³n:", error);
    res.status(500).json({ error: "Error al verificar token" });
  }
});

/**
 * @route POST /auth/admin/register
 * @desc Solo administradores pueden crear nuevos usuarios
 * @body { email, password, name, student_id }
 * @header Authorization: Bearer <token>
 */
router.post("/admin/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, student_id } = req.body;
    const authHeader = req.headers.authorization;

    // Validar token
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token requerido" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token) as any;

    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: "Token invÃ¡lido" });
      return;
    }

    // Verificar que sea admin o superadmin
    const admin = await db.get<{ role: string; admin_domain: string | null }>(
      "SELECT role, admin_domain FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      res.status(403).json({ error: "Solo administradores pueden crear usuarios" });
      return;
    }

    // Validaciones
    if (!email || !password || !name || !student_id) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["email", "password", "name", "student_id"],
      });
      return;
    }

    // Admin de dominio: solo puede crear usuarios de su mismo dominio
    if (admin.role !== "superadmin" && admin.admin_domain) {
      const emailDomain = email.split("@")[1];
      if (emailDomain !== admin.admin_domain) {
        res.status(403).json({
          error: `Solo puedes crear usuarios del dominio @${admin.admin_domain}`,
        });
        return;
      }
    }

    // Verificar que email no exista
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({ error: "El email ya estÃ¡ registrado" });
      return;
    }

    // Los usuarios creados por admins quedan auto-aprobados
    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, approved_by, approved_at, is_eligible)
       VALUES (?, ?, ?, ?, 'student', 1, ?, CURRENT_TIMESTAMP, 1)`,
      [email, passwordHash, name, student_id, decoded.userId]
    );

    res.json({
      success: true,
      userId: result.lastID,
      message: `Usuario ${name} creado y aprobado exitosamente`,
    });
  } catch (error) {
    console.error("Error en registro de admin:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

/**
 * @route GET /auth/me
 * @desc Validates JWT and returns current user â€” used for session persistence check
 * Headers: Authorization: Bearer <token>
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token no proporcionado" });
      return;
    }
    const token = authHeader.substring(7);
    const decoded = verifyToken(token) as any;
    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: "Token invÃ¡lido o expirado" });
      return;
    }
    const user = await db.get<{
      id: number; email: string; name: string;
      role: string; admin_domain: string | null;
    }>(
      "SELECT id, email, name, role, admin_domain FROM users WHERE id = ?",
      [decoded.userId]
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminDomain: user.admin_domain || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @route GET /auth/user/:id
 * @desc Obtiene informaciÃ³n de usuario (sin datos sensibles)
 */
router.get("/user/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db.get<{
      id: number;
      email: string;
      name: string;
      student_id: string;
      is_eligible: boolean;
    }>("SELECT id, email, name, student_id, is_eligible FROM users WHERE id = ?", [
      id,
    ]);

    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    res.status(500).json({ error: "Error al obtener informaciÃ³n del usuario" });
  }
});

/**
 * @route PATCH /auth/change-password
 * @desc Allows an authenticated user to change their own password
 * @header Authorization: Bearer <token>
 * @body { currentPassword, newPassword }
 */
router.patch("/change-password", authMiddleware, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = (req as any).user?.userId;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Both passwords are required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    const user = await db.get<any>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await db.exec("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, userId]);
    res.json({ success: true, message: "Password updated successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route GET /auth/me/profile
 * @desc Returns full profile with academic info for the authenticated user
 */
router.get("/me/profile", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  try {
    const user = await db.get<any>(
      `SELECT id, email, name, student_id, role, admin_domain,
              school, degree, year, study_group, created_at
       FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route PATCH /auth/me/profile
 * @desc Updates editable profile fields for the authenticated user
 */
router.patch("/me/profile", authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { name, school, degree, year, study_group } = req.body;

  if (name !== undefined && (!name || name.trim().length < 2)) {
    res.status(400).json({ error: "Name must be at least 2 characters" });
    return;
  }

  try {
    await db.exec(
      `UPDATE users SET
        name = COALESCE(?, name),
        school = COALESCE(?, school),
        degree = COALESCE(?, degree),
        year = COALESCE(?, year),
        study_group = COALESCE(?, study_group)
       WHERE id = ?`,
      [
        name?.trim() || null,
        school || null,
        degree || null,
        year !== undefined ? year : null,
        study_group || null,
        userId,
      ]
    );

    const updated = await db.get<any>(
      `SELECT id, email, name, student_id, role, admin_domain,
              school, degree, year, study_group, created_at
       FROM users WHERE id = ?`,
      [userId]
    );
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

