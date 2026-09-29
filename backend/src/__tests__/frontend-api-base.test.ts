/**
 * En producción el frontend llama SIEMPRE a '/backend' (el proxy de Vercel).
 *
 * Si en Vercel está definida VITE_API_URL con la URL de Render, el frontend
 * llamaba directo a Render: otro sitio, así que las cookies (SameSite=Lax) no
 * viajaban, el refresh fallaba y la sesión caducaba nada más entrar. Solo en
 * desarrollo se respeta VITE_API_URL.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error: módulo JS del frontend, sin tipos
import { resolveApiUrl } from '../../../frontend/src/utils/apiBase.js';

const frontendSrc = path.resolve(__dirname, '../../../frontend/src');
const RENDER = 'https://vtb-backend-4emv.onrender.com';

describe('resolveApiUrl', () => {
  it('en producción usa /backend aunque VITE_API_URL apunte a Render', () => {
    expect(resolveApiUrl({ PROD: true, VITE_API_URL: RENDER })).toBe('/backend');
  });

  it('en producción sin variable, también /backend', () => {
    expect(resolveApiUrl({ PROD: true })).toBe('/backend');
  });

  it('en desarrollo respeta VITE_API_URL', () => {
    expect(resolveApiUrl({ PROD: false, VITE_API_URL: 'http://localhost:3001' })).toBe('http://localhost:3001');
  });

  it('en desarrollo sin variable, /backend', () => {
    expect(resolveApiUrl({ PROD: false })).toBe('/backend');
  });
});

describe('nadie más lee VITE_API_URL', () => {
  function ficheros(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) return ficheros(p);
      return /\.(jsx?|tsx?)$/.test(n) ? [p] : [];
    });
  }

  it('solo utils/apiBase.js lee VITE_API_URL (el resto usa API_URL)', () => {
    const lectores = ficheros(frontendSrc)
      .filter((f) => /import\.meta\.env\.VITE_API_URL/.test(readFileSync(f, 'utf-8')))
      .map((f) => path.relative(frontendSrc, f).split(path.sep).join('/'));
    expect(lectores).toEqual([]);
  });
});
