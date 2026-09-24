/**
 * SCRUM-16 — El recuento no es público hasta el cierre.
 *
 * Criterio de aceptación: ninguna respuesta de la API revela el reparto por
 * candidato antes del cierre a quien no sea administrador de esa elección.
 *
 * Se comprueba en las dos direcciones, igual que admin-election-scope: que un
 * anónimo no lo ve, y que el administrador legítimo sí. Un corte que ocultara
 * el recuento a todo el mundo pasaría la mitad "anónimo" igual de verde.
 *
 * "No lo ve" se comprueba sobre el JSON entero, no sobre un campo: el reparto
 * también viajaba dentro de verificacion.recuentoBase y recuentoCadena.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDatabase } from '../config/database.js';
import { createAndLogin, createFixtureUser, createFixtureElection } from './helpers/fixtures.js';

type Actor = Awaited<ReturnType<typeof createAndLogin>>;

const DOMAIN = `resultados-${Date.now()}.test`;
const OTHER = `otra-${Date.now()}.test`;
const now = () => Math.floor(Date.now() / 1000);

let admin: Actor;
let otherAdmin: Actor;
let superadmin: Actor;
let student: Actor;

/** Elección con 3 votos a la primera candidatura y 1 a la segunda. */
async function electionWithVotes(opts: { startTime: number; endTime: number; hidden?: boolean }) {
  const db = getDatabase();
  const id = await createFixtureElection({ startTime: opts.startTime, endTime: opts.endTime });
  await db.exec('INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)', [id, DOMAIN]);
  if (opts.hidden) await db.exec('UPDATE elections SET is_active = 0 WHERE id = ?', [id]);

  const cands = await db.run<{ id: number; position: number }>(
    'SELECT id, position FROM candidates WHERE election_id = ? ORDER BY position', [id],
  );
  const reparto = [cands[0], cands[0], cands[0], cands[1]];
  for (const [i, c] of reparto.entries()) {
    const voter = await createFixtureUser({});
    await db.exec(
      `INSERT INTO nullifier_audit (user_id, election_id, nullifier_hash, vote_choice, candidate_id, vote_source)
       VALUES (?, ?, ?, ?, ?, 'demo')`,
      [voter.id, id, `0x${id}-${i}-${Date.now()}`, String(c.id), c.id],
    );
  }
  return id;
}

function expectNoTally(body: any) {
  expect(body.tallyHidden).toBe(true);
  for (const c of body.candidates) {
    expect(c).not.toHaveProperty('votes');
    expect(c).not.toHaveProperty('percentage');
  }
  expect(body.verificacion).not.toHaveProperty('recuentoBase');
  expect(body.verificacion).not.toHaveProperty('recuentoCadena');
  // Lo agregado sí se publica: es la participación.
  expect(body.totalVotes).toBe(4);
}

function expectTally(body: any) {
  expect(body.tallyHidden).toBe(false);
  expect(body.candidates.map((c: any) => c.votes)).toEqual([3, 1]);
}

let active: number;
let hiddenMidVote: number;
let finished: number;

beforeAll(async () => {
  admin = await createAndLogin({ role: 'admin', adminDomain: DOMAIN });
  otherAdmin = await createAndLogin({ role: 'admin', adminDomain: OTHER });
  superadmin = await createAndLogin({ role: 'superadmin', adminDomain: null });
  student = await createAndLogin({ email: `votante@${DOMAIN}` });

  active = await electionWithVotes({ startTime: now() - 3600, endTime: now() + 3600 });
  hiddenMidVote = await electionWithVotes({ startTime: now() - 3600, endTime: now() + 3600, hidden: true });
  finished = await electionWithVotes({ startTime: now() - 7200, endTime: now() - 60 });
});

describe('SCRUM-16 — durante la votación, nadie de fuera ve el reparto', () => {
  it('sin sesión', async () => {
    const res = await request(app).get(`/api/elections/${active}/results`);
    expect(res.status).toBe(200);
    expectNoTally(res.body);
  });

  it('un votante de esa misma institución', async () => {
    const res = await student.agent.get(`/api/elections/${active}/results`);
    expectNoTally(res.body);
  });

  it('el administrador de otra institución', async () => {
    const res = await otherAdmin.agent.get(`/api/elections/${active}/results`);
    expectNoTally(res.body);
  });

  it('tampoco si se oculta la elección a mitad de plazo (status sale "closed")', async () => {
    const res = await request(app).get(`/api/elections/${hiddenMidVote}/results`);
    expect(res.body.election.status).toBe('closed');
    expectNoTally(res.body);
  });

  it('dice cuándo se publicará', async () => {
    const res = await request(app).get(`/api/elections/${active}/results`);
    expect(new Date(res.body.tallyPublishedAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('SCRUM-16 — quien sí lo ve', () => {
  it('el administrador de esa institución, en vivo', async () => {
    const res = await admin.agent.get(`/api/elections/${active}/results`);
    expectTally(res.body);
  });

  it('el superadministrador, en vivo', async () => {
    const res = await superadmin.agent.get(`/api/elections/${active}/results`);
    expectTally(res.body);
  });

  it('cualquiera, pasada la fecha de fin', async () => {
    const res = await request(app).get(`/api/elections/${finished}/results`);
    expectTally(res.body);
  });
});

describe('SCRUM-16 — un token de administrador no basta si el rol ya no lo es', () => {
  it('un admin degradado a estudiante deja de ver el recuento en vivo', async () => {
    const degradado = await createAndLogin({ role: 'admin', adminDomain: DOMAIN });
    await getDatabase().exec("UPDATE users SET role = 'student' WHERE id = ?", [degradado.id]);
    const res = await degradado.agent.get(`/api/elections/${active}/results`);
    expectNoTally(res.body);
  });
});
