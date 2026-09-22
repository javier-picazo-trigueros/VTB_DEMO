/**
 * csrf.js
 * =======
 * Lectura del cookie CSRF y el conjunto de métodos "seguros" que no lo llevan.
 *
 * Separado de apiClient.js para que se pueda importar y probar sin arrastrar
 * axios ni el resto del cliente HTTP — csrf-same-origin.test.ts (backend) lo
 * importa directamente para probar el código real, no una reimplementación.
 */

// El backend fija vtb_csrf como cookie NO httpOnly para que JS pueda leerla.
export const getCsrfToken = () => {
  if (typeof document === 'undefined') return '';
  const entry = document.cookie
    .split('; ')
    .find(row => row.startsWith('vtb_csrf='));
  return entry ? decodeURIComponent(entry.split('=')[1]) : '';
};

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
