'use strict';

/**
 * Qué versión de los textos legales aceptó cada usuario, y cuándo.
 *
 * Vive en dos tablas porque un alta puede tardar en convertirse en usuario:
 * si el email no está en email_whitelist, la aceptación se guarda primero en
 * registration_requests (no hay fila en users todavía) y se copia a users al
 * aprobar la solicitud (routes/admin/org.ts). Si está en la whitelist, se
 * escribe directamente en users porque la cuenta se crea en el momento.
 *
 * Las cuentas que crea un administrador (alta manual, importación CSV) dejan
 * estas dos columnas en NULL a propósito: la persona no ha marcado ninguna
 * casilla, nadie ha aceptado nada en su nombre.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS terms_version TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL;
  `);
  pgm.sql(`
    ALTER TABLE registration_requests
      ADD COLUMN IF NOT EXISTS terms_version TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS terms_version, DROP COLUMN IF EXISTS terms_accepted_at;`);
  pgm.sql(`ALTER TABLE registration_requests DROP COLUMN IF EXISTS terms_version, DROP COLUMN IF EXISTS terms_accepted_at;`);
};
