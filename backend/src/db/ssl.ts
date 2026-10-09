/**
 * Conexión segura a PostgreSQL: certificado raíz propio (DATABASE_CA_CERT).
 *
 * Contexto: el pooler de Supabase presenta una cadena firmada por "Supabase Root
 * 2021 CA", una CA privada que Node no conoce. Con `rejectUnauthorized: true` y
 * sin esa CA la conexión falla, y por eso la DATABASE_URL de producción llevaba
 * `?sslmode=no-verify`. Peor: pg da prioridad a lo que diga la URL sobre el
 * objeto `ssl` del código, así que el `{ rejectUnauthorized: true }` de
 * postgres.ts no tenía efecto y no se verificaba nada.
 *
 * Con DATABASE_CA_CERT (contenido PEM o ruta a un fichero) se verifica de verdad,
 * y se quitan de la URL los parámetros ssl para que no puedan anularlo. Sin la
 * variable queda el comportamiento anterior y un aviso en el log.
 */
import { readFileSync } from 'node:fs';

export interface PgSslSetup {
  /** URL a pasar a pg: sin parámetros ssl cuando hay CA, para que la URL no anule la verificación. */
  connectionString: string;
  ssl: { ca: string; rejectUnauthorized: true } | { rejectUnauthorized: true } | undefined;
  /** Aviso para el log, o null. Nunca lleva la URL, el host ni credenciales. */
  warning: string | null;
}

type Env = Record<string, string | undefined>;

const SSL_PARAMS = /^(ssl|sslmode|sslrootcert|sslcert|sslkey|sslcrl|uselibpqcompat)$/i;

function splitUrl(url: string): { base: string; params: string[] } {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return { base: url, params: [] };
  return { base: url.slice(0, queryStart), params: url.slice(queryStart + 1).split('&').filter(Boolean) };
}

const paramName = (param: string) => param.split('=')[0];

/** Quita los parámetros ssl de la URL y deja el resto intacto (sin decodificar nada). */
export function stripSslParams(url: string): string {
  const { base, params } = splitUrl(url);
  const kept = params.filter((param) => !SSL_PARAMS.test(paramName(param)));
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

/** Valor de `sslmode` en la URL, o null. */
function urlSslMode(url: string): string | null {
  const param = splitUrl(url).params.find((p) => paramName(p).toLowerCase() === 'sslmode');
  return param ? param.slice(param.indexOf('=') + 1) : null;
}

/** PEM en la propia variable (con saltos de línea reales o `\n` literales) o ruta a un fichero. */
function loadCaCertificate(value: string): string {
  let pem: string;
  if (value.includes('BEGIN CERTIFICATE')) {
    pem = value.includes('\n') ? value : value.replace(/\\n/g, '\n');
  } else {
    try {
      pem = readFileSync(value.trim(), 'utf-8');
    } catch {
      throw new Error('DATABASE_CA_CERT no es un certificado PEM ni la ruta de un fichero legible');
    }
  }
  if (!pem.includes('BEGIN CERTIFICATE') || !pem.includes('END CERTIFICATE')) {
    throw new Error('DATABASE_CA_CERT no contiene un certificado PEM completo (BEGIN/END CERTIFICATE)');
  }
  return pem;
}

/** El PEM de DATABASE_CA_CERT, o null si la variable no está definida o está vacía. */
export function readCaCertificate(env: Env): string | null {
  const value = env.DATABASE_CA_CERT;
  return value && value.trim() ? loadCaCertificate(value) : null;
}

export function resolvePgSsl(connectionString: string, env: Env): PgSslSetup {
  const ca = readCaCertificate(env);
  if (ca) {
    return {
      connectionString: stripSslParams(connectionString),
      ssl: { ca, rejectUnauthorized: true },
      warning: null,
    };
  }

  if (env.NODE_ENV !== 'production') {
    return { connectionString, ssl: undefined, warning: null };
  }

  const mode = urlSslMode(connectionString);
  const warning = mode === 'no-verify' || mode === 'disable' || mode === 'allow' || mode === 'prefer'
    ? `DATABASE_CA_CERT no definida y la URL de la base de datos pide sslmode=${mode}: no se verifica el certificado del servidor. Ver docs/DESPLIEGUE.md, "Conexión segura a la base de datos".`
    : 'DATABASE_CA_CERT no definida: la verificación del certificado de la base de datos depende de la CA del sistema. Ver docs/DESPLIEGUE.md, "Conexión segura a la base de datos".';
  return { connectionString, ssl: { rejectUnauthorized: true }, warning };
}

/**
 * URL para la CLI de node-pg-migrate, que solo sabe leer SSL de la URL: sin los
 * parámetros ssl originales y con `verify-full` apuntando al fichero de la CA.
 */
export function migrationDatabaseUrl(connectionString: string, caFilePath: string): string {
  const stripped = stripSslParams(connectionString);
  const separator = stripped.includes('?') ? '&' : '?';
  return `${stripped}${separator}sslmode=verify-full&sslrootcert=${encodeURIComponent(caFilePath)}`;
}
