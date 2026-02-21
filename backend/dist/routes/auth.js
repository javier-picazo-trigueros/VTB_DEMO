import express from "express";
import { getDatabase } from "../config/database.js";
import { hashPassword, verifyPassword, generateToken, verifyToken, } from "../utils/auth.js";
const router = express.Router();
const db = getDatabase();
/**
 * @route POST /auth/register
 * @desc Registra un nuevo usuario (profesor/estudiante)
 * @body { email, password, name, student_id }
 */
router.post("/register", async (req, res) => {
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
        const existingUser = await db.get("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser) {
            res.status(409).json({ error: "El email ya está registrado" });
            return;
        }
        // Crear usuario
        const passwordHash = await hashPassword(password);
        const result = await db.exec(`
      INSERT INTO users (email, password_hash, name, student_id, is_eligible)
      VALUES (?, ?, ?, ?, 1)
    `, [email, passwordHash, name, student_id]);
        res.json({
            success: true,
            userId: result.lastID,
            message: `Usuario ${name} registrado exitosamente`,
        });
    }
    catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
});
/**
 * @route POST /auth/login
 * @desc Login de usuario, genera JWT puro (sin nullifier)
 * @body { email, password }
 *
 * CAMBIO ARQUITECTÓNICO (1.3):
 * - Ya NO requiere electionId
 * - Ya NO devuelve nullifier
 * - El nullifier se genera en tiempo de votación
 * - Separación clara: JWT = autenticación, nullifier = votación
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({
                error: "Faltan campos requeridos",
                required: ["email", "password"],
            });
            return;
        }
        // Buscar usuario en SQLite
        const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) {
            res.status(401).json({ error: "Email o contraseña incorrectos" });
            return;
        }
        // Verificar elegibilidad para votar
        if (!user.is_eligible) {
            res.status(403).json({
                error: "Usuario no elegible para votar",
            });
            return;
        }
        // Verificar contraseña
        const passwordMatch = await verifyPassword(password, user.password_hash);
        if (!passwordMatch) {
            res.status(401).json({ error: "Email o contraseña incorrectos" });
            return;
        }
        // GENERAR TOKEN SIN NULLIFIER
        // El nullifier se genera en tiempo de votación
        const token = generateToken(user.id, user.email, user.role);
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                student_id: user.student_id,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ error: "Error al iniciar sesión" });
    }
});
/**
 * @route GET /auth/verify
 * @desc Verifica que un JWT sea válido
 * Headers: Authorization: Bearer <token>
 */
router.get("/verify", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ error: "Token no proporcionado" });
            return;
        }
        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        if (!decoded) {
            res.status(401).json({ error: "Token inválido o expirado" });
            return;
        }
        res.json({
            valid: true,
            user: {
                userId: decoded.userId,
                email: decoded.email,
            },
        });
    }
    catch (error) {
        console.error("Error en verificación:", error);
        res.status(500).json({ error: "Error al verificar token" });
    }
});
/**
 * @route POST /auth/admin/register
 * @desc Solo administradores pueden crear nuevos usuarios
 * @body { email, password, name, student_id }
 * @header Authorization: Bearer <token>
 */
router.post("/admin/register", async (req, res) => {
    try {
        const { email, password, name, student_id } = req.body;
        const authHeader = req.headers.authorization;
        // Validar token
        if (!authHeader?.startsWith("Bearer ")) {
            res.status(401).json({ error: "Token requerido" });
            return;
        }
        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        if (!decoded || !decoded.userId) {
            res.status(401).json({ error: "Token inválido" });
            return;
        }
        // Verificar que sea admin
        const admin = await db.get("SELECT role FROM users WHERE id = ?", [decoded.userId]);
        if (!admin || admin.role !== "admin") {
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
        // Verificar que email no exista
        const existingUser = await db.get("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser) {
            res.status(409).json({ error: "El email ya está registrado" });
            return;
        }
        // Crear usuario
        const passwordHash = await hashPassword(password);
        const result = await db.exec(`
      INSERT INTO users (email, password_hash, name, student_id, role, is_eligible)
      VALUES (?, ?, ?, ?, 'student', 1)
    `, [email, passwordHash, name, student_id]);
        res.json({
            success: true,
            userId: result.lastID,
            message: `Usuario ${name} creado exitosamente por el administrador`,
        });
    }
    catch (error) {
        console.error("Error en registro de admin:", error);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
});
/**
 * @route GET /auth/user/:id
 * @desc Obtiene información de usuario (sin datos sensibles)
 */
router.get("/user/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const user = await db.get("SELECT id, email, name, student_id, is_eligible FROM users WHERE id = ?", [
            id,
        ]);
        if (!user) {
            res.status(404).json({ error: "Usuario no encontrado" });
            return;
        }
        res.json({ user });
    }
    catch (error) {
        console.error("Error al obtener usuario:", error);
        res.status(500).json({ error: "Error al obtener información del usuario" });
    }
});
export default router;
//# sourceMappingURL=auth.js.map