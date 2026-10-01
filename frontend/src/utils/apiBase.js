/**
 * Base de la API del frontend.
 *
 * En producción es SIEMPRE '/backend', el proxy de mismo origen de Vercel
 * (vercel.json). Llamar directo a Render sería otro sitio: las cookies de
 * sesión (SameSite=Lax) no viajarían, el refresh fallaría y el usuario
 * volvería al login nada más entrar. Por eso VITE_API_URL solo se respeta en
 * desarrollo, aunque esté definida en el entorno de Vercel.
 *
 * @param {{ PROD?: boolean, VITE_API_URL?: string }} env
 */
export function resolveApiUrl(env) {
  if (env.PROD) return '/backend';
  return env.VITE_API_URL || '/backend';
}

// Se leen SOLO import.meta.env.PROD e import.meta.env.VITE_API_URL, nunca el
// objeto entero: Vite sustituye cada acceso por su valor y, si se pasara el
// objeto, incrustaría en el bundle TODAS las variables VITE_* (URLs, claves RPC).
// En producción la rama de abajo no lee VITE_API_URL, así que su valor no llega
// al bundle. Lo comprueba `npm run check:bundle`.
export const API_URL = import.meta.env.PROD
  ? resolveApiUrl({ PROD: true })
  : resolveApiUrl({ PROD: false, VITE_API_URL: import.meta.env.VITE_API_URL });
