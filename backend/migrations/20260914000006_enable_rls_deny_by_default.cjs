'use strict';

/**
 * Activa Row Level Security en todas las tablas, SIN crear ninguna política.
 *
 * ── Por qué ─────────────────────────────────────────────────────────────────
 *
 * Solo importa si la base vive en Supabase, pero es inofensiva en cualquier
 * PostgreSQL, así que va en las migraciones normales en vez de en un script
 * aparte que alguien olvidaría ejecutar.
 *
 * Supabase publica automáticamente TODAS las tablas del esquema `public` como
 * una API REST (PostgREST) en https://<ref>.supabase.co/rest/v1/<tabla>,
 * autenticada con la `anon key` — una clave diseñada para ir embebida en el
 * frontend, es decir, pública por definición.
 *
 * Sin RLS, cualquiera con la URL del proyecto y esa clave puede hacer:
 *
 *   GET  /rest/v1/users                 → todas las cuentas, con password_hash
 *   GET  /rest/v1/nullifier_audit       → user_id + candidate_id: quién votó qué
 *   GET  /rest/v1/refresh_tokens        → hashes de sesión
 *   GET  /rest/v1/password_reset_tokens → hashes de recuperación
 *   POST / PATCH / DELETE sobre todas ellas
 *
 * El linter de Supabase lo marcó como ERROR en las 17 tablas nada más crear el
 * esquema.
 *
 * ── Por qué sin políticas ───────────────────────────────────────────────────
 *
 * RLS activado y cero políticas significa "denegar todo" para los roles que
 * están sujetos a RLS (`anon` y `authenticated`, los de PostgREST). Es
 * exactamente lo que queremos: VTB no usa la API REST de Supabase para nada.
 *
 * El backend no se ve afectado: se conecta por el protocolo de PostgreSQL con
 * el rol `postgres`, que es el propietario de las tablas, y **el propietario
 * salta RLS** salvo que se active FORCE ROW LEVEL SECURITY — que aquí no se
 * activa a propósito.
 *
 * Si algún día VTB quisiera usar PostgREST, habría que escribir políticas
 * explícitas tabla por tabla. Hasta entonces, cerrado.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */

const TABLES = [
  'users',
  'elections',
  'election_images',
  'candidates',
  'election_access',
  'election_targets',
  'election_voters',
  'vote_attempts',
  'nullifier_audit',
  'registration_requests',
  'org_units',
  'schools_and_degrees',
  'email_whitelist',
  'email_log',
  'password_reset_tokens',
  'refresh_tokens',
  'pgmigrations',
];

exports.up = async (pgm) => {
  for (const t of TABLES) {
    pgm.sql(`ALTER TABLE IF EXISTS public.${t} ENABLE ROW LEVEL SECURITY;`);
  }

  // Endurecimiento del trigger de updated_at: sin un search_path fijo, un rol
  // con permiso para crear objetos podría anteponer un esquema propio y
  // secuestrar lo que la función resuelve. Lo marcó el mismo linter.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  for (const t of TABLES) {
    pgm.sql(`ALTER TABLE IF EXISTS public.${t} DISABLE ROW LEVEL SECURITY;`);
  }
};
