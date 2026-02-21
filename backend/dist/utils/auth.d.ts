/**
 * @dev Hash de contraseña usando bcrypt (más seguro que SHA-512)
 * bcrypt incluye salt y factor de costo automáticamente
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * @dev Verificar contraseña contra hash bcrypt
 */
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
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
export declare function generateNullifier(userId: number, electionId: number): string;
/**
 * @dev Generar JWT SIN nullifier ni electionId
 *
 * CAMBIO ARQUITECTÓNICO (1.3):
 * El JWT ahora contiene SOLO datos de autenticación.
 * El nullifier se genera en tiempo de votación con electionId y voteHash.
 *
 * Token contiene: userId, email, rol (sin nullifier, sin electionId)
 */
export declare function generateToken(userId: number, email: string, role?: string): string;
/**
 * @dev Verificar JWT y extraer datos
 *
 * Nota: Ya no contiene nullifier ni electionId
 */
export declare function verifyToken(token: string): {
    userId: number;
    email: string;
    role?: string;
} | null;
/**
 * @dev Generar voteHash en el BACKEND para testing
 * En producción, el frontend genera esto
 *
 * voteHash = SHA256(voto + random_salt)
 */
export declare function generateVoteHash(vote: string, salt: string): string;
