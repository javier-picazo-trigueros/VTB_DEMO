'use strict';

/**
 * Marca del tutorial de bienvenida en el usuario.
 *
 * Antes vivía en localStorage como `vtb-tour-done-{id|email}`: una clave con un
 * identificador de la cuenta en el navegador, que además no seguía a la persona
 * entre dispositivos. Con la columna, la política de cookies ya no tiene que
 * explicar ese dato.
 *
 * NULL = aún no lo ha completado. No se rellena para las cuentas existentes: no
 * se sabe quién lo vio (la marca antigua estaba en cada navegador), así que lo
 * verán una vez más y lo cerrarán.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ DEFAULT NULL;`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS tour_completed_at;`);
};
