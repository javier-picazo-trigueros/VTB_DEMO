/**
 * Paso C, punto c: jobs de conservación (Política de Privacidad, sección 6).
 * Contra el comportamiento real de las funciones sobre una base real
 * (SQLite en memoria), sembrando filas con fechas concretas — no mocks del
 * paso del tiempo.
 */
import { describe, it, expect } from 'vitest';
import { getDbClient } from '../db/index.js';
import { createFixtureUser } from './helpers/fixtures.js';
import {
  purgeRejectedRegistrationRequests,
  purgeOldEmailLog,
  purgeExpiredAuthTokens,
  anonymizeDeletedAccounts,
} from '../services/retention.js';

const db = getDbClient();

/** 'YYYY-MM-DD HH:MM:SS' en UTC, el mismo formato que CURRENT_TIMESTAMP. */
function hace(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
function enHoras(horas: number): string {
  return hace(-horas);
}

describe('purgeRejectedRegistrationRequests', () => {
  it('borra rechazadas de hace más de 30 días, conserva las más recientes y las pendientes', async () => {
    const sufijo = Date.now();
    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, status, reviewed_at, created_at)
       VALUES ('Vieja Rechazada', ?, ?, 'rejected', ?, ?)`,
      [`vieja-rechazada-${sufijo}@test.vtb`, `RR-OLD-${sufijo}`, hace(31 * 24), hace(31 * 24)],
    );
    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, status, reviewed_at, created_at)
       VALUES ('Reciente Rechazada', ?, ?, 'rejected', ?, ?)`,
      [`reciente-rechazada-${sufijo}@test.vtb`, `RR-NEW-${sufijo}`, hace(29 * 24), hace(29 * 24)],
    );
    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, status, created_at)
       VALUES ('Pendiente Vieja', ?, ?, 'pending', ?)`,
      [`pendiente-vieja-${sufijo}@test.vtb`, `RR-PEND-${sufijo}`, hace(60 * 24)],
    );

    const borradas = await purgeRejectedRegistrationRequests(db);
    expect(borradas).toBeGreaterThanOrEqual(1);

    const vieja = await db.get('SELECT id FROM registration_requests WHERE email = ?', [`vieja-rechazada-${sufijo}@test.vtb`]);
    const reciente = await db.get('SELECT id FROM registration_requests WHERE email = ?', [`reciente-rechazada-${sufijo}@test.vtb`]);
    const pendiente = await db.get('SELECT id FROM registration_requests WHERE email = ?', [`pendiente-vieja-${sufijo}@test.vtb`]);

    expect(vieja).toBeFalsy();
    expect(reciente).toBeTruthy();
    expect(pendiente, 'una pendiente nunca se borra por antigua que sea').toBeTruthy();
  });
});

describe('purgeOldEmailLog', () => {
  it('borra correos de hace más de 90 días, conserva los recientes', async () => {
    const sufijo = Date.now();
    await db.exec(
      `INSERT INTO email_log (recipient, template_name, subject, status, created_at)
       VALUES (?, 'test', 'asunto', 'sent', ?)`,
      [`viejo-${sufijo}@test.vtb`, hace(91 * 24)],
    );
    await db.exec(
      `INSERT INTO email_log (recipient, template_name, subject, status, created_at)
       VALUES (?, 'test', 'asunto', 'sent', ?)`,
      [`reciente-${sufijo}@test.vtb`, hace(89 * 24)],
    );

    await purgeOldEmailLog(db);

    const viejo = await db.get('SELECT id FROM email_log WHERE recipient = ?', [`viejo-${sufijo}@test.vtb`]);
    const reciente = await db.get('SELECT id FROM email_log WHERE recipient = ?', [`reciente-${sufijo}@test.vtb`]);
    expect(viejo).toBeFalsy();
    expect(reciente).toBeTruthy();
  });
});

describe('purgeExpiredAuthTokens', () => {
  it('borra usados hace más de 24h y caducados sin usar hace más de 24h; conserva los vigentes', async () => {
    const user = await createFixtureUser();

    // Usado hace 25h -> se borra
    await db.exec(
      `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at, used_at)
       VALUES (?, ?, 'reset', ?, ?)`,
      [user.id, `hash-usado-viejo-${Date.now()}`, hace(24 * 7), hace(25)],
    );
    // Usado hace 1h -> se conserva
    await db.exec(
      `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at, used_at)
       VALUES (?, ?, 'reset', ?, ?)`,
      [user.id, `hash-usado-reciente-${Date.now()}`, hace(24 * 7), hace(1)],
    );
    // Nunca usado, caducó hace 25h -> se borra
    await db.exec(
      `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at, used_at)
       VALUES (?, ?, 'reset', ?, NULL)`,
      [user.id, `hash-caducado-${Date.now()}`, hace(25)],
    );
    // Nunca usado, todavía vigente -> se conserva
    await db.exec(
      `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at, used_at)
       VALUES (?, ?, 'reset', ?, NULL)`,
      [user.id, `hash-vigente-${Date.now()}`, enHoras(1)],
    );

    await purgeExpiredAuthTokens(db);

    const restantes = await db.run<{ token_hash: string }>(
      'SELECT token_hash FROM password_reset_tokens WHERE user_id = ?',
      [user.id],
    );
    const hashes = restantes.map(r => r.token_hash);
    expect(hashes.some(h => h.startsWith('hash-usado-viejo'))).toBe(false);
    expect(hashes.some(h => h.startsWith('hash-caducado'))).toBe(false);
    expect(hashes.some(h => h.startsWith('hash-usado-reciente'))).toBe(true);
    expect(hashes.some(h => h.startsWith('hash-vigente'))).toBe(true);
  });
});

describe('anonymizeDeletedAccounts', () => {
  it('anonimiza cuentas dadas de baja hace más de 30 días, sin romper claves foráneas', async () => {
    const antigua = await createFixtureUser();
    const reciente = await createFixtureUser();
    const emailOriginal = antigua.email;

    // Fila que depende de users.id por FK: si el borrado fuera físico, esto reventaría.
    const electionId = (await db.exec(
      `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active)
       VALUES (?, 'Retencion Test', '', ?, ?, 1)`,
      [Math.floor(Math.random() * 1_000_000) + 5_000_000, Math.floor(Date.now() / 1000) - 100, Math.floor(Date.now() / 1000) + 100],
    )).lastID;
    await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, antigua.id]);

    await db.exec('UPDATE users SET deleted_at = ? WHERE id = ?', [hace(31 * 24), antigua.id]);
    await db.exec('UPDATE users SET deleted_at = ? WHERE id = ?', [hace(10 * 24), reciente.id]);

    const anonimizadas = await anonymizeDeletedAccounts(db);
    expect(anonimizadas).toBeGreaterThanOrEqual(1);

    const filaAntigua = await db.get<{ email: string; name: string; student_id: string; anonymized_at: string | null }>(
      'SELECT email, name, student_id, anonymized_at FROM users WHERE id = ?',
      [antigua.id],
    );
    expect(filaAntigua?.email).not.toBe(emailOriginal);
    expect(filaAntigua?.email).toContain('anonimizado');
    expect(filaAntigua?.name).toBe('Usuario eliminado');
    expect(filaAntigua?.anonymized_at).toBeTruthy();

    const filaReciente = await db.get<{ email: string; anonymized_at: string | null }>(
      'SELECT email, anonymized_at FROM users WHERE id = ?',
      [reciente.id],
    );
    expect(filaReciente?.email).toBe(reciente.email);
    expect(filaReciente?.anonymized_at).toBeFalsy();

    // La fila de election_voters (FK por user_id) sigue existiendo: la
    // anonimización no ha tocado la clave primaria ni ha roto la referencia.
    const censo = await db.get('SELECT user_id FROM election_voters WHERE election_id = ? AND user_id = ?', [electionId, antigua.id]);
    expect(censo).toBeTruthy();
  });

  it('es idempotente: una segunda pasada no vuelve a tocar una cuenta ya anonimizada', async () => {
    const user = await createFixtureUser();
    await db.exec('UPDATE users SET deleted_at = ? WHERE id = ?', [hace(31 * 24), user.id]);

    await anonymizeDeletedAccounts(db);
    const primeraPasada = await db.get<{ email: string; anonymized_at: string }>(
      'SELECT email, anonymized_at FROM users WHERE id = ?', [user.id],
    );

    await anonymizeDeletedAccounts(db);
    const filaTrasSegunda = await db.get<{ email: string; anonymized_at: string }>(
      'SELECT email, anonymized_at FROM users WHERE id = ?', [user.id],
    );

    expect(filaTrasSegunda?.email).toBe(primeraPasada?.email);
    expect(filaTrasSegunda?.anonymized_at).toBe(primeraPasada?.anonymized_at);
  });
});
