/**
 * Claves de localStorage de antes de migrar la sesión a cookies httpOnly.
 * Podían contener email y nombre en claro (VTB-DEMO issue: Paso C, punto g).
 */
const LEGACY_AUTH_KEYS = [
  'vtb-token', 'vtb-user', 'vtb-role',
  'vtb-user-id', 'vtb-email', 'vtb-name', 'vtb-admin-domain',
];

/** Borra las claves heredadas si quedan de una sesión de antes de la migración. */
export const clearLegacyStorageKeys = () => {
  try {
    LEGACY_AUTH_KEYS.forEach(k => localStorage.removeItem(k));
  } catch {
    // almacenamiento no disponible — nada que limpiar
  }
};

/**
 * Clears any legacy localStorage keys and redirects to /login.
 * The actual session cookies are cleared server-side via POST /auth/logout.
 */
export const clearAuthAndRedirect = (navigate) => {
  clearLegacyStorageKeys();
  navigate('/login?reason=expired');
};
