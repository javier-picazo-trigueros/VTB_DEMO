/**
 * Un origen que CORS rechaza responde 403, no 500, y no deja un "Error no
 * manejado" en el log: es tráfico ajeno esperable (un bot, otro dominio), no un
 * fallo del servidor. El 500 además ensuciaba las alertas y los health checks.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

afterEach(() => vi.restoreAllMocks());

describe('origen rechazado por CORS', () => {
  it('responde 403 y no 500', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/health').set('Origin', 'https://sitio-ajeno.example');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Origen no permitido' });
  });

  it('no escribe "Error no manejado" ni ningún console.error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).get('/health').set('Origin', 'https://sitio-ajeno.example');
    await request(app).options('/health').set('Origin', 'https://sitio-ajeno.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(error).not.toHaveBeenCalled();
  });

  it('un origen permitido sigue funcionando', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect([200, 503]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
