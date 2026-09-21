import { describe, it, expect, beforeAll } from 'vitest';
import { createFixtureUser, loginAsFixture } from './helpers/fixtures.js';

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('BLOQUE 1.1 — Escalada de privilegios en POST /admin/users y POST /admin/users/import', () => {
  let scopedAdmin: { email: string; password: string };
  let unscopedAdmin: { email: string; password: string };

  beforeAll(async () => {
    scopedAdmin = await createFixtureUser({
      role: 'admin',
      adminDomain: 'scoped.vtb',
    });
    unscopedAdmin = await createFixtureUser({
      role: 'admin',
      adminDomain: null,
    });
  });

  describe('Caso 1: Un admin creando un admin de otro dominio o sin ámbito', () => {
    it('un admin no puede crear un admin con un admin_domain fuera de su ámbito (403)', async () => {
      const { agent, csrf } = await loginAsFixture(scopedAdmin.email, scopedAdmin.password);

      const res = await agent
        .post('/admin/users')
        .set('X-CSRF-Token', csrf)
        .send({
          email: `newadmin-${Date.now()}@scoped.vtb`,
          password: 'Password123!',
          name: 'Attacker Admin',
          student_id: `ID-${Date.now()}`,
          role: 'admin',
          admin_domain: 'other.vtb', // Otro dominio distinto a scoped.vtb
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/dominio/i);
    });

    it('un admin no puede crear un admin sin ámbito / global (admin_domain: null) (403)', async () => {
      const { agent, csrf } = await loginAsFixture(scopedAdmin.email, scopedAdmin.password);

      const res = await agent
        .post('/admin/users')
        .set('X-CSRF-Token', csrf)
        .send({
          email: `newadmin-null-${Date.now()}@scoped.vtb`,
          password: 'Password123!',
          name: 'Unscoped Admin Attempt',
          student_id: `ID-NULL-${Date.now()}`,
          role: 'admin',
          admin_domain: null, // Intento de crear admin sin ámbito
        });

      expect(res.status).toBe(403);
    });

    it('un admin sí puede crear un admin para su propio dominio o subdominio (200)', async () => {
      const { agent, csrf } = await loginAsFixture(scopedAdmin.email, scopedAdmin.password);

      const res = await agent
        .post('/admin/users')
        .set('X-CSRF-Token', csrf)
        .send({
          email: `legitadmin-${Date.now()}@scoped.vtb`,
          password: 'Password123!',
          name: 'Legit Admin',
          student_id: `ID-LEGIT-${Date.now()}`,
          role: 'admin',
          admin_domain: 'scoped.vtb',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Caso 2: Un admin creando un superadmin (también por CSV)', () => {
    it('un admin no puede crear un superadmin a través de POST /admin/users/import (400 con error)', async () => {
      const { agent, csrf } = await loginAsFixture(scopedAdmin.email, scopedAdmin.password);

      const csv = [
        'email,full_name,student_id,role',
        `attacker-${Date.now()}@scoped.vtb,Hacker SuperAdmin,HACK-001,superadmin`,
      ].join('\n');

      const res = await agent
        .post('/admin/users/import')
        .set('X-CSRF-Token', csrf)
        .attach('file', csvBuffer(csv), { filename: 'exploit.csv', contentType: 'text/csv' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/superadministrador/i);
    });
  });

  describe('Caso 3: Un admin sin ámbito concediendo cualquier cosa', () => {
    it('un admin sin ámbito no puede crear usuarios mediante POST /admin/users (403)', async () => {
      const { agent, csrf } = await loginAsFixture(unscopedAdmin.email, unscopedAdmin.password);

      const res = await agent
        .post('/admin/users')
        .set('X-CSRF-Token', csrf)
        .send({
          email: `victim-${Date.now()}@anydomain.edu`,
          password: 'Password123!',
          name: 'Victim User',
          student_id: `VIC-${Date.now()}`,
          role: 'student',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/ámbito|dominio/i);
    });

    it('un admin sin ámbito no puede importar usuarios mediante POST /admin/users/import (403)', async () => {
      const { agent, csrf } = await loginAsFixture(unscopedAdmin.email, unscopedAdmin.password);

      const csv = [
        'email,full_name,student_id',
        `victim-${Date.now()}@anydomain.edu,Victim User,VIC-001`,
      ].join('\n');

      const res = await agent
        .post('/admin/users/import')
        .set('X-CSRF-Token', csrf)
        .attach('file', csvBuffer(csv), { filename: 'census.csv', contentType: 'text/csv' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/ámbito|dominio/i);
    });

    it('un admin sin ámbito no puede aprobar o revocar usuarios mediante PATCH /admin/users/:id/approval (403)', async () => {
      const victim = await createFixtureUser({ email: `target-${Date.now()}@target.edu` });
      const { agent, csrf } = await loginAsFixture(unscopedAdmin.email, unscopedAdmin.password);

      const res = await agent
        .patch(`/admin/users/${victim.id}/approval`)
        .set('X-CSRF-Token', csrf)
        .send({ approved: false });

      expect(res.status).toBe(403);
    });

    it('un admin sin ámbito no puede eliminar usuarios mediante DELETE /admin/users/:id (403)', async () => {
      const victim = await createFixtureUser({ email: `target-del-${Date.now()}@target.edu` });
      const { agent, csrf } = await loginAsFixture(unscopedAdmin.email, unscopedAdmin.password);

      const res = await agent
        .delete(`/admin/users/${victim.id}`)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(403);
    });
  });
});
