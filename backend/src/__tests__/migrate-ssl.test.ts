/**
 * `npm run migrate` pasa por scripts/migrate.ts, que prepara el SSL con
 * DATABASE_CA_CERT antes de lanzar node-pg-migrate. Aquí se ejecuta de verdad,
 * contra un puerto local cerrado: nunca hay una base real en juego (nunca contra
 * Supabase), solo se mira qué dice el wrapper antes de que la conexión falle.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const backend = path.resolve(__dirname, '../..');
const tsx = path.join(backend, 'node_modules/tsx/dist/cli.mjs');
const CLOSED_PORT_URL = 'postgresql://u:p@127.0.0.1:1/vtb?sslmode=no-verify';
const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfakefakefake\n-----END CERTIFICATE-----\n';

function migrate(env: Record<string, string>) {
  const result = spawnSync(process.execPath, [tsx, 'scripts/migrate.ts', 'up', '--reject-unauthorized'], {
    cwd: backend,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', DATABASE_URL: CLOSED_PORT_URL, ...env },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('npm run migrate y DATABASE_CA_CERT', () => {
  it('sin la variable, en producción: avisa de que no se verifica y la CLI corre igual (falla solo por el puerto cerrado)', () => {
    const { status, output } = migrate({ NODE_ENV: 'production' });
    expect(output).toMatch(/\[migrate\].*DATABASE_CA_CERT/);
    expect(output).toMatch(/no se verifica/);
    expect(output).toMatch(/ECONNREFUSED/);
    expect(status).not.toBe(0);
  });

  it('con una ruta inexistente: error claro y no llega a conectar', () => {
    const { status, output } = migrate({ NODE_ENV: 'production', DATABASE_CA_CERT: '/no/existe/ca.crt' });
    expect(status).toBe(1);
    expect(output).toMatch(/DATABASE_CA_CERT no es un certificado PEM ni la ruta/);
    expect(output).not.toMatch(/ECONNREFUSED/);
  });

  it('con un PEM válido en la variable: no avisa y la CLI corre (falla solo por el puerto cerrado)', () => {
    const { status, output } = migrate({ NODE_ENV: 'production', DATABASE_CA_CERT: PEM });
    expect(output).not.toMatch(/\[migrate\]/);
    expect(output).toMatch(/ECONNREFUSED/);
    expect(status).not.toBe(0);
  });
});
