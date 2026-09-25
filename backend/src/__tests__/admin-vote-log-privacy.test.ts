/**
 * SCRUM-17, primer paso: el panel de administración no da nada que se pueda
 * cruzar con la cadena.
 *
 * Cada voto se publica en el contrato como VoteCast(elección, nullifier,
 * candidato, hora). GET /admin/audit devolvía a cualquier administrador de
 * institución el email de cada votante con ese mismo nullifier y la hora
 * exacta, y el dashboard daba el email y la hora de los últimos votos: basta
 * con buscar el nullifier, o la hora, en los eventos del contrato para saber
 * qué votó cada persona.
 *
 * La comprobación se hace sobre el JSON entero, buscando el valor del
 * nullifier en cualquier forma, no solo sobre el nombre del campo: un campo
 * renombrado seguiría filtrando lo mismo.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase } from '../config/database.js';
import { createAndLogin, createFixtureUser, createFixtureElection } from './helpers/fixtures.js';

const DOMAIN = `privacidad-${Date.now()}.test`;
const NULLIFIER = `0x${'ab12'.repeat(16)}`;

let admin: Awaited<ReturnType<typeof createAndLogin>>;
let voterEmail: string;

beforeAll(async () => {
  const db = getDatabase();
  admin = await createAndLogin({ role: 'admin', adminDomain: DOMAIN });
  const voter = await createFixtureUser({ email: `votante@${DOMAIN}` });
  voterEmail = voter.email;

  const electionId = await createFixtureElection({});
  await db.exec('INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)', [electionId, DOMAIN]);
  const cand = await db.get<{ id: number }>('SELECT id FROM candidates WHERE election_id = ? LIMIT 1', [electionId]);
  await db.exec(
    `INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, candidate_id, vote_source, generated_at)
     VALUES (?, ?, ?, ?, ?, 'chain', '2026-09-25 10:37:12')`,
    [voter.id, electionId, NULLIFIER, String(cand!.id), cand!.id],
  );
});

function expectNothingLinkable(json: string) {
  // El nullifier, en hexadecimal con o sin 0x, o en trozos como los que
  // enseñaba el panel (los 10 primeros caracteres).
  expect(json).not.toContain(NULLIFIER.slice(2));
  expect(json).not.toContain(NULLIFIER.slice(0, 10));
  // Ni la hora del voto, en ningún formato habitual.
  expect(json).not.toMatch(/10:37/);
  expect(json).not.toMatch(/T10:37|09:37|12:37/);
}

describe('GET /admin/audit — quién ha participado, no qué ha votado', () => {
  it('lleva el email y el día, pero ni el nullifier ni la hora', async () => {
    const res = await admin.agent.get('/admin/audit');
    expect(res.status).toBe(200);
    const fila = res.body.audit.find((e: any) => e.email === voterEmail);
    expect(fila).toBeTruthy();
    expect(fila.voted_on).toBe('2026-09-25');
    expect(fila).not.toHaveProperty('nullifier_hash');
    expect(fila).not.toHaveProperty('generated_at');
    expect(fila).not.toHaveProperty('id');
    expectNothingLinkable(JSON.stringify(res.body));
  });
});

describe('GET /admin/dashboard — votos recientes sin persona', () => {
  it('no lleva el email de quien votó', async () => {
    const res = await admin.agent.get('/admin/dashboard');
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body.recentVotes ?? []);
    expect(json).not.toContain(voterEmail);
    expect(json).not.toContain(NULLIFIER.slice(2));
  });
});
