import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../config/database.js';
import {
  verifyToken,
  COOKIE_NAME_ACCESS,
} from '../utils/auth.js';

// Augment Express Request to carry the decoded user payload.
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        role: string;
        adminDomain: string | null;
      };
    }
  }
}

/** Reads the JWT from the httpOnly access cookie. */
export function extractToken(req: Request): string | null {
  const cookie = (req as any).cookies?.[COOKIE_NAME_ACCESS];
  if (typeof cookie === 'string' && cookie) return cookie;
  return null;
}

/**
 * Validates the JWT and sets req.user.
 * Returns 401 if the token is missing or invalid.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const raw = extractToken(req);
  if (!raw) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  const decoded = verifyToken(raw);
  if (!decoded?.userId) {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }
  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role ?? 'student',
    adminDomain: decoded.adminDomain ?? null,
  };
  next();
};

/**
 * Validates the JWT and checks that the user is admin or superadmin.
 * Refreshes role from DB to detect role demotions mid-session.
 * Sets req.user with the DB-confirmed role.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const raw = extractToken(req);
  if (!raw) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  const decoded = verifyToken(raw);
  if (!decoded?.userId) {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }

  try {
    const db = getDatabase();
    const row = await db.get<{ role: string; admin_domain: string | null }>(
      'SELECT role, admin_domain FROM users WHERE id = ? AND deleted_at IS NULL',
      [decoded.userId],
    );
    if (!row || (row.role !== 'admin' && row.role !== 'superadmin')) {
      res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador' });
      return;
    }
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: row.role,
      adminDomain: row.admin_domain,
    };
    next();
  } catch {
    res.status(500).json({ error: 'Error de autenticación' });
  }
};

/** Like requireAdmin but only for superadmins. */
export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await requireAdmin(req, res, async () => {
    if (req.user?.role !== 'superadmin') {
      res.status(403).json({ error: 'Se requieren permisos de superadmin' });
      return;
    }
    next();
  });
};
