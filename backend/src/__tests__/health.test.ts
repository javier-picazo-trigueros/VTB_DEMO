/**
 * GET /health — R5.
 *
 * Antes devolvía 200 OK sin tocar la base de datos. Con la DATABASE_URL mal
 * puesta, el backend se declaraba sano mientras todo lo demás respondía 500, y
 * Render usa esta respuesta para decidir si un despliegue está sano.
 *
 * Los casos de fallo sustituyen el cliente de base de datos por uno falso con
 * setDbClientForTesting, y restauran el real después de cada test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDbClient, setDbClientForTesting, type DbClient } from '../db/index.js';

const clienteReal = getDbClient();

/** Cliente falso: el health check solo llama a get(). */
function clienteFalso(get: DbClient['get']): DbClient {
  return { get } as unknown as DbClient;
}

afterEach(() => {
  setDbClientForTesting(clienteReal);
  delete process.env.HEALTH_DB_TIMEOUT_MS;
});

describe('GET /health — base de datos disponible', () => {
  it('devuelve 200 y database=ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.database).toBe('ok');
  });

  it('no se cachea', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /health — base de datos caída', () => {
  it('devuelve 503 si la consulta falla', async () => {
    setDbClientForTesting(clienteFalso(async () => {
      throw new Error('getaddrinfo ENOTFOUND db.ejemplo.supabase.co');
    }));

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('ERROR');
    expect(res.body.database).toBe('unreachable');
  });

  it('no filtra el mensaje de error de la base en la respuesta pública', async () => {
    setDbClientForTesting(clienteFalso(async () => {
      throw new Error('password authentication failed for user "postgres.secreto"');
    }));

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|secreto|password|ENOTFOUND|supabase/i);
  });

  it('devuelve 503 dentro del tiempo máximo si la base se cuelga en vez de fallar', async () => {
    // Una promesa que nunca se resuelve: sin el tiempo máximo, la petición
    // esperaría indefinidamente y el health check de la plataforma caducaría.
    process.env.HEALTH_DB_TIMEOUT_MS = '150';
    setDbClientForTesting(clienteFalso(() => new Promise(() => {})));

    const inicio = Date.now();
    const res = await request(app).get('/health');
    const ms = Date.now() - inicio;

    expect(res.status).toBe(503);
    expect(ms).toBeLessThan(2000);
  });

  it('el alias /api/health se comporta igual (lo usa docker-compose)', async () => {
    setDbClientForTesting(clienteFalso(async () => { throw new Error('caída'); }));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
  });
});
