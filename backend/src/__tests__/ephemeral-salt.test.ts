import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { generateNullifier } from '../utils/auth.js';
import { getDbClient } from '../db/index.js';
import { destroyElectionSaltIfComplete } from '../services/electionSalt.js';

describe('Parte 4: Sal efímera por elección y protección de privacidad post-cierre', () => {

  it('generateNullifier produce hashes distintos para la misma elección con diferente sal', () => {
    const salt1 = crypto.randomBytes(32).toString('hex');
    const salt2 = crypto.randomBytes(32).toString('hex');

    const n1 = generateNullifier(1, 10, salt1);
    const n2 = generateNullifier(1, 10, salt2);
    const n1_repeat = generateNullifier(1, 10, salt1);

    expect(n1).toMatch(/^0x[a-f0-9]{64}$/);
    expect(n2).toMatch(/^0x[a-f0-9]{64}$/);
    expect(n1).toBe(n1_repeat); // Determinista con la misma sal
    expect(n1).not.toBe(n2);    // Distinto con distinta sal
  });

  it('no destruye la sal de la elección mientras esté abierta', async () => {
    const db = getDbClient();
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const salt = crypto.randomBytes(32).toString('hex');

    const res = await db.exec(
      `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, ephemeral_salt)
       VALUES (1, 'Elección Activa', 'Test', 1000, ?, 1, ?)`,
      [futureTime, salt],
    );
    const electionId = res.lastID;

    const destroyed = await destroyElectionSaltIfComplete(electionId, db);
    expect(destroyed).toBe(false);

    const election = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?',
      [electionId],
    );
    expect(election?.ephemeral_salt).toBe(salt);
  });

  it('no destruye la sal de una elección cerrada si todavía tiene intentos pendientes (vote_attempts)', async () => {
    const db = getDbClient();
    const pastTime = Math.floor(Date.now() / 1000) - 100;
    const salt = crypto.randomBytes(32).toString('hex');

    const res = await db.exec(
      `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, ephemeral_salt)
       VALUES (2, 'Elección Cerrada Con Pendientes', 'Test', 1000, ?, 1, ?)`,
      [pastTime, salt],
    );
    const electionId = res.lastID;

    // Simular un intento pendiente en vote_attempts
    await db.exec(
      `INSERT INTO vote_attempts (user_id, election_id, status, nullifier_hash, candidate_id)
       VALUES (1, ?, 'pending', '0xabc', 1)`,
      [electionId],
    );

    const destroyed = await destroyElectionSaltIfComplete(electionId, db);
    expect(destroyed).toBe(false);

    const election = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?',
      [electionId],
    );
    expect(election?.ephemeral_salt).toBe(salt);
  });

  it('destruye la sal una vez cerrada la elección y resueltos todos los intentos pendientes', async () => {
    const db = getDbClient();
    const pastTime = Math.floor(Date.now() / 1000) - 100;
    const salt = crypto.randomBytes(32).toString('hex');

    const res = await db.exec(
      `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, ephemeral_salt)
       VALUES (3, 'Elección Cerrada Sin Pendientes', 'Test', 1000, ?, 1, ?)`,
      [pastTime, salt],
    );
    const electionId = res.lastID;

    // Intentos fallidos o resueltos (ninguno 'pending')
    await db.exec(
      `INSERT INTO vote_attempts (user_id, election_id, status, nullifier_hash, candidate_id)
       VALUES (1, ?, 'failed', '0xabc', 1)`,
      [electionId],
    );

    const destroyed = await destroyElectionSaltIfComplete(electionId, db);
    expect(destroyed).toBe(true);

    const election = await db.get<{ ephemeral_salt: string | null }>(
      'SELECT ephemeral_salt FROM elections WHERE id = ?',
      [electionId],
    );
    expect(election?.ephemeral_salt).toBeNull();
  });
});
