/**
 * Montaje de la conexión segura a PostgreSQL (DATABASE_CA_CERT).
 *
 * El fallo de fondo: con `?sslmode=no-verify` en DATABASE_URL, pg da prioridad a
 * lo que dice la URL sobre el objeto `ssl` que pasa el código, así que el
 * `{ rejectUnauthorized: true }` de postgres.ts no tenía ningún efecto y la
 * conexión no verificaba el certificado. Por eso aquí se comprueba el resultado
 * final que calcula pg (ConnectionParameters), no solo lo que se le pasa.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolvePgSsl, stripSslParams, migrationDatabaseUrl } from '../db/ssl.js';
import { PgClient } from '../db/postgres.js';

const require = createRequire(import.meta.url);
// Lo que de verdad usa pg al conectar: la URL se mezcla con la configuración.
const ConnectionParameters = require('pg/lib/connection-parameters') as new (config: object) => { ssl: unknown };

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfakefakefake\n-----END CERTIFICATE-----\n';
const URL_NO_VERIFY = 'postgresql://postgres.ref:p%40ss%3Fword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify';

const finalSsl = (setup: { connectionString: string; ssl: unknown }) =>
  new ConnectionParameters({ connectionString: setup.connectionString, ssl: setup.ssl }).ssl;

afterEach(() => { vi.restoreAllMocks(); });

describe('sin DATABASE_CA_CERT: comportamiento actual y un aviso', () => {
  it('en desarrollo no cambia nada y no avisa', () => {
    const setup = resolvePgSsl('postgresql://u:p@localhost:5432/vtb?sslmode=disable', { NODE_ENV: 'development' });
    expect(setup.connectionString).toBe('postgresql://u:p@localhost:5432/vtb?sslmode=disable');
    expect(setup.ssl).toBeUndefined();
    expect(setup.warning).toBeNull();
  });

  it('en producción deja la URL y el ssl como estaban y avisa de que falta la variable', () => {
    const setup = resolvePgSsl(URL_NO_VERIFY, { NODE_ENV: 'production' });
    expect(setup.connectionString).toBe(URL_NO_VERIFY);
    expect(setup.ssl).toEqual({ rejectUnauthorized: true });
    expect(setup.warning).toMatch(/DATABASE_CA_CERT/);
  });

  it('si la URL pide sslmode=no-verify, el aviso dice que NO se verifica el certificado', () => {
    const setup = resolvePgSsl(URL_NO_VERIFY, { NODE_ENV: 'production' });
    expect(setup.warning).toMatch(/no-verify/);
    expect(setup.warning).toMatch(/no se verifica/i);
    // El resultado real de pg lo confirma: la URL manda sobre el código.
    expect(finalSsl(setup)).toEqual({ rejectUnauthorized: false });
  });

  it('el aviso no contiene la URL, ni la contraseña, ni el host', () => {
    const { warning } = resolvePgSsl(URL_NO_VERIFY, { NODE_ENV: 'production' });
    expect(warning).not.toContain('p%40ss');
    expect(warning).not.toContain('pooler.supabase.com');
  });
});

describe('con DATABASE_CA_CERT: verificación obligatoria', () => {
  it('con el PEM en la variable, ssl lleva la CA y rejectUnauthorized: true', () => {
    const setup = resolvePgSsl(URL_NO_VERIFY, { NODE_ENV: 'production', DATABASE_CA_CERT: PEM });
    expect(setup.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(setup.warning).toBeNull();
  });

  it('quita sslmode de la URL: si no, el no-verify de la URL anularía la verificación', () => {
    const setup = resolvePgSsl(URL_NO_VERIFY, { NODE_ENV: 'production', DATABASE_CA_CERT: PEM });
    expect(setup.connectionString).not.toMatch(/sslmode/);
    expect(finalSsl(setup)).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('también fuera de producción: quien define la variable pide verificar', () => {
    const setup = resolvePgSsl('postgresql://u:p@db.example.com/vtb?sslmode=require', { NODE_ENV: 'development', DATABASE_CA_CERT: PEM });
    expect(finalSsl(setup)).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('el PEM puede venir en una sola línea con \\n literales (como se pega en el panel de Render)', () => {
    const oneLine = PEM.trim().replace(/\n/g, '\\n');
    const setup = resolvePgSsl(URL_NO_VERIFY, { DATABASE_CA_CERT: oneLine });
    expect((setup.ssl as { ca: string }).ca).toBe(PEM.trim());
  });

  it('acepta una ruta a un fichero con el certificado', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vtb-ca-'));
    try {
      const file = path.join(dir, 'ca.crt');
      writeFileSync(file, PEM);
      const setup = resolvePgSsl(URL_NO_VERIFY, { DATABASE_CA_CERT: file });
      expect((setup.ssl as { ca: string }).ca).toBe(PEM);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('una ruta que no existe es un error claro de arranque, no una conexión sin verificar', () => {
    expect(() => resolvePgSsl(URL_NO_VERIFY, { DATABASE_CA_CERT: '/no/existe/ca.crt' })).toThrow(/DATABASE_CA_CERT/);
  });

  it('un PEM incompleto es un error claro', () => {
    expect(() => resolvePgSsl(URL_NO_VERIFY, { DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nAAAA' })).toThrow(/DATABASE_CA_CERT/);
  });

  it('una variable vacía cuenta como no definida', () => {
    const setup = resolvePgSsl(URL_NO_VERIFY, { NODE_ENV: 'production', DATABASE_CA_CERT: '  ' });
    expect(setup.warning).toMatch(/DATABASE_CA_CERT/);
  });
});

describe('stripSslParams', () => {
  it('quita sslmode, sslrootcert y similares y conserva el resto, incluida una contraseña con caracteres codificados', () => {
    const url = 'postgresql://u:p%40ss%3Fw%26rd@h:5432/db?application_name=vtb&sslmode=no-verify&sslrootcert=/x.crt&connect_timeout=5';
    expect(stripSslParams(url)).toBe('postgresql://u:p%40ss%3Fw%26rd@h:5432/db?application_name=vtb&connect_timeout=5');
  });

  it('sin parámetros ssl devuelve la URL tal cual, y si solo había ssl no deja un "?" colgando', () => {
    expect(stripSslParams('postgresql://u:p@h/db')).toBe('postgresql://u:p@h/db');
    expect(stripSslParams('postgresql://u:p@h/db?sslmode=require')).toBe('postgresql://u:p@h/db');
  });
});

describe('migrationDatabaseUrl (node-pg-migrate)', () => {
  it('sustituye el sslmode de la URL por verify-full con la CA, para que la CLI también verifique', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vtb ca-'));
    try {
      const file = path.join(dir, 'ca.crt');
      writeFileSync(file, PEM);
      const migrated = migrationDatabaseUrl(URL_NO_VERIFY, file);

      expect(migrated).not.toMatch(/no-verify/);
      expect(migrated).toMatch(/[?&]sslmode=verify-full/);
      // Lo que calcula pg con esa URL: la CA del fichero y ninguna desactivación.
      const ssl = new ConnectionParameters({ connectionString: migrated, ssl: { rejectUnauthorized: true } }).ssl as { ca?: string; rejectUnauthorized?: boolean };
      expect(ssl.ca).toBe(PEM);
      expect(ssl.rejectUnauthorized).not.toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('PgClient monta el pool con esa configuración', () => {
  // El pool es perezoso: no se conecta hasta la primera consulta, así que no
  // hay ninguna base en juego.
  const poolOf = (client: PgClient) =>
    (client as unknown as { pool: { options: { ssl: unknown; connectionString: string }; end(): Promise<void> } }).pool;
  const saved = { nodeEnv: process.env.NODE_ENV, ca: process.env.DATABASE_CA_CERT };

  afterEach(() => {
    process.env.NODE_ENV = saved.nodeEnv;
    if (saved.ca === undefined) delete process.env.DATABASE_CA_CERT; else process.env.DATABASE_CA_CERT = saved.ca;
  });

  it('con la CA: el pool verifica y la URL ya no lleva sslmode', async () => {
    process.env.DATABASE_CA_CERT = PEM;
    const client = new PgClient(URL_NO_VERIFY);
    const pool = poolOf(client);
    expect(pool.options.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(pool.options.connectionString).not.toMatch(/sslmode/);
    await pool.end();
  });

  it('sin la CA en producción: avisa por el log al crearse', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_CA_CERT;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new PgClient(URL_NO_VERIFY);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/DATABASE_CA_CERT/);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('pooler.supabase.com');
    await poolOf(client).end();
  });
});
