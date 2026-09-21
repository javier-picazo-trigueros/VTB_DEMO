import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

describe('Proxy route collision test — frontend pages vs backend proxy', () => {
  const appJsxPath = path.join(rootDir, 'frontend', 'src', 'App.jsx');
  const viteConfigPath = path.join(rootDir, 'frontend', 'vite.config.js');
  const vercelConfigPath = path.join(rootDir, 'frontend', 'vercel.json');

  // Extract all declared routes in App.jsx
  const appJsxContent = fs.readFileSync(appJsxPath, 'utf8');
  const declaredRoutes = [...appJsxContent.matchAll(/path="([^"]+)"/g)]
    .map(m => m[1])
    .filter(p => p !== '*');

  it('1. App.jsx contains critical pages that share prefixes with backend routes (/admin, /auth/reset-password, /auth/set-password)', () => {
    expect(declaredRoutes).toContain('/admin');
    expect(declaredRoutes).toContain('/auth/reset-password');
    expect(declaredRoutes).toContain('/auth/set-password');
  });

  it('2. Vite dev proxy must NOT intercept any declared frontend page routes', () => {
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');

    // Parse proxy targets/keys from vite.config.js
    // If vite proxies directly on '/admin' or '/auth', any request to http://localhost:3000/admin
    // or http://localhost:3000/auth/reset-password will be captured by Vite proxy and proxied to backend
    // instead of serving index.html!
    const collidingRoutes: string[] = [];

    // Check if vite config has dedicated prefix like /backend
    const usesDedicatedBackendPrefix = viteConfig.includes("'/backend'") || viteConfig.includes('"\/backend"');

    if (!usesDedicatedBackendPrefix) {
      // Find proxy keys in viteConfig
      const proxyBlockMatch = viteConfig.match(/proxy:\s*\{([\s\S]*?)\n\s*\},/);
      if (proxyBlockMatch) {
        const proxyKeys = [...proxyBlockMatch[1].matchAll(/['"](\/[a-zA-Z0-9_-]+)['"]\s*:/g)].map(m => m[1]);
        for (const route of declaredRoutes) {
          for (const key of proxyKeys) {
            if (route === key || route.startsWith(`${key}/`)) {
              collidingRoutes.push(`Route ${route} collides with Vite proxy prefix ${key}`);
            }
          }
        }
      }
    }

    expect(collidingRoutes, `Vite proxy collides with frontend routes: \n${collidingRoutes.join('\n')}`).toEqual([]);
    expect(usesDedicatedBackendPrefix, 'Vite proxy must use a dedicated non-colliding prefix like /backend').toBe(true);
  });

  it('3. Vercel rewrites must NOT intercept any declared frontend page routes before the SPA fallback', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const rewrites = vercelConfig.rewrites || [];

    const collidingRoutes: string[] = [];

    // Helper to simulate Vercel glob matching
    // e.g. /admin/:path* matches /admin, /admin/, /admin/users
    // /auth/:path* matches /auth/reset-password, /auth/set-password
    const matchesSource = (pattern: string, pathname: string) => {
      if (pattern === '/(.*)') return true; // SPA fallback
      if (pattern.includes(':path*')) {
        const prefix = pattern.split('/:path*')[0];
        return pathname === prefix || pathname.startsWith(`${prefix}/`);
      }
      return pattern === pathname;
    };

    // Filter out the SPA fallback
    const backendRewrites = rewrites.filter((r: { source: string }) => r.source !== '/(.*)');

    for (const route of declaredRoutes) {
      // Sample concrete path for parameterized routes e.g. /portal/:domain -> /portal/meridian.edu
      const testPath = route.replace(/:[a-zA-Z0-9_]+/g, 'test');
      for (const rewrite of backendRewrites) {
        if (matchesSource(rewrite.source, testPath)) {
          collidingRoutes.push(`Frontend route ${route} is hijacked by Vercel rewrite ${rewrite.source} -> ${rewrite.destination}`);
        }
      }
    }

    expect(collidingRoutes, `Vercel rewrites hijack frontend pages: \n${collidingRoutes.join('\n')}`).toEqual([]);
  });

  it('4. Frontend apiClient and all API calls must use the dedicated prefix /backend', () => {
    const apiClientPath = path.join(rootDir, 'frontend', 'src', 'utils', 'apiClient.js');
    const content = fs.readFileSync(apiClientPath, 'utf8');

    // Default API_URL must be '/backend'
    expect(content).toMatch(/VITE_API_URL\s*\|\|\s*['"]\/backend['"]/);
  });
});
