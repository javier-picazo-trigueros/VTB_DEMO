'use strict';

/**
 * Preparación del cambio a ElectionRegistryV2 (recuento verificable en cadena).
 *
 * Esta migración NO cambia de contrato: solo deja la base en condiciones de
 * hacerlo sin perder el histórico ni mentir sobre lo que está en la cadena.
 * El cambio de CONTRACT_ADDRESS y el re-registro de las elecciones van en una
 * migración posterior, en el momento del corte.
 *
 * ── 1. elections.chain_contract_address ─────────────────────────────────────
 *
 * Hoy `election_id_blockchain` es un número sin contexto: vale para el contrato
 * que esté configurado en ese momento en CONTRACT_ADDRESS. En cuanto se
 * despliegue el contrato v2, ese número seguirá ahí apuntando a una elección
 * que en el contrato nuevo no existe, o peor, a otra distinta.
 *
 * Con esta columna cada elección sabe en qué contrato vive. Las que ya están en
 * el contrato antiguo se quedan en él y siguen siendo legibles; las nuevas irán
 * al v2. Sin esto, cambiar la dirección rompe el histórico en silencio.
 *
 * Se rellena con el CONTRACT_ADDRESS del entorno en el que se ejecuta la
 * migración, que es el contrato al que apuntan hoy las elecciones 'synced'. Si
 * no está definido, se deja a NULL y se avisa: NULL significa "no consta", no
 * "el contrato actual".
 *
 * ── 2. nullifier_audit.vote_source ──────────────────────────────────────────
 *
 * Hoy el origen de un voto se deduce mirando el dominio del correo del votante
 * (`email LIKE '%@vtb.demo'`), en cuatro sitios distintos del código. Es frágil
 * y es la razón de que un voto de demostración pueda pasar por voto en cadena.
 *
 *   chain   la transacción está en la cadena, con su bloque
 *   demo    cuenta de demostración: nunca llegó a la cadena
 *   legacy  escrito por código anterior a esta columna; no se afirma nada
 *
 * El valor por defecto es 'legacy' a propósito: hasta que el paso 4 haga que la
 * ruta de voto lo escriba explícitamente, nada debe presumir de estar en la
 * cadena por omisión.
 *
 * ── 3. Hashes de transacción inventados ─────────────────────────────────────
 *
 * Había dos caminos (BC-21 y BC-22 de AUDITORIA_BLOCKCHAIN.md) que, cuando el
 * voto no llegaba a la cadena, guardaban un SHA-256 con prefijo 0x —
 * indistinguible de un hash de transacción real para quien no consulte la
 * cadena— y lo servían por la API de auditoría.
 *
 * Un hash sin bloque nunca se confirmó. Se ponen a NULL: si no hay
 * transacción, el campo debe ser NULL y no un dato con forma de prueba.
 * Los votos no se borran; lo que se borra es la afirmación falsa sobre ellos.
 *
 * ── 4. candidates.position ──────────────────────────────────────────────────
 *
 * En el contrato v2 el candidato viaja a la cadena como su número de orden
 * dentro de la elección, y el recuento on-chain se indexa por ese número. Si
 * dos candidatos comparten posición, o si una posición cambia después de
 * registrar la elección, el recuento de la cadena deja de corresponderse con
 * los candidatos. Es la misma clase de fallo que el de los identificadores de
 * elección, que ya costó un susto.
 *
 * Estado real comprobado el 16-09-2026 en la base de desarrollo: las 5
 * elecciones tienen TODOS sus candidatos en position = 0. Ninguna cumple la
 * restricción, así que hay que renumerar antes de imponerla.
 *
 * La renumeración es determinista: ORDER BY position, id → 0..n-1. Con todas
 * las posiciones a 0, el criterio efectivo es el id, que es el orden de
 * inserción, que es el orden en que el administrador escribió los candidatos.
 * Es también el orden que la interfaz intenta mostrar hoy con
 * `ORDER BY position ASC`, que con todo a 0 queda indefinido: después de esto,
 * el orden de la papeleta pasa a ser estable.
 *
 * El disparador impide cambiar la posición de un candidato cuya elección ya
 * está en la cadena. Hoy ningún código actualiza `candidates.position` (solo se
 * escribe al crear la elección, ya densa), así que no debería saltar nunca:
 * está para que no empiece a hacerlo por descuido.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

exports.up = async (pgm) => {
  // ── 1. En qué contrato vive cada elección ─────────────────────────────────
  pgm.sql(`ALTER TABLE elections ADD COLUMN IF NOT EXISTS chain_contract_address TEXT;`);

  const contractAddress = (process.env.CONTRACT_ADDRESS || '').trim();
  if (ADDRESS_RE.test(contractAddress)) {
    // Validada contra la expresión regular antes de interpolar.
    pgm.sql(`
      UPDATE elections
         SET chain_contract_address = '${contractAddress}'
       WHERE chain_status = 'synced'
         AND chain_contract_address IS NULL;
    `);
  } else {
    console.warn(
      '[009] CONTRACT_ADDRESS no está definida o no es una dirección válida: ' +
      'las elecciones ya sincronizadas quedan con chain_contract_address = NULL. ' +
      'Habrá que rellenarlo a mano antes de cambiar de contrato.',
    );
  }

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_elections_chain_contract
      ON elections (chain_contract_address);
  `);

  // ── 2. Origen de cada voto ────────────────────────────────────────────────
  pgm.sql(`
    ALTER TABLE nullifier_audit
      ADD COLUMN IF NOT EXISTS vote_source TEXT NOT NULL DEFAULT 'legacy';
  `);

  pgm.sql(`
    ALTER TABLE nullifier_audit DROP CONSTRAINT IF EXISTS nullifier_audit_vote_source_check;
    ALTER TABLE nullifier_audit ADD CONSTRAINT nullifier_audit_vote_source_check
      CHECK (vote_source IN ('chain', 'demo', 'legacy'));
  `);

  // Primero las de demostración: nunca tocaron la cadena, tengan lo que tengan
  // en tx_hash.
  pgm.sql(`
    UPDATE nullifier_audit na
       SET vote_source = 'demo'
      FROM users u
     WHERE u.id = na.user_id
       AND u.email LIKE '%@vtb.demo';
  `);

  // Y del resto, las que sí tienen transacción con bloque.
  pgm.sql(`
    UPDATE nullifier_audit
       SET vote_source = 'chain'
     WHERE vote_source <> 'demo'
       AND tx_hash IS NOT NULL
       AND block_number IS NOT NULL;
  `);

  // ── 3. Fuera los hashes inventados ────────────────────────────────────────
  pgm.sql(`
    UPDATE nullifier_audit
       SET tx_hash = NULL
     WHERE tx_hash IS NOT NULL
       AND block_number IS NULL;
  `);

  // ── 4. Posiciones de candidato ────────────────────────────────────────────
  pgm.sql(`UPDATE candidates SET position = 0 WHERE position IS NULL;`);

  pgm.sql(`
    WITH ordenados AS (
      SELECT id,
             (ROW_NUMBER() OVER (PARTITION BY election_id ORDER BY position, id) - 1) AS nueva
        FROM candidates
    )
    UPDATE candidates c
       SET position = ordenados.nueva
      FROM ordenados
     WHERE c.id = ordenados.id
       AND c.position IS DISTINCT FROM ordenados.nueva;
  `);

  pgm.sql(`ALTER TABLE candidates ALTER COLUMN position SET NOT NULL;`);

  pgm.sql(`
    ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_position_non_negative;
    ALTER TABLE candidates ADD CONSTRAINT candidates_position_non_negative
      CHECK (position >= 0);
  `);

  pgm.sql(`
    ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_election_position_key;
    ALTER TABLE candidates ADD CONSTRAINT candidates_election_position_key
      UNIQUE (election_id, position);
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION candidates_position_is_immutable() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.position IS DISTINCT FROM OLD.position
         AND EXISTS (
           SELECT 1 FROM elections e
            WHERE e.id = OLD.election_id AND e.chain_status = 'synced'
         )
      THEN
        RAISE EXCEPTION
          'candidates.position es el identificador on-chain del candidato % y su eleccion ya esta registrada en la cadena: cambiarlo descuadraria el recuento',
          OLD.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_candidates_position_immutable ON candidates;
    CREATE TRIGGER trg_candidates_position_immutable
      BEFORE UPDATE ON candidates
      FOR EACH ROW EXECUTE FUNCTION candidates_position_is_immutable();
  `);
};

/**
 * La renumeración de posiciones NO se deshace: no se guarda el valor anterior
 * (que era 0 para todos, así que no había información que perder). El resto sí.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = async (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_candidates_position_immutable ON candidates;
    DROP FUNCTION IF EXISTS candidates_position_is_immutable();
    ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_election_position_key;
    ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_position_non_negative;
  `);

  pgm.sql(`
    ALTER TABLE nullifier_audit DROP CONSTRAINT IF EXISTS nullifier_audit_vote_source_check;
    ALTER TABLE nullifier_audit DROP COLUMN IF EXISTS vote_source;
  `);

  pgm.sql(`
    DROP INDEX IF EXISTS idx_elections_chain_contract;
    ALTER TABLE elections DROP COLUMN IF EXISTS chain_contract_address;
  `);
};
