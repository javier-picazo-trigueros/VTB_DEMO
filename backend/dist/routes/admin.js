import express from "express";
import { getDatabase } from "../config/database.js";
import { verifyToken, hashPassword } from "../utils/auth.js";
const router = express.Router();
const db = getDatabase();
/**
 * Middleware: Verificar que sea admin
 */
const authAdminMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
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
            res.status(403).json({ error: "Acceso denegado. Se requieren permisos de administrador" });
            return;
        }
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(500).json({ error: "Error de autenticación" });
    }
};
/**
 * @route GET /admin/dashboard
 * @desc Obtiene estadísticas principales del sistema
 */
router.get("/dashboard", authAdminMiddleware, async (req, res) => {
    try {
        const totalUsers = await db.get("SELECT COUNT(*) as count FROM users");
        const adminCount = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
        const studentCount = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'student'");
        const totalElections = await db.get("SELECT COUNT(*) as count FROM elections");
        const nullifierAudit = await db.get("SELECT COUNT(*) as count FROM nullifier_audit");
        res.json({
            stats: {
                totalUsers: totalUsers?.count || 0,
                adminCount: adminCount?.count || 0,
                studentCount: studentCount?.count || 0,
                totalElections: totalElections?.count || 0,
                totalNullifiers: nullifierAudit?.count || 0,
            },
        });
    }
    catch (error) {
        console.error("Error en dashboard:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});
/**
 * @route GET /admin/users
 * @desc Lista todos los usuarios
 */
router.get("/users", authAdminMiddleware, async (req, res) => {
    try {
        const users = await db.run("SELECT id, email, name, student_id, role, is_eligible, created_at FROM users ORDER BY created_at DESC");
        res.json({ users: users || [] });
    }
    catch (error) {
        console.error("Error listando usuarios:", error);
        res.status(500).json({ error: "Error al listar usuarios" });
    }
});
/**
 * @route POST /admin/users
 * @desc Crear nuevo usuario (ya existe en auth.ts con validación admin)
 */
router.post("/users", authAdminMiddleware, async (req, res) => {
    try {
        const { email, password, name, student_id, role = "student" } = req.body;
        if (!email || !password || !name || !student_id) {
            res.status(400).json({ error: "Faltan campos requeridos" });
            return;
        }
        // Verificar que email no exista
        const existingUser = await db.get("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser) {
            res.status(409).json({ error: "El email ya está registrado" });
            return;
        }
        // Crear usuario
        const passwordHash = hashPassword(password);
        const result = await db.exec(`
      INSERT INTO users (email, password_hash, name, student_id, role, is_eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [email, passwordHash, name, student_id, role]);
        res.json({
            success: true,
            userId: result.lastID,
            message: `Usuario ${name} creado exitosamente`,
        });
    }
    catch (error) {
        console.error("Error creando usuario:", error);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
});
/**
 * @route DELETE /admin/users/:id
 * @desc Eliminar un usuario
 */
router.delete("/users/:id", authAdminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // Verificar que el usuario existe
        const user = await db.get("SELECT id FROM users WHERE id = ?", [id]);
        if (!user) {
            res.status(404).json({ error: "Usuario no encontrado" });
            return;
        }
        // Eliminar
        await db.exec("DELETE FROM users WHERE id = ?", [id]);
        res.json({ success: true, message: "Usuario eliminado" });
    }
    catch (error) {
        console.error("Error eliminando usuario:", error);
        res.status(500).json({ error: "Error al eliminar usuario" });
    }
});
/**
 * @route GET /admin/elections
 * @desc Lista todas las elecciones
 */
router.get("/elections", authAdminMiddleware, async (req, res) => {
    try {
        const elections = await db.run("SELECT * FROM elections ORDER BY created_at DESC");
        res.json({ elections: elections || [] });
    }
    catch (error) {
        console.error("Error listando elecciones:", error);
        res.status(500).json({ error: "Error al listar elecciones" });
    }
});
/**
 * @route POST /admin/elections
 * @desc Crear nueva votación/elección
 */
router.post("/elections", authAdminMiddleware, async (req, res) => {
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
        const lastElection = await db.get("SELECT MAX(election_id_blockchain) as id FROM elections");
        const election_id_blockchain = (lastElection?.id || 0) + 1;
        const result = await db.exec(`
      INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [election_id_blockchain, name, description, start_time, end_time]);
        res.json({
            success: true,
            electionId: result.lastID,
            blockchainId: election_id_blockchain,
            message: `Elección "${name}" creada exitosamente`,
        });
    }
    catch (error) {
        console.error("Error creando elección:", error);
        res.status(500).json({ error: "Error al crear elección" });
    }
});
/**
 * @route PUT /admin/elections/:id
 * @desc Actualizar elección (activar/desactivar)
 */
router.put("/elections/:id", authAdminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await db.exec("UPDATE elections SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
            is_active ? 1 : 0,
            id,
        ]);
        res.json({ success: true, message: "Elección actualizada" });
    }
    catch (error) {
        console.error("Error actualizando elección:", error);
        res.status(500).json({ error: "Error al actualizar elección" });
    }
});
/**
 * @route GET /admin/audit
 * @desc Ver logs de auditoría (generación de nullifiers)
 */
router.get("/audit", authAdminMiddleware, async (req, res) => {
    try {
        const audit = await db.run(`
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
    `);
        res.json({ audit: audit || [] });
    }
    catch (error) {
        console.error("Error en auditoría:", error);
        res.status(500).json({ error: "Error al obtener auditoría" });
    }
});
/**
 * @route GET /admin/stats/voters
 * @desc Estadísticas de votantes por elección
 */
router.get("/stats/voters", authAdminMiddleware, async (req, res) => {
    try {
        const stats = await db.run(`
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
    `);
        res.json({ stats: stats || [] });
    }
    catch (error) {
        console.error("Error en estadísticas:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});
export default router;
//# sourceMappingURL=admin.js.map