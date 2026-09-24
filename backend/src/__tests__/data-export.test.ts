/**
 * Paso C, punto e: portabilidad de datos (GET /auth/me/export).
 *
 * Contra el comportamiento real de la ruta: se comprueba el contenido de la
 * respuesta (perfil, censo, votos propios), no solo el código de estado.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createAndLogin, createFixtureElection } from './helpers/fixtures.js';

const db = getDatabase();

describe('GET /auth/me/export', () => {
  it('devuelve el perfil propio, sin password_hash', async () => {
    const user = await createAndLogin({ name: 'Exportable Persona' });

    const res = await user.agent.get('/auth/me/export');

    expect(res.status).toBe(200);
    expect(res.body.perfil.email).toBe(user.email);
    expect(res.body.perfil.name).toBe('Exportable Persona');
    expect(res.body.perfil.password_hash).toBeUndefined();
    expect(Array.isArray(res.body.votos_emitidos)).toBe(true);
    expect(Array.isArray(res.body.elecciones_censado)).toBe(true);
  });

  it('incluye las elecciones en las que está censado, pero no las de otros usuarios', async () => {
    const votante = await createAndLogin();
    const otro = await createAndLogin();
    const electionId = await createFixtureElection({ name: 'Elección Portabilidad' });

    await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, votante.id]);
    await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, otro.id]);

    const res = await votante.agent.get('/auth/me/export');

    expect(res.status).toBe(200);
    const propias = res.body.elecciones_censado.filter((e: any) => e.election_id === electionId);
    expect(propias).toHaveLength(1);
  });

  it('incluye el propio voto emitido (nullifier_audit) cuando existe', async () => {
    const user = await createAndLogin();
    const electionId = await createFixtureElection({ name: 'Elección Con Voto' });
    const candidato = await db.get<{ id: number }>(
      'SELECT id FROM candidates WHERE election_id = ? LIMIT 1',
      [electionId],
    );

    await db.exec(
      `INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, candidate_id)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, electionId, `hash-export-${Date.now()}`, 'Candidata A', candidato!.id],
    );

    const res = await user.agent.get('/auth/me/export');

    expect(res.status).toBe(200);
    const voto = res.body.votos_emitidos.find((v: any) => v.election_id === electionId);
    expect(voto).toBeTruthy();
    expect(voto.candidate_name).toBe('Candidata A');
  });

  it('sin sesión, responde 401', async () => {
    const res = await request(app).get('/auth/me/export');
    expect(res.status).toBe(401);
  });
});
