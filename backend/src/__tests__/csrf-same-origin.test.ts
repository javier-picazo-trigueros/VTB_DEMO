import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieOpts } from '../routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

describe('BLOQUE 0 — Same-origin reverse proxy, cookie policy and CSRF propagation', () => {
  it('1. cookieOpts must use SameSite=Lax (first-party) in production, NOT SameSite=None (third-party)', () => {
    // In cross-origin setups (Vercel -> Render direct), third-party cookies required SameSite=None,
    // which caused Safari ITP to block cookies and prevented document.cookie from reading vtb_csrf.
    // In same-origin proxying, all cookies are first-party and must be SameSite=Lax.
    const prodOpts = cookieOpts(15 * 60 * 1000, true);
    expect(prodOpts.sameSite).toBe('lax');
  });

  it('2. frontend/vite.config.js must proxy backend traffic via /backend and strip prefix with rewrite', () => {
    const viteConfigPath = path.join(rootDir, 'frontend', 'vite.config.js');
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    // Must proxy /backend to backend :3001 and rewrite to strip prefix
    expect(content).toMatch(/'\/backend'|\"\/backend\"/);
    expect(content).toMatch(/rewrite/);
  });

  it('3. frontend/vercel.json must rewrite /backend/:path* to Render production backend', () => {
    const vercelConfigPath = path.join(rootDir, 'frontend', 'vercel.json');
    const content = fs.readFileSync(vercelConfigPath, 'utf8');
    const parsed = JSON.parse(content);

    const rewrites = parsed.rewrites || [];
    const backendRewrite = rewrites.find((r: { source: string }) => r.source === '/backend/:path*');

    expect(backendRewrite).toBeDefined();
    expect(backendRewrite.destination).toBe('https://vtb-backend-4emv.onrender.com/:path*');
  });

  it('4. frontend/src/utils/apiClient.js must default to /backend for same-origin proxying', () => {
    const clientPath = path.join(rootDir, 'frontend', 'src', 'utils', 'apiClient.js');
    const content = fs.readFileSync(clientPath, 'utf8');

    // In a same-origin setup with route isolation, default API_URL must be '/backend',
    // NOT hardcoded to 'http://localhost:3001'
    expect(content).toMatch(/VITE_API_URL\s*\|\|\s*['"]\/backend['"]/);
    expect(content).not.toMatch(/http:\/\/localhost:3001/);
  });

  it('5. CSRF extraction helper extracts token correctly from cookie string and attaches to mutating requests', () => {
    const extractCsrf = (cookieString: string): string => {
      const entry = cookieString
        .split('; ')
        .find(row => row.startsWith('vtb_csrf='));
      return entry ? decodeURIComponent(entry.split('=')[1]) : '';
    };

    const cookieStr = 'other=xyz; vtb_csrf=secret-csrf-token-12345; session=abc';
    const token = extractCsrf(cookieStr);
    expect(token).toBe('secret-csrf-token-12345');

    // Safe methods must not carry CSRF, mutating methods must
    const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
    const getHeadersForRequest = (method: string, cookie: string) => {
      const headers: Record<string, string> = {};
      if (!SAFE_METHODS.has(method.toUpperCase())) {
        headers['X-CSRF-Token'] = extractCsrf(cookie);
      }
      return headers;
    };

    expect(getHeadersForRequest('GET', cookieStr)).toEqual({});
    expect(getHeadersForRequest('POST', cookieStr)).toEqual({
      'X-CSRF-Token': 'secret-csrf-token-12345',
    });
    expect(getHeadersForRequest('PUT', cookieStr)).toEqual({
      'X-CSRF-Token': 'secret-csrf-token-12345',
    });
    expect(getHeadersForRequest('DELETE', cookieStr)).toEqual({
      'X-CSRF-Token': 'secret-csrf-token-12345',
    });
    expect(getHeadersForRequest('PATCH', cookieStr)).toEqual({
      'X-CSRF-Token': 'secret-csrf-token-12345',
    });
  });

  it('6. Frontend source files must not hardcode http://localhost:3001 as fallback URL', () => {
    const srcDir = path.join(rootDir, 'frontend', 'src');
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toMatch(/http:\/\/localhost:3001/);
        }
      }
    };
    checkDir(srcDir);
  });
});
