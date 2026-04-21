export const clearAuthAndRedirect = (navigate) => {
  const keys = ['vtb-token', 'vtb-user', 'vtb-role', 'vtb-user-id', 'vtb-email', 'vtb-name', 'vtb-admin-domain'];
  keys.forEach(k => localStorage.removeItem(k));
  navigate('/login?reason=expired');
};
