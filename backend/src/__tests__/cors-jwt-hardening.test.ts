/**
 * Endurecimiento HTTP (auditoría de seguridad, oct-2026): CORS y algoritmo del JWT.
 *
 * El CORS lee la variable de entorno en el momento de la petición, así que se
 * cambia NODE_ENV dentro del test y se restaura después.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { verifyToken } from '../utils/auth.js';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
};

afterEach(() => {
  for (const [clave, valor] of Object.entries(ORIGINAL_ENV)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

describe('CORS', () => {
  const FRONT = 'https://frontend-de-produccion.example';
  const acao = (origin: string) =>
    request(app).get('/health').set('Origin', origin).then(r => r.headers['access-control-allow-origin']);

  it('en producción admite el origen configurado', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = FRONT;
    expect(await acao(FRONT)).toBe(FRONT);
  });

  it('en producción NO admite los orígenes de localhost', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = FRONT;
    expect(await acao('http://localhost:3000')).toBeUndefined();
  });

  it('fuera de producción sí admite localhost', async () => {
    process.env.NODE_ENV = 'development';
    expect(await acao('http://localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('JWT', () => {
  const payload = { userId: 1, email: 'a@b.test', role: 'student' };
  const secreto = process.env.JWT_SECRET!;

  it('acepta un token HS256 firmado con el secreto', () => {
    const token = jwt.sign(payload, secreto, { algorithm: 'HS256', expiresIn: '5m' });
    expect(verifyToken(token)?.userId).toBe(1);
  });

  it('rechaza un token firmado con otro algoritmo aunque el secreto sea el correcto', () => {
    const token = jwt.sign(payload, secreto, { algorithm: 'HS512', expiresIn: '5m' });
    expect(verifyToken(token)).toBeNull();
  });

  it('rechaza un token sin firma (alg none)', () => {
    const sinFirma = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url'),
      '',
    ].join('.');
    expect(verifyToken(sinFirma)).toBeNull();
  });
});
