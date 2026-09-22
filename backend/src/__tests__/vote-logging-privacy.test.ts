import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { createAndLogin, createFixtureElection, createFixtureUser } from './helpers/fixtures.js';
import { getDatabase } from '../config/database.js';

describe('Privacidad de logs: prevención de correlación temporal y fuga de opción de voto', () => {
  it('no registra en logs de consola el candidato, el nullifier ni la marca de tiempo exacta al votar', async () => {
    const db = getDatabase();
    const domain = `vote-log-${Date.now()}.test`;
    const voter = await createAndLogin({
      email: `voter@${domain}`,
      role: 'student',
    });

    const electionId = await createFixtureElection({
      candidates: ['Candidata A', 'Candidato B'],
    });

    // Asignar al censo
    await db.exec(
      'INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)',
      [electionId, voter.id],
    );

    // Obtener candidatos de la elección
    const candidates = await db.run<{ id: number; position: number }>(
      'SELECT id, position FROM candidates WHERE election_id = ?',
      [electionId],
    );
    expect(candidates.length).toBeGreaterThan(0);
    const chosenCandidate = candidates[0];

    const logMessages: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logMessages.push(args.map(a => String(a)).join(' '));
    });

    try {
      await voter.agent
        .post('/api/elections/register-vote')
        .set('X-CSRF-Token', voter.csrf)
        .send({
          electionId: electionId,
          candidateId: chosenCandidate.id,
        });

      const allLogs = logMessages.join('\n');

      // 1. NO debe registrar la posición del candidato ni la opción votada
      expect(allLogs).not.toMatch(/Candidate \(position\)/i);
      expect(allLogs).not.toMatch(new RegExp(`candidato.*${chosenCandidate.id}`, 'i'));

      // 2. NO debe registrar el nullifier (ni siquiera prefijo)
      expect(allLogs).not.toMatch(/Nullifier:\s*0x/i);

      // 3. El middleware general de peticiones NO debe registrar la ruta de voto con timestamp al milisegundo
      // para evitar correlación temporal con los bloques de la cadena
      expect(allLogs).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*-\s*POST\s*\/api\/elections\/register-vote/i);
    } finally {
      spy.mockRestore();
    }
  });
});
