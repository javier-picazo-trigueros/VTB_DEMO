import express, { Request, Response } from "express";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateNullifier,
  generateRefreshToken,
  hashRefreshToken,
  generateCsrfToken,
  generateSecureToken,
  hashSecureToken,
  COOKIE_NAME_ACCESS,
  COOKIE_NAME_REFRESH,
  COOKIE_NAME_CSRF,
  REFRESH_TOKEN_TTL_DAYS,
} from "../utils/auth.js";
import { extractToken, requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendPasswordReset } from "../services/email/index.js";
import { forgotIpLimiter, forgotEmailLimiter } from "../middleware/rateLimit.js";

const router = express.Router();
const db = getDatabase();
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NpkrpZqAG';

const IS_PROD = process.env.NODE_ENV === 'production';

const loginSchema = z.object({
  email:    z.string().email('Email inválido').max(254),
  password: z.string().min(1, 'Contraseña requerida').max(128),
});

const registerSchema = z.object({
  email:      z.string().email('Email inválido').max(254),
  password:   z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  name:       z.string().min(2).max(120),
  student_id: z.string().min(1).max(50),
});

/** Shared cookie options for access and refresh tokens. */
function cookieOpts(maxAgeMs: number): object {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: (IS_PROD ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

/** Sets the three session cookies: access JWT, refresh token, CSRF. */
async function setSessionCookies(
  res: Response,
  userId: number,
  email: string,
  role: string,
  adminDomain: string | null,
): Promise<void> {
  const accessToken = generateToken(userId, email, role, adminDomain);
  const csrfToken  = generateCsrfToken(userId, email);
  const { plaintext, hash } = generateRefreshToken();

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000);
  await db.exec(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [userId, hash, expiresAt.toISOString()],
  );

  const ACCESS_MS  = 15 * 60 * 1000;
  const REFRESH_MS = REFRESH_TOKEN_TTL_DAYS * 86400 * 1000;

  res.cookie(COOKIE_NAME_ACCESS, accessToken, cookieOpts(ACCESS_MS));
  res.cookie(COOKIE_NAME_REFRESH, plaintext, {
    ...cookieOpts(REFRESH_MS),
    path: '/auth',
  });
  // CSRF cookie must NOT be httpOnly so the frontend JS can read it.
  res.cookie(COOKIE_NAME_CSRF, csrfToken, {
    httpOnly: false,
    secure: IS_PROD,
    sameSite: (IS_PROD ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: ACCESS_MS,
    path: '/',
  });
}

// requireAuth (from middleware/auth.ts) sustituye al authMiddleware local que estaba aquí.
// Eliminado para evitar duplicación y los "as any" que escondía.

/**
 * @route POST /auth/register
 * @desc Registra un nuevo usuario (profesor/estudiante)
 * @body { email, password, name, student_id }
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }
    const { email, password, name, student_id } = parsed.data;

    // Verificar que email no exista
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    // Crear usuario pendiente de aprobación (is_approved = 0)
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
      message: `Solicitud registrada. Tu cuenta está pendiente de aprobación por un administrador.`,
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
 * CAMBIO ARQUITECTÓNICO (1.3):
 * - Ya NO requiere electionId
 * - Ya NO devuelve nullifier
 * - El nullifier se genera en tiempo de votación
 * - Separación clara: JWT = autenticación, nullifier = votación
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

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
      must_change_password: number;
    }>(
      "SELECT id, email, password_hash, name, student_id, role, is_approved, is_eligible, admin_domain, must_change_password FROM users WHERE email = ? AND deleted_at IS NULL",
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

    await setSessionCookies(res, user.id, user.email, user.role, user.admin_domain);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        student_id: user.student_id,
        role: user.role,
        adminDomain: user.admin_domain,
        mustChangePassword: !!user.must_change_password,
      },
    });
  } catch (error: any) {
    console.error("Login error for", req.body?.email, ":", error.message);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});
/**
 * @route GET /auth/verify
 * @desc Verifica que un JWT sea válido
 * Headers: Authorization: Bearer <token>
 */
router.get("/verify", async (req: Request, res: Response) => {
  try {
    const raw = extractToken(req);
    if (!raw) {
      res.status(401).json({ error: "Token no proporcionado" });
      return;
    }
    const decoded = verifyToken(raw);

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
  } catch (error) {
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
router.post("/admin/register", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, student_id } = req.body;
    const adminUser = req.user!;

    // Validaciones
    if (!email || !password || !name || !student_id) {
      res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["email", "password", "name", "student_id"],
      });
      return;
    }

    // Admin de dominio: solo puede crear usuarios de su mismo dominio
    if (adminUser.role !== "superadmin" && adminUser.adminDomain) {
      const emailDomain = email.split("@")[1];
      if (emailDomain !== adminUser.adminDomain) {
        res.status(403).json({
          error: `Solo puedes crear usuarios del dominio @${adminUser.adminDomain}`,
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
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    // Los usuarios creados por admins quedan auto-aprobados
    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, approved_by, approved_at, is_eligible)
       VALUES (?, ?, ?, ?, 'student', 1, ?, CURRENT_TIMESTAMP, 1)`,
      [email, passwordHash, name, student_id, adminUser.userId]
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
 * @desc Validates the session cookie and returns the current user.
 *       Used by the frontend AuthContext on every mount to hydrate state.
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await db.get<{
      id: number; email: string; name: string;
      role: string; admin_domain: string | null;
    }>(
      "SELECT id, email, name, role, admin_domain FROM users WHERE id = ? AND deleted_at IS NULL",
      [req.user!.userId]
    );
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
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
    res.status(500).json({ error: "Error interno del servidor" });
  }
});


/**
 * @route PATCH /auth/change-password
 * @desc Allows an authenticated user to change their own password
 * @header Authorization: Bearer <token>
 * @body { currentPassword, newPassword }
 */
router.patch("/change-password", requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user!.userId;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Debes indicar la contraseña actual y la nueva" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  try {
    const user = await db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [userId]);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      res.status(401).json({ error: "La contraseña actual no es correcta" });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await db.exec(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
      [newHash, userId]
    );
    res.json({ success: true, message: "Contraseña actualizada correctamente" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route GET /auth/me/profile
 * @desc Returns full profile with academic info for the authenticated user
 */
router.get("/me/profile", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const user = await db.get<{
      id: number; email: string; name: string; student_id: string;
      role: string; admin_domain: string | null;
      school: string | null; degree: string | null; year: number | null;
      study_group: string | null; created_at: string;
    }>(
      `SELECT id, email, name, student_id, role, admin_domain,
              school, degree, year, study_group, created_at
       FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
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
router.patch("/me/profile", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, school, degree, year, study_group } = req.body;

  if (name !== undefined && (!name || name.trim().length < 2)) {
    res.status(400).json({ error: "El nombre debe tener al menos 2 caracteres" });
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

    const updated = await db.get<{
      id: number; email: string; name: string; student_id: string;
      role: string; admin_domain: string | null;
      school: string | null; degree: string | null; year: number | null;
      study_group: string | null; created_at: string;
    }>(
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

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * @route POST /auth/refresh
 * @desc Issues a new 15-min access token using the refresh cookie.
 *       No CSRF required here (the refresh cookie is httpOnly; attacker can't
 *       initiate a useful refresh without already having the cookie AND the
 *       resulting token—which they also can't read because it's httpOnly).
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const plaintext = (req as any).cookies?.[COOKIE_NAME_REFRESH];
  if (!plaintext) {
    return res.status(401).json({ error: 'No hay refresh token' });
  }

  const hash = hashRefreshToken(plaintext);
  const stored = await db.get<{
    user_id: number; expires_at: string; revoked: number;
  }>(
    `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?`,
    [hash],
  );

  if (!stored || stored.revoked || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }

  const user = await db.get<{
    id: number; email: string; role: string; admin_domain: string | null; is_approved: number;
  }>(
    'SELECT id, email, role, admin_domain, is_approved FROM users WHERE id = ? AND deleted_at IS NULL',
    [stored.user_id],
  );

  if (!user || !user.is_approved) {
    return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
  }

  // Revoke old token and issue a new pair (rotation)
  await db.exec('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [hash]);
  await setSessionCookies(res, user.id, user.email, user.role, user.admin_domain);

  res.json({ success: true });
});

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * @route POST /auth/logout
 * @desc Revokes the refresh token in DB and clears all session cookies.
 *       True invalidation: even if someone captures the access cookie, it
 *       expires in ≤15 min and the refresh token is already dead.
 */
router.post('/logout', async (req: Request, res: Response) => {
  const plaintext = (req as any).cookies?.[COOKIE_NAME_REFRESH];
  if (plaintext) {
    const hash = hashRefreshToken(plaintext);
    await db.exec('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [hash]).catch(() => {});
  }

  const clearOpts = { httpOnly: true, secure: IS_PROD, sameSite: (IS_PROD ? 'none' : 'lax') as 'none' | 'lax' };
  res.clearCookie(COOKIE_NAME_ACCESS,  { ...clearOpts, path: '/' });
  res.clearCookie(COOKIE_NAME_REFRESH, { ...clearOpts, path: '/auth' });
  res.clearCookie(COOKIE_NAME_CSRF,    { path: '/' });

  res.json({ success: true });
});

// ── Recuperación de contraseña ────────────────────────────────────────────────

const RESET_TTL_MINUTES = 15;

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token:    z.string().min(64).max(64),
  password: z.string().min(8).max(128),
});

/**
 * @route POST /auth/forgot-password
 * @desc  Genera un token de un solo uso y envía email con enlace de reset.
 *        Responde siempre 200 (no revela si el email existe).
 */
router.post('/forgot-password', forgotIpLimiter, forgotEmailLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();

    // Respuesta genérica independientemente del resultado
    res.json({ success: true, message: 'Si el email existe, recibirás un enlace en breve.' });

    // Buscar usuario (asíncrono, después de responder)
    const user = await db.get<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL',
      [email],
    );
    if (!user) return;

    // Invalidar tokens anteriores del mismo tipo
    await db.exec(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND type = 'reset' AND used_at IS NULL`,
      [user.id],
    );

    const { plaintext, hash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    await db.exec(
      `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at)
       VALUES (?, ?, 'reset', ?)`,
      [user.id, hash, expiresAt.toISOString()],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    sendPasswordReset({
      to: email,
      name: user.name,
      resetUrl: `${frontendUrl}/auth/reset-password?token=${plaintext}`,
      expiresAt,
    });
  } catch (err) {
    console.error('Error en forgot-password:', err);
    // La respuesta 200 ya fue enviada; solo logamos el error
  }
});

/**
 * @route POST /auth/reset-password
 * @desc  Valida el token de un solo uso y actualiza la contraseña.
 *        Funciona tanto para reset como para activación de cuenta por invitación.
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }
    const { token, password } = parsed.data;
    const hash = hashSecureToken(token);

    const row = await db.get<{
      id: number;
      user_id: number;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
        WHERE token_hash = ?`,
      [hash],
    );

    if (!row || row.used_at !== null) {
      res.status(400).json({ error: 'El enlace no es válido o ya fue utilizado.' });
      return;
    }
    if (new Date(row.expires_at) < new Date()) {
      res.status(400).json({ error: 'El enlace ha caducado. Solicita uno nuevo.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    await db.exec(
      `UPDATE users
          SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [passwordHash, row.user_id],
    );
    await db.exec(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.id],
    );

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;

