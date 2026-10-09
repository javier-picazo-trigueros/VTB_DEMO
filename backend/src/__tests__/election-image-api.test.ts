/**
 * La imagen de una elección tiene que llegar a las tres pantallas que la
 * muestran: la lista, la cabina (GET /:id) y los resultados (GET /:id/results).
 * Antes /results no la devolvía y ninguna pantalla la pintaba.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createFixtureElection } from './helpers/fixtures.js';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

describe('imageUrl de la elección en la API', () => {
  it('GET /api/elections/:id/results devuelve la imagen guardada', async () => {
    const id = await createFixtureElection({});
    await getDatabase().exec('UPDATE elections SET image_url = ? WHERE id = ?', [PIXEL, id]);

    const res = await request(app).get(`/api/elections/${id}/results`);

    expect(res.status).toBe(200);
    expect(res.body.election.imageUrl).toBe(PIXEL);
  });

  it('GET /api/elections/:id/results devuelve null si no hay imagen', async () => {
    const id = await createFixtureElection({});

    const res = await request(app).get(`/api/elections/${id}/results`);

    expect(res.status).toBe(200);
    expect(res.body.election.imageUrl).toBeNull();
  });

  it('GET /api/elections/:id (cabina) devuelve la imagen guardada', async () => {
    const id = await createFixtureElection({});
    await getDatabase().exec('UPDATE elections SET image_url = ? WHERE id = ?', [PIXEL, id]);

    const res = await request(app).get(`/api/elections/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.election.imageUrl).toBe(PIXEL);
  });
});
