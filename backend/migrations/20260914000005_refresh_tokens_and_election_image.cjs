'use strict';

/**
 * Cierra los dos huecos de esquema que impedían que el backend funcionase sobre
 * PostgreSQL, detectados al completar la migración del cliente de base de datos.
 *
 * 1. `refresh_tokens` no existía en PostgreSQL.
 *
 *    La tabla estaba solo en el esquema SQLite (config/database.ts). La escribe
 *    `setSessionCookies()`, que corre en CADA login correcto, así que sobre
 *    PostgreSQL el login fallaba entero — no solo el refresco de sesión.
 *
 *    Diferencias respecto a la versión SQLite, deliberadas:
 *      - `revoked` es BOOLEAN, no INTEGER 0/1.
 *      - `expires_at` es TIMESTAMPTZ. El código guarda un ISO-8601 con zona, que
 *        PostgreSQL convierte sin ambigüedad.
 *      - FK a users con ON DELETE CASCADE: al borrar un usuario se van sus
 *        sesiones. En SQLite la FK estaba declarada pero sin enforcement real.
 *
 * 2. `elections.image_url` no existía en PostgreSQL.
 *
 *    El esquema de PostgreSQL trae una tabla `election_images` pensada para sacar
 *    el base64 fuera de la fila de la elección (S11), pero NINGÚN código la usa:
 *    `admin.ts` escribe en `elections.image_url` y `elections.ts` la lee. Sin esta
 *    columna, subir la imagen de una elección falla y las imágenes existentes
 *    desaparecen de la interfaz.
 *
 *    Se añade la columna para que la migración de cliente sea una sustitución
 *    mecánica y nada más. Mover las imágenes a `election_images` y retirar esta
 *    columna es un trabajo aparte, cuando se toque el tema de imágenes.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT        NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
  `);

  // Búsqueda del token vivo en /auth/refresh: filtra por hash y descarta revocados.
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
      ON refresh_tokens (token_hash)
      WHERE revoked = FALSE;
  `);

  pgm.sql(`
    ALTER TABLE elections ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE elections DROP COLUMN IF EXISTS image_url;`);
  pgm.sql(`DROP TABLE IF EXISTS refresh_tokens;`);
};
