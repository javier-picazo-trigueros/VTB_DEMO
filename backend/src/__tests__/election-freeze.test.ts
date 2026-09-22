/**
 * Tests del congelamiento de elecciones y censo (Punto 10 del Bloque 2).
 *
 * 1. Tras sincronizar la elección no se puede cambiar end_time (admin/elections.ts:331).
 *    Tampoco en syncing ni en pending con transacción enviada.
 * 2. No se pueden añadir candidatos cuando la elección está synced, syncing,
 *    o pending con chain_tx_hash (admin/elections.ts:503).
 * 3. El censo queda congelado al abrir la votación (now >= start_time):
 *    - POST /admin/elections/:id/voters devuelve 409 si la votación ya abrió.
 *    - POST /admin/elections/:id/census devuelve 409 si la votación ya abrió.
 *    - La auto-asignación por registro no incluye elecciones ya iniciadas.
 */
import { describe, it, expect } from 'vitest';
import { getDbClient } from '../db/index.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';

const db = getDbClient();
const NOW = () => Math.floor(Date.now() / 1000);

describe('Punto 10: Congelamiento de elecciones y censo', () => {
  describe('Modificación de end_time (PATCH /admin/elections/:id)', () => {
    it('permite cambiar end_time si la elección no está sincronizada ni en proceso', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const electionId = await createFixtureElection({
        name: `Eleccion editable ${Date.now()}`,
        candidates: ['C1', 'C2'],
      });
      await db.exec("UPDATE elections SET chain_status = 'pending', chain_tx_hash = NULL WHERE id = ?", [electionId]);

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const newEndTime = NOW() + 7200;

      const res = await agent
        .patch(`/admin/elections/${electionId}`)
        .set('X-CSRF-Token', csrf)
        .send({ end_time: newEndTime });

      expect(res.status).toBe(200);
      const row = await db.get<{ end_time: number }>('SELECT end_time FROM elections WHERE id = ?', [electionId]);
      expect(Number(row?.end_time)).toBe(newEndTime);
    });

    it('rechaza cambiar end_time (409) si la elección está synced', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const originalEnd = NOW() + 3600;
      const electionId = await createFixtureElection({
        name: `Eleccion synced ${Date.now()}`,
        candidates: ['C1', 'C2'],
        endTime: originalEnd,
      });
      await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const res = await agent
        .patch(`/admin/elections/${electionId}`)
        .set('X-CSRF-Token', csrf)
        .send({ end_time: originalEnd + 7200 });

      expect(res.status).toBe(409);
      const row = await db.get<{ end_time: number }>('SELECT end_time FROM elections WHERE id = ?', [electionId]);
      expect(Number(row?.end_time)).toBe(originalEnd);
    });

    it('rechaza cambiar end_time (409) si la elección está syncing o pending con tx enviada', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const originalEnd = NOW() + 3600;
      const electionId = await createFixtureElection({
        name: `Eleccion syncing ${Date.now()}`,
        candidates: ['C1', 'C2'],
        endTime: originalEnd,
      });
      await db.exec(
        "UPDATE elections SET chain_status = 'pending', chain_tx_hash = '0x1234567890abcdef' WHERE id = ?",
        [electionId],
      );

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const res = await agent
        .patch(`/admin/elections/${electionId}`)
        .set('X-CSRF-Token', csrf)
        .send({ end_time: originalEnd + 7200 });

      expect(res.status).toBe(409);
    });
  });

  describe('Añadir candidatos (POST /admin/elections/:id/candidates)', () => {
    it('rechaza añadir candidatos (409) si la elección está syncing', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const electionId = await createFixtureElection({
        name: `Candidatos syncing ${Date.now()}`,
        candidates: ['C1'],
      });
      await db.exec("UPDATE elections SET chain_status = 'syncing' WHERE id = ?", [electionId]);

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const res = await agent
        .post(`/admin/elections/${electionId}/candidates`)
        .set('X-CSRF-Token', csrf)
        .send({ name: 'Nuevo Candidato' });

      expect(res.status).toBe(409);
    });

    it('rechaza añadir candidatos (409) si la elección está pending con tx enviada', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const electionId = await createFixtureElection({
        name: `Candidatos pending con tx ${Date.now()}`,
        candidates: ['C1'],
      });
      await db.exec(
        "UPDATE elections SET chain_status = 'pending', chain_tx_hash = '0xabcdef1234567890' WHERE id = ?",
        [electionId],
      );

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const res = await agent
        .post(`/admin/elections/${electionId}/candidates`)
        .set('X-CSRF-Token', csrf)
        .send({ name: 'Nuevo Candidato' });

      expect(res.status).toBe(409);
    });
  });

  describe('Censo congelado al abrir la votación (now >= start_time)', () => {
    it('permite añadir votantes si la votación aún no ha abierto (now < start_time)', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const voter = await createFixtureUser();
      const futureStart = NOW() + 3600;
      const electionId = await createFixtureElection({
        name: `Eleccion futura ${Date.now()}`,
        candidates: ['C1'],
        startTime: futureStart,
        endTime: futureStart + 3600,
      });

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const res = await agent
        .post(`/admin/elections/${electionId}/voters`)
        .set('X-CSRF-Token', csrf)
        .send({ email: voter.email });

      expect(res.status).toBe(200);
      const inCensus = await db.get(
        'SELECT election_id FROM election_voters WHERE election_id = ? AND user_id = ?',
        [electionId, voter.id],
      );
      expect(inCensus).toBeTruthy();
    });

    it('rechaza añadir votantes individuales (409) si la votación ya abrió (now >= start_time)', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const voter = await createFixtureUser();
      const pastStart = NOW() - 300; // abrió hace 5 minutos
      const electionId = await createFixtureElection({
        name: `Eleccion abierta ${Date.now()}`,
        candidates: ['C1'],
        startTime: pastStart,
        endTime: NOW() + 3600,
      });

      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);
      const res = await agent
        .post(`/admin/elections/${electionId}/voters`)
        .set('X-CSRF-Token', csrf)
        .send({ email: voter.email });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/congelado|abiert|comenzad/i);

      const inCensus = await db.get(
        'SELECT election_id FROM election_voters WHERE election_id = ? AND user_id = ?',
        [electionId, voter.id],
      );
      expect(inCensus).toBeFalsy();
    });

    it('rechaza importar CSV de censo (409) si la votación ya abrió', async () => {
      const admin = await createFixtureUser({ role: 'superadmin' });
      const pastStart = NOW() - 300;
      const electionId = await createFixtureElection({
        name: `Eleccion abierta censo CSV ${Date.now()}`,
        candidates: ['C1'],
        startTime: pastStart,
        endTime: NOW() + 3600,
      });

      const csvContent = Buffer.from('email,name,student_id\nnewvoter@vtb.test,New Voter,ST12345\n');
      const { agent, csrf } = await loginAsFixture(admin.email, admin.password);

      const res = await agent
        .post(`/admin/elections/${electionId}/import-voters`)
        .set('X-CSRF-Token', csrf)
        .attach('file', csvContent, 'censo.csv');

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/congelado|abiert|comenzad/i);
    });

    it('no auto-asigna a elecciones activas cuando un nuevo usuario se registra', async () => {
      const pastStart = NOW() - 300;
      const openElectionId = await createFixtureElection({
        name: `Eleccion abierta auto-asignacion ${Date.now()}`,
        candidates: ['C1'],
        startTime: pastStart,
        endTime: NOW() + 3600,
      });
      // Configurar election_access para el dominio del usuario
      await db.exec(
        "INSERT INTO election_access (election_id, email_domain) VALUES (?, '*')",
        [openElectionId],
      );

      // Registrar o autorizar un usuario
      const user = await createFixtureUser({ email: `voter-auto-${Date.now()}@vtb.test` });

      // Comprobar que NO está en el censo de openElectionId
      const inCensus = await db.get(
        'SELECT election_id FROM election_voters WHERE election_id = ? AND user_id = ?',
        [openElectionId, user.id],
      );
      expect(inCensus).toBeFalsy();
    });
  });
});
