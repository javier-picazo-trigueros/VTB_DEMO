import { describe, it, expect } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import {
  emailOf,
  ipOf,
  createLoginLimiter,
  createLoginAccountLimiter,
  createLoginIpLimiter,
} from '../middleware/rateLimit.js';

describe('BLOQUE 1.4 — Rate limit del login por IP que bloquea un campus', () => {
  it('emailOf normaliza correos (trim, minúsculas) y devuelve null si no hay email válido', () => {
    const reqWithEmail = { body: { email: '  Student.A@Campus.EDU  ' } } as Request;
    expect(emailOf(reqWithEmail)).toBe('student.a@campus.edu');

    const reqEmpty = { body: { email: '   ' } } as Request;
    expect(emailOf(reqEmpty)).toBeNull();

    const reqMissing = { body: {} } as Request;
    expect(emailOf(reqMissing)).toBeNull();
  });

  it('el rate limit de login aísla por cuenta para que los fallos de un alumno no bloqueen a otros en la misma IP de campus', async () => {
    // Probe con limitador por IP holgado (50) y límite estricto por cuenta (2)
    const probe = express();
    probe.set('trust proxy', true);
    probe.use(express.json());

    const limiter = createLoginLimiter({ max: 50 }, { max: 2 });
    probe.post('/login', limiter, (req: Request, res: Response) => {
      res.status(401).json({ error: 'Credenciales inválidas' });
    });

    const CAMPUS_IP = '138.100.1.1';

    // 1. Alumno A falla 2 veces desde la IP del campus
    const resA1 = await request(probe)
      .post('/login')
      .set('X-Forwarded-For', CAMPUS_IP)
      .send({ email: 'studentA@campus.vtb', password: 'wrong1' });
    expect(resA1.status).toBe(401);

    const resA2 = await request(probe)
      .post('/login')
      .set('X-Forwarded-For', CAMPUS_IP)
      .send({ email: 'studentA@campus.vtb', password: 'wrong2' });
    expect(resA2.status).toBe(401);

    // 2. Alumno A intenta una 3ª vez desde el campus -> bloqueado por límite de cuenta (429)
    const resA3 = await request(probe)
      .post('/login')
      .set('X-Forwarded-For', CAMPUS_IP)
      .send({ email: 'studentA@campus.vtb', password: 'wrong3' });
    expect(resA3.status).toBe(429);
    expect(resA3.body.error).toContain('Demasiados intentos para esta cuenta');

    // 3. Alumno B intenta login desde la MISMA IP de campus ('138.100.1.1')
    // Con el fallo original por IP, Alumno B estaría bloqueado.
    // Con la corrección (aislamiento por cuenta), Alumno B puede intentar loguearse con normalidad.
    const resB1 = await request(probe)
      .post('/login')
      .set('X-Forwarded-For', CAMPUS_IP)
      .send({ email: 'studentB@campus.vtb', password: 'any' });
    expect(resB1.status).toBe(401); // No 429
  });

  it('los logins exitosos no deben consumir el cupo de la cuenta ni de la red (skipSuccessfulRequests)', async () => {
    const probe = express();
    probe.set('trust proxy', true);
    probe.use(express.json());

    // Límite de 2 peticiones con skipSuccessfulRequests activo
    const limiter = createLoginLimiter({ max: 2 }, { max: 2 });
    probe.post('/login', limiter, (req: Request, res: Response) => {
      if (req.body.password === 'correct') {
        return res.status(200).json({ token: 'jwt-token-123' });
      }
      return res.status(401).json({ error: 'Credenciales inválidas' });
    });

    const CAMPUS_IP = '138.100.2.2';

    // Realizamos 4 logins exitosos seguidos desde la misma cuenta y misma IP
    for (let i = 0; i < 4; i++) {
      const res = await request(probe)
        .post('/login')
        .set('X-Forwarded-For', CAMPUS_IP)
        .send({ email: 'studentC@campus.vtb', password: 'correct' });
      expect(res.status).toBe(200);
    }

    // Ninguno de los logins exitosos bloqueó la cuenta ni la IP
    const testRes = await request(probe)
      .post('/login')
      .set('X-Forwarded-For', CAMPUS_IP)
      .send({ email: 'studentC@campus.vtb', password: 'correct' });
    expect(testRes.status).toBe(200);
  });

  it('la red de seguridad por IP frena ataques de fuerza bruta distribuidos sobre múltiples cuentas desde un mismo origen', async () => {
    const probe = express();
    probe.set('trust proxy', true);
    probe.use(express.json());

    // Límite por IP bajo (3) para verificar que la red de seguridad actúa ante ataques
    const limiter = createLoginLimiter({ max: 3 }, { max: 100 });
    probe.post('/login', limiter, (_req: Request, res: Response) => {
      res.status(401).json({ error: 'Credenciales inválidas' });
    });

    const ATTACKER_IP = '198.51.100.42';

    // El atacante rota emails en cada petición
    for (let i = 1; i <= 3; i++) {
      const res = await request(probe)
        .post('/login')
        .set('X-Forwarded-For', ATTACKER_IP)
        .send({ email: `victim${i}@campus.vtb`, password: 'guess' });
      expect(res.status).toBe(401);
    }

    // En la 4ª petición desde esa IP, el limitador de IP corta el ataque
    const resBlocked = await request(probe)
      .post('/login')
      .set('X-Forwarded-For', ATTACKER_IP)
      .send({ email: 'victim4@campus.vtb', password: 'guess' });
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.body.error).toContain('Demasiados intentos de inicio de sesión desde esta red');
  });
});
