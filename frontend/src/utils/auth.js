/**
 * Clears any legacy localStorage keys and redirects to /login.
 * The actual session cookies are cleared server-side via POST /auth/logout.
 */
export const clearAuthAndRedirect = (navigate) => {
  // Remove legacy localStorage keys (no longer used for auth, but may exist
  // from previous sessions before the cookie migration).
  const legacyKeys = [
    'vtb-token', 'vtb-user', 'vtb-role',
    'vtb-user-id', 'vtb-email', 'vtb-name', 'vtb-admin-domain',
  ];
  legacyKeys.forEach(k => localStorage.removeItem(k));
  navigate('/login?reason=expired');
};
