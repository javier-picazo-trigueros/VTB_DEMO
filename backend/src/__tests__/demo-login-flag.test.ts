/**
 * El frontend solo enseña el botón de demo si el backend lo permite.
 *
 * POST /auth/demo-login responde 404 salvo DEMO_LOGIN_ENABLED=true, pero el
 * botón se mostraba siempre y daba error en producción. GET /auth/config es
 * público y dice si está activo; el frontend condiciona los botones a eso.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { app } from '../app.js';

const original = process.env.DEMO_LOGIN_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.DEMO_LOGIN_ENABLED;
  else process.env.DEMO_LOGIN_ENABLED = original;
});

describe('GET /auth/config', () => {
  it('dice demoLoginEnabled=false si DEMO_LOGIN_ENABLED no está activo', async () => {
    delete process.env.DEMO_LOGIN_ENABLED;
    const res = await request(app).get('/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ demoLoginEnabled: false });
  });

  it('dice false con cualquier valor que no sea exactamente "true"', async () => {
    process.env.DEMO_LOGIN_ENABLED = '1';
    expect((await request(app).get('/auth/config')).body.demoLoginEnabled).toBe(false);
  });

  it('dice demoLoginEnabled=true con DEMO_LOGIN_ENABLED=true', async () => {
    process.env.DEMO_LOGIN_ENABLED = 'true';
    const res = await request(app).get('/auth/config');
    expect(res.body).toEqual({ demoLoginEnabled: true });
  });

  it('es público (sin sesión) y coherente con POST /auth/demo-login', async () => {
    delete process.env.DEMO_LOGIN_ENABLED;
    expect((await request(app).get('/auth/config')).body.demoLoginEnabled).toBe(false);
    expect((await request(app).post('/auth/demo-login').send({ profile: 'student' })).status).toBe(404);
  });
});

describe('el frontend condiciona los botones de demo al flag', () => {
  const src = path.resolve(__dirname, '../../../frontend/src');
  const leer = (f: string) => readFileSync(path.join(src, f), 'utf-8');

  it('DemoModeButton no se pinta si la demo está desactivada', () => {
    const c = leer('components/DemoModeButton.jsx');
    expect(c).toMatch(/useDemoEnabled\(\)/);
    expect(c).toMatch(/if \(!demoEnabled\) return null/);
  });

  it('cada botón que abre la demo en Landing y Pricing está bajo el flag', () => {
    for (const f of ['pages/Landing.jsx', 'pages/Pricing.jsx']) {
      const c = leer(f);
      const abre = c.match(/setDemoOpen\(true\)/g)?.length ?? 0;
      const condicionados = c.match(/demoEnabled && \(\s*<button/g)?.length ?? 0;
      expect(abre, f).toBeGreaterThan(0);
      expect(condicionados, `${f}: botones de demo sin condicionar`).toBe(abre);
    }
  });

  it('el hook consulta /auth/config y ante un fallo oculta el botón', () => {
    const c = leer('utils/useDemoEnabled.js');
    expect(c).toMatch(/\/auth\/config/);
    expect(c).toMatch(/catch[\s\S]*false/);
  });
});
