/**
 * @dev Hash de contraseña usando SHA-512
 * Mejor opción: usar bcrypt en producción
 */
export declare function hashPassword(password: string): string;
/**
 * @dev Verificar contraseña
 */
export declare function verifyPassword(password: string, hash: string): boolean;
/**
 * @dev FUNCIÓN CRÍTICA: Generar Nullifier para una elección
 *
 * El nullifier es determinístico:
 * - Mismo userId + electionId = mismo nullifier
 * - Previene double voting
 * - No se puede invertir para obtener userId
 *
 * @param userId ID del usuario (de SQLite)
 * @param electionId ID de la elección (de blockchain)
 * @returns Nullifier hash (32 bytes hex)
 */
export declare function generateNullifier(userId: number, electionId: number): string;
/**
 * @dev Generar JWT con nullifier incluido
 * Token contiene: userId, nullifier, email (sin contraseña)
 */
export declare function generateToken(userId: number, email: string, electionId: number): string;
/**
 * @dev Verificar JWT y extraer datos
 */
export declare function verifyToken(token: string): {
    userId: number;
    email: string;
    electionId: number;
    nullifier: string;
} | null;
/**
 * @dev Generar voteHash en el BACKEND para testing
 * En producción, el frontend genera esto
 *
 * voteHash = SHA256(voto + random_salt)
 */
export declare function generateVoteHash(vote: string, salt: string): string;
