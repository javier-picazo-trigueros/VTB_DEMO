/**
 * `npm run seed` no puede borrar datos sin un flag explícito.
 *
 * Antes, runSeedScript borraba usuarios, elecciones, candidatos, censo y votos
 * en cuanto la base tenía un solo usuario, sin avisar. Vació la base de Supabase
 * del proyecto, y la guía de despliegue llegó a proponerlo como arranque de Render.
 *
 * Ahora: sin --reset aborta y no toca nada; con --reset borra y vuelve a sembrar.
 * Los dos tests van en este orden a propósito (el segundo vacía la base de este
 * fichero de tests; cada fichero tiene la suya en memoria).
 */
import { describe, it, expect } from 'vitest';
import { getDbClient } from '../db/index.js';
import { runSeed } from '../scripts/seedDatabase.js';

const db = getDbClient();

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);
}

async function insertarUsuarioReal(prefijo: string): Promise<string> {
  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `${prefijo}-${sufijo}@universidad.test`;
  await db.exec(
    `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, is_eligible)
     VALUES (?, 'x', 'Persona Real', ?, 'student', TRUE, TRUE)`,
    [email, `${prefijo.toUpperCase()}-${sufijo}`],
  );
  return email;
}

describe('npm run seed (sin --reset)', () => {
  it('aborta si ya hay usuarios y deja la base exactamente como estaba', async () => {
    // setup.ts ya ha sembrado; además hay una cuenta "real", que no es de demo.
    const email = await insertarUsuarioReal('real');
    const usuariosAntes = await count('SELECT COUNT(*) AS n FROM users');
    const eleccionesAntes = await count('SELECT COUNT(*) AS n FROM elections');
    const censoAntes = await count('SELECT COUNT(*) AS n FROM election_voters');

    const resultado = await runSeed({ reset: false });

    expect(resultado).toBe('aborted');
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(usuariosAntes);
    expect(await count('SELECT COUNT(*) AS n FROM elections')).toBe(eleccionesAntes);
    expect(await count('SELECT COUNT(*) AS n FROM election_voters')).toBe(censoAntes);
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email])).toBe(1);
  });
});

describe('npm run seed -- --reset', () => {
  it('borra los datos existentes y vuelve a sembrar la demo', async () => {
    const email = await insertarUsuarioReal('borrable');
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email])).toBe(1);

    const resultado = await runSeed({ reset: true });

    expect(resultado).toBe('reset-and-seeded');
    // La cuenta que no es de demo ya no existe…
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email])).toBe(0);
    // …y la demo está sembrada de nuevo.
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'admin@vtb.demo'")).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM elections')).toBeGreaterThan(0);
  }, 30_000);
});
