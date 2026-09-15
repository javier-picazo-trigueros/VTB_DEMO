import express, { Request, Response } from "express";
import { z } from "zod";
import { getDbClient, withTransaction, type DbClient } from "../db/index.js";
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
import { formatError } from "../utils/errors.js";

const router = express.Router();
const db = getDbClient();
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

/**
 * Sets the three session cookies: access JWT, refresh token, CSRF.
 *
 * `client` permite pasar el cliente de una transacción en curso. Lo usa la
 * rotación de /auth/refresh, donde revocar el token viejo y emitir el nuevo
 * tienen que ser una sola operación. Por defecto usa el cliente general, que es
 * lo correcto en el login (una sola escritura, sin nada que coordinar).
 */
async function setSessionCookies(
  res: Response,
  userId: number,
  email: string,
  role: string,
  adminDomain: string | null,
  client: DbClient = db,
): Promise<void> {
  const accessToken = generateToken(userId, email, role, adminDomain);
  const csrfToken  = generateCsrfToken(userId, email);
  const { plaintext, hash } = generateRefreshToken();

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000);
  await client.exec(
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

    // Crear usuario pendiente de aprobación (is_approved = FALSE)
    // Los usuarios registrados directamente deben ser aprobados por un admin
    const passwordHash = await hashPassword(password);
    const result = await db.exec(
      `INSERT INTO users (email, password_hash, name, student_id, is_approved, is_eligible)
       VALUES (?, ?, ?, ?, FALSE, TRUE)`,
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
      is_approved: boolean | number;
      is_eligible: boolean | number;
      admin_domain: string | null;
      must_change_password: boolean | number;
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
 * @route POST /auth/demo-login
 * @desc  Inicia sesión con una de las dos cuentas de demostración.
 *
 * Existe porque el botón "Demo" de la portada estaba roto: el frontend llevaba
 * `demo123` y `admin123` escritos a mano, y el seed dejó de usar contraseñas por
 * defecto para cuentas con privilegios (A4). `admin@vtb.demo` nunca podría
 * funcionar así, porque su contraseña sale de SEED_DEMO_ADMIN_PASSWORD y cambia
 * en cada despliegue.
 *
 * La alternativa era publicar esas contraseñas en el bundle del navegador. Esto
 * las deja donde ya estaban: en el entorno del servidor.
 *
 * Restricciones deliberadas:
 *   - Solo las dos cuentas del dominio ficticio vtb.demo. La lista es cerrada y
 *     está escrita aquí: no se acepta ningún email del cliente.
 *   - Cada perfil requiere que su variable SEED_* esté definida. Si no lo está,
 *     devuelve 404 y el botón simplemente no funciona, en vez de abrir una
 *     puerta con una contraseña adivinable.
 *   - Comprueba la contraseña contra el hash de la base de datos igual que un
 *     login normal, así que una cuenta borrada o no aprobada no entra.
 *   - Va detrás del mismo rate limit que /auth/login (montado en app.ts).
 */
const DEMO_ACCOUNTS: Record<string, { email: string; envVar: string; fallback?: string }> = {
  student: {
    email: 'student@vtb.demo',
    envVar: 'SEED_DEMO_STUDENT_PASSWORD',
    // Única cuenta con valor por defecto: sin privilegios y en dominio ficticio.
    // Coincide con demoStudentPassword() en seedDatabase.ts.
    fallback: 'demo123',
  },
  admin: {
    email: 'admin@vtb.demo',
    envVar: 'SEED_DEMO_ADMIN_PASSWORD',
  },
};

router.post('/demo-login', async (req: Request, res: Response) => {
  try {
    const profile = String(req.body?.profile ?? '');
    const account = DEMO_ACCOUNTS[profile];
    if (!account) {
      res.status(400).json({ error: 'Perfil de demostración no válido' });
      return;
    }

    // `||` y no `??`, para coincidir con demoStudentPassword() del seed: con la
    // variable definida pero vacía, el seed siembra el valor por defecto, y aquí
    // `??` habría probado la cadena vacía y devuelto 404 sin motivo.
    const password = process.env[account.envVar] || account.fallback;
    if (!password) {
      res.status(404).json({
        error: 'El acceso de demostración no está disponible en este despliegue',
        code: 'DEMO_NOT_CONFIGURED',
      });
      return;
    }

    const user = await db.get<{
      id: number; email: string; password_hash: string; name: string;
      student_id: string; role: string; admin_domain: string | null;
      is_approved: boolean | number; must_change_password: boolean | number;
    }>(
      `SELECT id, email, password_hash, name, student_id, role, admin_domain,
              is_approved, must_change_password
         FROM users WHERE email = ? AND deleted_at IS NULL`,
      [account.email],
    );

    if (!user || !user.is_approved || !(await verifyPassword(password, user.password_hash))) {
      // La cuenta no existe, no está aprobada, o la contraseña del entorno no
      // corresponde con la sembrada. Lo segundo pasa si se cambió la variable
      // sin volver a ejecutar el seed.
      res.status(404).json({
        error: 'La cuenta de demostración no está disponible. Ejecuta el seed.',
        code: 'DEMO_NOT_SEEDED',
      });
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
  } catch (error) {
    console.error('Error en demo-login:', formatError(error));
    res.status(500).json({ error: 'Error al iniciar sesión de demostración' });
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
       VALUES (?, ?, ?, ?, 'student', TRUE, ?, CURRENT_TIMESTAMP, TRUE)`,
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
      "UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?",
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
  // Los tipos admiten las dos representaciones porque el motor no es fijo:
  // SQLite devuelve 0/1 y texto ISO; el driver de PostgreSQL devuelve boolean y
  // Date. Las comparaciones de abajo funcionan igual con ambas — `new Date(d)`
  // sobre un Date lo clona — pero el tipo tiene que reflejarlo o el typecheck
  // miente sobre lo que llega en producción.
  const stored = await db.get<{
    user_id: number; expires_at: string | Date; revoked: boolean | number;
  }>(
    `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?`,
    [hash],
  );

  if (!stored || stored.revoked || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }

  const user = await db.get<{
    id: number; email: string; role: string; admin_domain: string | null; is_approved: boolean | number;
  }>(
    'SELECT id, email, role, admin_domain, is_approved FROM users WHERE id = ? AND deleted_at IS NULL',
    [stored.user_id],
  );

  if (!user || !user.is_approved) {
    return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
  }

  // Rotación atómica: revocar el viejo y emitir el nuevo son una sola operación.
  //
  // Si se hicieran por separado y fallara el INSERT tras el UPDATE, el usuario
  // perdería la sesión (molesto, pero seguro). El orden inverso es el peligroso:
  // emitir el nuevo y que falle la revocación deja DOS tokens válidos, que es
  // justo lo que la rotación existe para impedir.
  await withTransaction(async (tx) => {
    await tx.exec('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?', [hash]);
    await setSessionCookies(res, user.id, user.email, user.role, user.admin_domain, tx);
  });

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
    await db.exec('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?', [hash]).catch(() => {});
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

    const { plaintext, hash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    // Invalidar los anteriores y emitir el nuevo, en una sola operación.
    //
    // Si el INSERT fallase después del UPDATE quedarían cero enlaces válidos y
    // el usuario tendría que volver a pedirlo: molesto, pero seguro. Lo que no
    // puede pasar es lo contrario — que se emita el nuevo y sobrevivan los
    // viejos — porque entonces "pedir otro enlace" dejaría de invalidar el
    // anterior, que es la razón de que ese UPDATE exista.
    await withTransaction(async (tx) => {
      await tx.exec(
        `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND type = 'reset' AND used_at IS NULL`,
        [user.id],
      );
      await tx.exec(
        `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at)
         VALUES (?, ?, 'reset', ?)`,
        [user.id, hash, expiresAt.toISOString()],
      );
    });

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
      expires_at: string | Date;
      used_at: string | Date | null;
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

    // Cambiar la contraseña y quemar el token son una sola operación.
    //
    // Es el caso más serio de los tres: si el UPDATE de users va bien y el de
    // used_at falla, la contraseña queda cambiada y **el enlace sigue siendo
    // válido**. Cualquiera que lo tuviera — reenvío del correo, historial del
    // navegador, un proxy — podría volver a usarlo para cambiarla otra vez.
    await withTransaction(async (tx) => {
      await tx.exec(
        `UPDATE users
            SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [passwordHash, row.user_id],
      );
      await tx.exec(
        `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [row.id],
      );
    });

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;

