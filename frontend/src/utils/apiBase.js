/**
 * Base de la API del frontend.
 *
 * En producción es SIEMPRE '/backend', el proxy de mismo origen de Vercel
 * (vercel.json). Llamar directo a Render sería otro sitio: las cookies de
 * sesión (SameSite=Lax) no viajarían, el refresh fallaría y el usuario
 * volvería al login nada más entrar. Por eso VITE_API_URL solo se respeta en
 * desarrollo, aunque esté definida en el entorno de Vercel.
 *
 * @param {{ PROD?: boolean, VITE_API_URL?: string }} env import.meta.env
 */
export function resolveApiUrl(env) {
  if (env.PROD) return '/backend';
  return env.VITE_API_URL || '/backend';
}

export const API_URL = resolveApiUrl(import.meta.env);
