import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

export const COOKIE_NAME_ACCESS  = 'vtb_auth';
export const COOKIE_NAME_REFRESH = 'vtb_refresh';
export const COOKIE_NAME_CSRF    = 'vtb_csrf';

dotenv.config({ quiet: true });

/**
 * @title Auth Utilities - VTB Backend
 * @author Senior Web3 Architect
 * @dev Funciones de autenticación, hashing de contraseñas y generación de nullifiers
 *
 * ARQUITECTURA CRÍTICA - GENERACIÓN DE NULLIFIER:
 * ============================================
 *
 * El nullifier es el testigo único por usuario y elección que impide el doble voto:
 *
 * 1. QUÉ ES UN NULLIFIER:
 *    - Un identificador único por usuario + elección
 *    - Generado determinísticamente, no reversible sin NULLIFIER_SECRET
 *    - Permite al contrato rechazar un segundo voto con el mismo identificador
 *
 * 2. FÓRMULA:
 *    nullifier = HMAC-SHA256(
 *      key = NULLIFIER_SECRET (servidor),
 *      message = user_id + election_id [+ sal efímera de la elección]
 *    )
 *
 * 3. FLUJO:
 *    a) Usuario autentica con su sesión (cookie httpOnly).
 *    b) Al votar, el servidor calcula el nullifier en ese momento; no va en el JWT.
 *    c) El servidor, como relayer, envía castVote(electionId, nullifier, posición
 *       del candidato) al contrato. El navegador no firma ni envía nada a la cadena.
 *
 * 4. SEGURIDAD:
 *    - No es posible invertir el HMAC sin la clave del servidor.
 *    - Mismo user_id + misma elección = siempre el mismo nullifier.
 *    - Si el usuario intenta votar dos veces, genera el MISMO nullifier y el
 *      contrato rechaza la segunda transacción.
 *
 * 5. PRIVACIDAD (el voto NO es anónimo, es seudónimo; ver SEGURIDAD.md §2.1):
 *    - La cadena ve el nullifier y el candidato, no el email, el nombre ni el id.
 *    - El servidor sí puede calcular el nullifier de cualquier usuario mientras
 *      procesa el voto: quien opera el sistema puede relacionar votante y voto.
 */

// CONSTANTE CRÍTICA: Secret key para HMAC (debe estar en .env en producción)
const isProduction = process.env.NODE_ENV === "production";

const HMAC_SECRET =
  process.env.NULLIFIER_SECRET ||
  (!isProduction ? "dev-only-nullifier-secret-change-before-prod" : undefined);

// JWT Secret (debe estar en .env en producción)
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (!isProduction ? "dev-only-jwt-secret-change-before-prod" : undefined);

if (!HMAC_SECRET) {
  throw new Error(
    'FATAL: NULLIFIER_SECRET environment variable is not set. ' +
      "Set it in Render or backend/.env before starting the server."
  );
}
if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
      "Set it in Render or backend/.env before starting the server."
  );
}

if (!isProduction && !process.env.NULLIFIER_SECRET) {
  console.warn("WARNING: NULLIFIER_SECRET not set. Using insecure local development fallback.");
}

if (!isProduction && !process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET not set. Using insecure local development fallback.");
}

const REQUIRED_HMAC_SECRET: string = HMAC_SECRET;
const REQUIRED_JWT_SECRET: string = JWT_SECRET;

// Derived from JWT_SECRET so no extra env var is needed.
// A separate env var (CSRF_SECRET) can override it in production.
const CSRF_SECRET =
  process.env.CSRF_SECRET ||
  crypto.createHmac('sha256', REQUIRED_JWT_SECRET).update('csrf-derive').digest('hex');

/**
 * @dev Hash de contraseña usando bcrypt (más seguro que SHA-512)
 * bcrypt incluye salt y factor de costo automáticamente
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * @dev Verificar contraseña contra hash bcrypt
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * @dev FUNCIÓN CRÍTICA: Generar Nullifier para una elección
 *
 * El nullifier es determinístico: 
 * - Mismo userId + electionId = mismo nullifier
 * - Previene double voting
 * - No se puede invertir para obtener userId
 * - SE GENERA EN TIEMPO DE VOTACIÓN, NO EN LOGIN
 *
 * @param userId ID del usuario (de SQLite)
 * @param electionId ID de la elección
 * @param electionSalt Sal efímera de la elección (elections.ephemeral_salt). Si se
 *        pasa, entra en el HMAC y el nullifier deja de ser recalculable una vez la
 *        sal se destruye (ver services/electionSalt.ts). Si la elección no tiene sal
 *        (creada antes de la migración, o null/undefined), se mantiene el cálculo
 *        legacy sin sal — compatible con los nullifiers ya emitidos.
 * @returns Nullifier hash (32 bytes hex) para enviar al contrato
 */
export function generateNullifier(
  userId: number,
  electionId: number,
  electionSalt?: string | null,
): string {
  const saltPart = electionSalt ? `:${electionSalt}` : '';
  const message = `${userId}:${electionId}${saltPart}:vtb-voter`;

  // HMAC-SHA256 con secret del servidor
  const nullifier = crypto
    .createHmac("sha256", REQUIRED_HMAC_SECRET)
    .update(message)
    .digest("hex");

  // Convertir a bytes32 format para Solidity
  return "0x" + nullifier;
}

/**
 * @dev Generar JWT SIN nullifier ni electionId
 * 
 * CAMBIO ARQUITECTÓNICO (1.3):
 * El JWT ahora contiene SOLO datos de autenticación.
 * El nullifier se genera en tiempo de votación con electionId y voteHash.
 * 
 * Token contiene: userId, email, rol (sin nullifier, sin electionId)
 */
interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  adminDomain?: string;
}

export function generateToken(
  userId: number,
  email: string,
  role: string = "student",
  adminDomain: string | null = null
): string {
  const payload: JwtPayload = { userId, email, role };
  if (adminDomain) payload.adminDomain = adminDomain;
  return jwt.sign(payload, REQUIRED_JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
}

/**
 * @dev Verificar JWT y extraer datos
 * 
 * Nota: Ya no contiene nullifier ni electionId
 */
export function verifyToken(
  token: string
): {
  userId: number;
  email: string;
  role?: string;
  adminDomain?: string | null;
} | null {
  try {
    const decoded = jwt.verify(token, REQUIRED_JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || "student",
      adminDomain: decoded.adminDomain ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * @dev Generar voteHash en el BACKEND para testing
 * En producción, el frontend genera esto
 *
 * voteHash = SHA256(voto + random_salt)
 */
export function generateVoteHash(vote: string, salt: string): string {
  const payload = `${vote}:${salt}`;
  return "0x" + crypto.createHash("sha256").update(payload).digest("hex");
}

// ── One-time secure tokens (refresh + password reset share this generator) ────

/**
 * Generates a cryptographically secure opaque token.
 * plaintext → sent to client/email  |  hash (SHA-256) → stored in DB.
 */
export function generateSecureToken(): { plaintext: string; hash: string } {
  const plaintext = crypto.randomBytes(32).toString('hex'); // 64-char hex
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

export function hashSecureToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export const REFRESH_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_TTL_DAYS = 7;

/** Returns a plaintext token (to send to client) and its SHA-256 hash (to store in DB). */
export function generateRefreshToken(): { plaintext: string; hash: string } {
  const plaintext = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

export function hashRefreshToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

// ── CSRF tokens ───────────────────────────────────────────────────────────────

/**
 * Derives a stateless CSRF token from user identity.
 * The frontend reads this from the `vtb_csrf` non-httpOnly cookie and
 * sends it as the `X-CSRF-Token` request header on all mutating requests.
 * Attacks can't forge it because CSRF_SECRET is server-only.
 */
export function generateCsrfToken(userId: number, email: string): string {
  return crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(`${userId}:${email}`)
    .digest('hex');
}

export function validateCsrfToken(token: string, userId: number, email: string): boolean {
  try {
    const expected = generateCsrfToken(userId, email);
    const a = Buffer.from(token.padEnd(64, '0').slice(0, 64), 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
