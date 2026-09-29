'use strict';

/**
 * Separa "esta persona ha votado" de "hay un voto para este candidato"
 * (SCRUM-17, opción A).
 *
 * Hasta aquí nullifier_audit guardaba user_id, nullifier, candidato y
 * transacción en la misma fila: destruir la sal de una elección cerrada no
 * protegía nada, porque la base seguía uniendo a cada persona con su voto.
 *
 *   election_participations (election_id, user_id)
 *       Solo quién ha votado en qué elección. Clave primaria compuesta, sin id
 *       autoincremental y sin hora: con la hora, en una elección pequeña, se
 *       empareja con el bloque de la transacción.
 *
 *   nullifier_audit
 *       Los votos, sin user_id. Id aleatorio (UUID): un autoincremento
 *       insertado en la misma transacción que la participación permitiría
 *       emparejarlas por orden. La hora se trunca al minuto, se copia sin
 *       vote_choice (era el mismo candidateId que candidate_id) y las filas se
 *       reescriben barajadas para que el orden físico tampoco las empareje.
 *
 * La segunda barrera contra el doble voto pasa a ser
 * UNIQUE (election_id, nullifier_hash): el nullifier es determinista por
 * persona y elección.
 *
 * IRREVERSIBLE A PROPÓSITO. El down no puede reconstruir el vínculo y falla.
 * Las copias de seguridad de la base anteriores a esta migración lo conservan
 * hasta que caducan.
 *
 * Borra además las filas históricas de email_log con plantilla
 * 'vote_confirmation' (destinatario + fecha = el mismo vínculo).
 *
 * En producción va después de la 015 (registration_email_verification).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = async (pgm) => {
  // Si hubiera duplicados, la clave única nueva fallaría a mitad de la copia.
  // Mejor decirlo antes de tocar nada, y con las elecciones afectadas.
  pgm.sql(`
    DO $$
    DECLARE dup TEXT;
    BEGIN
      SELECT string_agg(DISTINCT election_id::text, ', ') INTO dup
        FROM (
          SELECT election_id FROM nullifier_audit
           GROUP BY election_id, nullifier_hash HAVING COUNT(*) > 1
        ) d;
      IF dup IS NOT NULL THEN
        RAISE EXCEPTION
          '016 abortada: hay (election_id, nullifier_hash) duplicados en nullifier_audit (elecciones: %). Revisalos a mano antes de migrar.', dup;
      END IF;
    END $$;
  `);

  // ── 0. Correos de confirmación de voto ───────────────────────────────────
  // La fila (destinatario + plantilla + created_at) se cruza con generated_at y
  // reconstruye el vínculo. El envío ya no existe; se borran los históricos.
  pgm.sql(`DELETE FROM email_log WHERE template_name = 'vote_confirmation';`);

  // ── 1. Participación ─────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE election_participations (
      election_id BIGINT NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
      user_id     BIGINT NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
      PRIMARY KEY (election_id, user_id)
    );
  `);
  pgm.sql(`CREATE INDEX idx_election_participations_user ON election_participations (user_id);`);
  pgm.sql(`ALTER TABLE election_participations ENABLE ROW LEVEL SECURITY;`);

  // En orden aleatorio, para que el orden físico no la empareje con los votos.
  pgm.sql(`
    INSERT INTO election_participations (election_id, user_id)
    SELECT election_id, user_id FROM nullifier_audit ORDER BY random();
  `);

  // ── 2. Votos sin user_id ─────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE nullifier_audit_new (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      election_id    BIGINT NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
      nullifier_hash TEXT NOT NULL,
      tx_hash        TEXT,
      block_number   BIGINT,
      candidate_id   BIGINT,
      generated_at   TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', NOW()),
      vote_source    TEXT NOT NULL DEFAULT 'legacy',
      CONSTRAINT nullifier_audit_vote_source_check
        CHECK (vote_source IN ('chain', 'demo', 'legacy')),
      UNIQUE (election_id, nullifier_hash)
    );
  `);

  pgm.sql(`
    INSERT INTO nullifier_audit_new
      (election_id, nullifier_hash, tx_hash, block_number, candidate_id,
       generated_at, vote_source)
    SELECT election_id, nullifier_hash, tx_hash, block_number, candidate_id,
           date_trunc('minute', generated_at), vote_source
      FROM nullifier_audit
     ORDER BY random();
  `);

  // El nombre de la restricción CHECK ya está cogido por la tabla vieja hasta
  // que se borra; por eso la tabla nueva se crea con nombres provisionales.
  pgm.sql(`DROP TABLE nullifier_audit;`);
  pgm.sql(`ALTER TABLE nullifier_audit_new RENAME TO nullifier_audit;`);
  pgm.sql(`ALTER TABLE nullifier_audit RENAME CONSTRAINT nullifier_audit_new_pkey TO nullifier_audit_pkey;`);
  pgm.sql(`
    ALTER TABLE nullifier_audit
      RENAME CONSTRAINT nullifier_audit_new_election_id_nullifier_hash_key
                     TO nullifier_audit_election_nullifier_key;
  `);
  pgm.sql(`ALTER TABLE nullifier_audit RENAME CONSTRAINT nullifier_audit_new_election_id_fkey TO nullifier_audit_election_id_fkey;`);
  pgm.sql(`CREATE INDEX idx_nullifier_audit_election ON nullifier_audit (election_id);`);
  pgm.sql(`ALTER TABLE nullifier_audit ENABLE ROW LEVEL SECURITY;`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async () => {
  throw new Error(
    '016 es irreversible: elimina a propósito la correspondencia votante-voto y no se ' +
      'puede reconstruir. Para volver atrás, restaura una copia de seguridad anterior a la migración.',
  );
};
