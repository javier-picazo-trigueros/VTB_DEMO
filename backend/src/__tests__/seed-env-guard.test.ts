/**
 * runSeed() se niega a tocar nada si NODE_ENV=production, o si falta
 * ALLOW_SEED_RESET=true — independiente de si la base está vacía o no.
 *
 * setup.ts pone ALLOW_SEED_RESET=true y NODE_ENV='test' para el resto de la
 * suite (seed-reset.test.ts llama a runSeed() de verdad); estos tests
 * manipulan esas dos variables directamente y las restauran después.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getDbClient } from '../db/index.js';
import { runSeed } from '../scripts/seedDatabase.js';

const db = getDbClient();
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW = process.env.ALLOW_SEED_RESET;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  process.env.ALLOW_SEED_RESET = ORIGINAL_ALLOW;
});

async function countUsers(): Promise<number> {
  return Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))?.n ?? 0);
}

describe('runSeed() — cerrojo de entorno, independiente de si hay datos', () => {
  it('bloquea con NODE_ENV=production aunque ALLOW_SEED_RESET=true y la base esté vacía', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_SEED_RESET = 'true';

    const antes = await countUsers();
    const resultado = await runSeed({ reset: true });

    expect(resultado).toBe('aborted');
    expect(await countUsers()).toBe(antes);
  });

  it('bloquea sin ALLOW_SEED_RESET=true aunque NODE_ENV no sea production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_SEED_RESET;

    const antes = await countUsers();
    const resultado = await runSeed({ reset: true });

    expect(resultado).toBe('aborted');
    expect(await countUsers()).toBe(antes);
  });

  it('bloquea si ALLOW_SEED_RESET tiene cualquier valor que no sea el string "true"', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_SEED_RESET = '1';

    const antes = await countUsers();
    const resultado = await runSeed({ reset: true });

    expect(resultado).toBe('aborted');
    expect(await countUsers()).toBe(antes);
  });

  it('con las dos condiciones cumplidas, no bloquea por el cerrojo de entorno', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_SEED_RESET = 'true';

    // setup.ts ya sembró esta base en su beforeAll, así que con reset:true la
    // razón para seguir adelante es la lógica normal (hay datos, se pidió
    // --reset), no el cerrojo de entorno — que es justo lo que se prueba aquí.
    const resultado = await runSeed({ reset: true });
    expect(resultado).toBe('reset-and-seeded');
  });
});
