/**
 * Límites de tasa — punto único de configuración (A3).
 *
 * Antes estaban repartidos entre app.ts y routes/auth.ts, con criterios
 * distintos sobre qué hacer en cada entorno. Aquí se define una sola política:
 *
 *   test         → sin límite (los tests hacen cientos de logins seguidos)
 *   development  → límites holgados, pero límites
 *   production   → límites reales, configurables por entorno
 *
 * IMPORTANTE: todos los limitadores por IP dependen de que `req.ip` sea la IP
 * del cliente y no la del proxy. Ver `configureTrustProxy` en app.ts.
 */
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const IS_TEST = process.env.NODE_ENV === 'test';
const IS_PROD = process.env.NODE_ENV === 'production';

/** En tests el límite se levanta; nunca queremos flakiness por rate limiting. */
const NO_LIMIT = 1_000_000;

/**
 * Lee un entero positivo del entorno.
 * `parseInt` devuelve NaN ante un valor no numérico, y express-rate-limit con
 * max=NaN deja de limitar sin avisar — de ahí la comprobación explícita.
 */
function envLimit(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    if (process.env[name] !== undefined) {
      console.warn(`⚠️  [rate-limit] ${name}="${process.env[name]}" no es un entero positivo; se usa ${fallback}.`);
    }
    return fallback;
  }
  return parsed;
}

/** Aplica la política por entorno a un límite dado. */
function limit(prod: number, dev: number): number {
  if (IS_TEST) return NO_LIMIT;
  return IS_PROD ? prod : dev;
}

function ipOf(req: Request): string {
  return req.ip ?? 'unknown';
}

function emailOf(req: Request): string | null {
  const raw = (req.body as Record<string, unknown> | undefined)?.email;
  return typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : null;
}

const COMMON = { standardHeaders: true, legacyHeaders: false } as const;

// ── Login ────────────────────────────────────────────────────────────────────

export const loginLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? NO_LIMIT : (IS_PROD ? envLimit('RATE_LIMIT_MAX', 10) : 100),
  keyGenerator: (req) => `login:ip:${ipOf(req)}`,
  message: { error: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en 15 minutos.' },
});

// ── Registro público ─────────────────────────────────────────────────────────
//
// POST /auth/register y POST /registration/request ejecutan bcrypt con coste 12
// (~250 ms de CPU en un solo hilo) por petición. Sin límite, unas decenas de
// peticiones por segundo dejan el proceso sin responder. Además el 409 de
// "email ya registrado" es un oráculo de enumeración de cuentas.

export const registerLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000,
  max: limit(10, 100),
  keyGenerator: (req) => `register:ip:${ipOf(req)}`,
  message: { error: 'Demasiadas solicitudes de registro desde esta red. Inténtalo más tarde.' },
});

// ── Recuperación de contraseña ───────────────────────────────────────────────
//
// Dos cubos encadenados y deliberadamente independientes:
//
//   por email → impide inundar el buzón de una cuenta concreta
//   por IP    → impide que un atacante rote direcciones para saltarse el
//               anterior; con solo el de email, cada dirección nueva estrenaba
//               cubo y el endpoint quedaba de facto sin límite por origen.

export const forgotIpLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000,
  max: limit(10, 100),
  keyGenerator: (req) => `forgot:ip:${ipOf(req)}`,
  message: { error: 'Demasiadas solicitudes de recuperación desde esta red. Espera 15 minutos.' },
});

export const forgotEmailLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000,
  max: limit(3, 50),
  // req.body ya está parseado: express.json() corre antes que los routers.
  keyGenerator: (req) => `forgot:email:${emailOf(req)}`,
  // Sin email en el cuerpo no hay nada que agrupar; lo cubre el limitador de IP.
  skip: (req) => emailOf(req) === null,
  message: { error: 'Demasiadas solicitudes de recuperación para esta cuenta. Espera 15 minutos.' },
});

/** Fuerza bruta sobre el token de reset (64 hex, pero el límite es barato). */
export const resetPasswordLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000,
  max: limit(20, 200),
  keyGenerator: (req) => `reset:ip:${ipOf(req)}`,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
});

// ── Voto ─────────────────────────────────────────────────────────────────────

/** Por usuario autenticado. requireAuth debe haber puesto req.user antes. */
export const voteUserLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 1000,
  max: limit(3, 3),
  keyGenerator: (req) => `vote:user:${req.user?.userId ?? 'anon'}`,
  message: { error: 'Demasiados intentos de voto. Espera un minuto.' },
});

/**
 * Red de seguridad por IP: alto para no bloquear un campus tras un NAT
 * (cientos de usuarios con una sola IP pública), bajo para frenar un script.
 */
export const voteIpLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 1000,
  max: limit(500, 500),
  keyGenerator: (req) => `vote:ip:${ipOf(req)}`,
  message: { error: 'Demasiados intentos de voto desde esta red. Espera un minuto.' },
});
