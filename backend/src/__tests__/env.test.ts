/**
 * Validación de entorno al arrancar (SCRUM-14).
 *
 * config/env.ts lanza durante la propia evaluación del módulo, así que cada
 * caso necesita su import dinámico con vi.resetModules() — un import
 * estático solo se evalúa una vez, y el resto de tests verían el resultado
 * cacheado del primero.
 *
 * Los valores "ausentes" se representan como '' y no con delete de la clave:
 * env.ts llama a dotenv.config() de forma defensiva, y dotenv solo rellena
 * claves que no existen en process.env — borrar la clave dejaría que el
 * .env local de quien ejecute los tests la rellenara sin avisar. Mismo
 * motivo por el que setup.ts fija DATABASE_URL a '' en vez de no definirla.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const TRACKED_KEYS = [
  'NODE_ENV', 'JWT_SECRET', 'NULLIFIER_SECRET',
  'CORS_ORIGINS', 'DB_CLIENT', 'DATABASE_URL',
] as const;
type TrackedKey = typeof TRACKED_KEYS[number];

const baseline = Object.fromEntries(
  TRACKED_KEYS.map(k => [k, process.env[k] ?? ''])
) as Record<TrackedKey, string>;

async function loadEnv(overrides: Partial<Record<TrackedKey, string>>) {
  vi.resetModules();
  for (const key of TRACKED_KEYS) {
    process.env[key] = key in overrides ? overrides[key]! : baseline[key];
  }
  return import('../config/env.js');
}

describe('config/env — validación de arranque (SCRUM-14)', () => {
  afterEach(() => {
    for (const key of TRACKED_KEYS) process.env[key] = baseline[key];
    vi.resetModules();
  });

  it('aborta en producción si falta CORS_ORIGINS', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', CORS_ORIGINS: '' })
    ).rejects.toThrow(/CORS_ORIGINS/);
  });

  it('aborta en producción si falta JWT_SECRET', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', JWT_SECRET: '' })
    ).rejects.toThrow(/JWT_SECRET/);
  });

  it('aborta en producción con DB_CLIENT=postgres si falta DATABASE_URL', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', DB_CLIENT: 'postgres', DATABASE_URL: '' })
    ).rejects.toThrow(/DATABASE_URL/);
  });

  it('no aborta en desarrollo aunque falten todas', async () => {
    const mod = await loadEnv({
      NODE_ENV: 'development',
      JWT_SECRET: '', NULLIFIER_SECRET: '', CORS_ORIGINS: '',
    });
    expect(mod.env.CORS_ORIGINS).toEqual([]);
  });

  it('arranca en producción cuando todo lo obligatorio está definido', async () => {
    const mod = await loadEnv({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://vtb.example,https://admin.vtb.example',
    });
    expect(mod.env.CORS_ORIGINS).toEqual([
      'https://vtb.example',
      'https://admin.vtb.example',
    ]);
  });
});
