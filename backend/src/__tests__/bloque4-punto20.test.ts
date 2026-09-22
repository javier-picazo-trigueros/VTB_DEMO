import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase } from '../config/database.js';
import { createAndLogin, createFixtureUser } from './helpers/fixtures.js';

describe('Bloque 4 - Punto 20: Límites y aislamiento en administración electoral', () => {
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    db = getDatabase();
  });

  describe('Límite de candidatos (máximo 64 por contrato)', () => {
    it('rechaza crear una elección con más de 64 candidatos', async () => {
      const admin = await createAndLogin({
        role: 'admin',
        adminDomain: 'candidatos-limit.test',
      });

      const candidates65 = Array.from({ length: 65 }, (_, i) => ({
        name: `Candidato ${i + 1}`,
      }));

      const now = Math.floor(Date.now() / 1000);
      const res = await admin.agent
        .post('/admin/elections')
        .set('X-CSRF-Token', admin.csrf)
        .send({
          name: 'Elección con 65 candidatos',
          start_time: now + 3600,
          end_time: now + 7200,
          target_type: 'domain',
          target_values: ['candidatos-limit.test'],
          candidates: candidates65,
        });

      expect(res.status).toBe(400);
    });

    it('rechaza añadir un candidato si la elección ya tiene 64 candidatos', async () => {
      const admin = await createAndLogin({
        role: 'admin',
        adminDomain: 'candidatos-add-limit.test',
      });

      const candidates64 = Array.from({ length: 64 }, (_, i) => ({
        name: `Candidato ${i + 1}`,
      }));

      const now = Math.floor(Date.now() / 1000);
      const resCrear = await admin.agent
        .post('/admin/elections')
        .set('X-CSRF-Token', admin.csrf)
        .send({
          name: 'Elección con 64 candidatos',
          start_time: now + 3600,
          end_time: now + 7200,
          target_type: 'domain',
          target_values: ['candidatos-add-limit.test'],
          candidates: candidates64,
        });

      expect(resCrear.status).toBe(200);
      const electionId = resCrear.body.electionId;

      const resAdd = await admin.agent
        .post(`/admin/elections/${electionId}/candidates`)
        .set('X-CSRF-Token', admin.csrf)
        .send({ name: 'Candidato 65 no permitido' });

      expect(resAdd.status).toBe(400);
      expect(resAdd.body.error).toMatch(/64/);
    });
  });

  describe('Aislamiento institucional de censo por escuela / titulación', () => {
    it('no añade a la elección votantes de otra institución aunque compartan nombre de escuela o titulación', async () => {
      const adminDomainA = `inst-a-${Date.now()}.test`;
      const domainB = `inst-b-${Date.now()}.test`;

      const adminA = await createAndLogin({
        role: 'admin',
        adminDomain: adminDomainA,
        email: `admin@${adminDomainA}`,
      });

      const userA = await createFixtureUser({
        email: `alumno1@${adminDomainA}`,
        name: 'Alumno Inst A',
      });
      const userB = await createFixtureUser({
        email: `alumno2@${domainB}`,
        name: 'Alumno Inst B',
      });

      // Asignar misma escuela a ambos usuarios en la BD
      await db.exec("UPDATE users SET school = 'Escuela Politécnica', degree = 'Grado en Informática' WHERE id IN (?, ?)", [
        userA.id,
        userB.id,
      ]);

      const now = Math.floor(Date.now() / 1000);
      const res = await adminA.agent
        .post('/admin/elections')
        .set('X-CSRF-Token', adminA.csrf)
        .send({
          name: 'Elección Escuela Politécnica A',
          start_time: now + 3600,
          end_time: now + 7200,
          target_type: 'domain',
          target_values: [adminDomainA],
          target_schools: ['Escuela Politécnica'],
          candidates: [{ name: 'Candidato 1' }, { name: 'Candidato 2' }],
        });

      expect(res.status).toBe(200);
      const electionId = res.body.electionId;

      // Comprobar votantes asignados en election_voters
      const voters = await db.run<{ user_id: number }>(
        'SELECT user_id FROM election_voters WHERE election_id = ?',
        [electionId],
      );
      const voterIds = voters.map(v => v.user_id);

      // Debe incluir userA (de su institución), pero BAJO NINGÚN CONCEPTO userB (de otra institución)
      expect(voterIds).toContain(userA.id);
      expect(voterIds).not.toContain(userB.id);
    });
  });

  describe('Avisos masivos para censos mayores de 1000 votantes', () => {
    it('encola todos los avisos de apertura sin truncar en 1000', async () => {
      const domain = `census-large-${Date.now()}.test`;
      const admin = await createAndLogin({
        role: 'admin',
        adminDomain: domain,
        email: `admin@${domain}`,
      });

      const now = Math.floor(Date.now() / 1000);
      const res = await admin.agent
        .post('/admin/elections')
        .set('X-CSRF-Token', admin.csrf)
        .send({
          name: 'Elección Censo Masivo',
          start_time: now + 3600,
          end_time: now + 7200,
          target_type: 'domain',
          target_values: [domain],
          candidates: [{ name: 'Candidato 1' }, { name: 'Candidato 2' }],
        });

      expect(res.status).toBe(200);
      const electionId = res.body.electionId;

      // Insertar 1005 votantes en la BD para esta elección
      const totalVoters = 1005;
      const userInserts: Promise<any>[] = [];
      for (let i = 1; i <= totalVoters; i++) {
        userInserts.push(
          db.exec(
            `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, is_eligible)
             VALUES (?, 'hash', ?, ?, 'voter', 1, 1)`,
            [`voter-${i}@${domain}`, `Votante ${i}`, `STU-${Date.now()}-${i}`],
          ).then(r => {
            return db.exec(
              'INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)',
              [electionId, r.lastID],
            );
          }),
        );
      }
      await Promise.all(userInserts);

      // Lanzar aviso masivo
      const notifyRes = await admin.agent
        .post(`/admin/elections/${electionId}/notify-open`)
        .set('X-CSRF-Token', admin.csrf)
        .send({});

      expect(notifyRes.status).toBe(200);
      expect(notifyRes.body.queued).toBeGreaterThanOrEqual(1005);
    });
  });
});
