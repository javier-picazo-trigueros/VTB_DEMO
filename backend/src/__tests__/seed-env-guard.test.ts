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

  describe('base remota', () => {
    const ORIGINAL = {
      client: process.env.DB_CLIENT,
      url: process.env.DATABASE_URL,
      remoto: process.env.SEED_REMOTE_DB_OK,
    };
    afterEach(() => {
      for (const [clave, valor] of [
        ['DB_CLIENT', ORIGINAL.client], ['DATABASE_URL', ORIGINAL.url], ['SEED_REMOTE_DB_OK', ORIGINAL.remoto],
      ] as const) {
        if (valor === undefined) delete process.env[clave];
        else process.env[clave] = valor;
      }
    });

    function entornoPermisivo(url: string) {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SEED_RESET = 'true';
      process.env.DB_CLIENT = 'postgres';
      process.env.DATABASE_URL = url;
      delete process.env.SEED_REMOTE_DB_OK;
    }

    // El incidente que motiva esto: un seed contra el Supabase compartido. Con
    // NODE_ENV=development y ALLOW_SEED_RESET=true en el .env, las otras dos
    // condiciones se cumplen sin darse cuenta.
    it('bloquea contra PostgreSQL en un host que no es local', async () => {
      entornoPermisivo('postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres');

      const antes = await countUsers();
      expect(await runSeed({ reset: true })).toBe('aborted');
      expect(await countUsers()).toBe(antes);
    });

    it('bloquea también un host que solo parece local', async () => {
      entornoPermisivo('postgresql://u:p@localhost.evil.example.com:5432/postgres');
      expect(await runSeed({ reset: true })).toBe('aborted');
    });

    it('con SEED_REMOTE_DB_OK=true deja pasar a una base remota de desarrollo', async () => {
      entornoPermisivo('postgresql://u:p@db.proyecto-de-desarrollo.supabase.co:5432/postgres');
      process.env.SEED_REMOTE_DB_OK = 'true';
      expect(await runSeed({ reset: true })).toBe('reset-and-seeded');
    });

    it('no bloquea contra un PostgreSQL en localhost', async () => {
      entornoPermisivo('postgresql://postgres:local@localhost:55432/vtb');
      expect(await runSeed({ reset: true })).toBe('reset-and-seeded');
    });
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
