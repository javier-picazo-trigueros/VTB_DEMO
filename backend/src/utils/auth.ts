import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

/**
 * @title Auth Utilities - VTB Backend
 * @author Senior Web3 Architect
 * @dev Funciones de autenticación, hashing de contraseñas y generación de nullifiers
 *
 * ARQUITECTURA CRÍTICA - GENERACIÓN DE NULLIFIER:
 * ============================================
 *
 * El nullifier es la PIEZA CLAVE que conecta Web2 (usuario) con Web3 (voto anónimo):
 *
 * 1. QUÉ ES UN NULLIFIER:
 *    - Un identificador único por usuario + elección
 *    - Generado determinísticamente pero no reversible
 *    - Permite al blockchain verificar "no doble voto" sin revelar identidad
 *
 * 2. FÓRMULA:
 *    nullifier = HMAC-SHA256(
 *      key = PRIVATE_SECRET_KEY (servidor),
 *      message = user_id + election_id + constant_salt
 *    )
 *
 * 3. FLUJO SEGURO:
 *    a) Usuario autentica: username + password
 *    b) Backend valida contra SQLite
 *    c) Backend genera: nullifier = HMAC(secret_key, user_id + election_id)
 *    d) Backend incluye en JWT: {userId, nullifier, exp}
 *    e) Frontend recibe JWT (contiene nullifier)
 *    f) Frontend envía: (nullifier, voteHash) al Smart Contract
 *    g) Backend NUNCA entra en blockchain (relayer agnostic)
 *
 * 4. SEGURIDAD:
 *    - No es posible invertir HMAC para obtener user_id
 *    - Mismo user_id + mismo election_id = siempre el mismo nullifier (determínístico)
 *    - User_id ≠ user_id => nullifier ≠ nullifier (único por usuario)
 *    - Si usuario intenta votar 2 veces, genera el MISMO nullifier
 *    - Smart Contract rechaza segunda transacción (double vote)
 *
 * 5. PRIVACIDAD:
 *    - El blockchain ve: nullifier (hash) + voteHash (cifrado)
 *    - El blockchain NO ve: identificación personal (email, nombre, ID estudiante)
 *    - Auditoría: Blockchain prueba "X persona votó" sin revelar quién es X
 */

// CONSTANTE CRÍTICA: Secret key para HMAC (debe estar en .env en producción)
const HMAC_SECRET =
  process.env.NULLIFIER_SECRET || "super-secret-key-change-in-production";

// JWT Secret (debe estar en .env en producción)
const JWT_SECRET = process.env.JWT_SECRET || "jwt-secret-key-change-in-production";

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
 * @returns Nullifier hash (32 bytes hex) para enviar al contrato
 */
export function generateNullifier(userId: number, electionId: number): string {
  const message = `${userId}:${electionId}:vtb-voter`;

  // HMAC-SHA256 con secret del servidor
  const nullifier = crypto
    .createHmac("sha256", HMAC_SECRET)
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
export function generateToken(
  userId: number,
  email: string,
  role: string = "student"
): string {
  const token = jwt.sign(
    {
      userId,
      email,
      role,
    },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  return token;
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
} | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || "student",
    };
  } catch (error) {
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
