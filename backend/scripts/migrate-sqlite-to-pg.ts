/**
 * migrate-sqlite-to-pg.ts
 *
 * Migra todos los datos del SQLite local a PostgreSQL.
 * Preserva los IDs originales (OVERRIDING SYSTEM VALUE) para mantener
 * coherencia de claves foráneas.
 * Tras la inserción reinicia las secuencias al valor máximo.
 *
 * Conversiones:
 *   - Booleanos  0/1  → TRUE/FALSE
 *   - Datetimes  TEXT → TIMESTAMPTZ (asume UTC)
 *   - image_url  (base64 en elections) → tabla election_images
 *   - Columnas eliminadas en PG (approved_password, org_unit_domain) → ignoradas
 *
 * Uso:
 *   DATABASE_URL=postgresql://user:pass@host/db \
 *   DATABASE_PATH=./vtb.db \
 *   npx tsx scripts/migrate-sqlite-to-pg.ts
 */

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from '../src/config/database.js';

const { Pool } = pg;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte valor booleano SQLite (0/1/null) a boolean PG */
function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return v !== 0 && v !== '0' && v !== false;
}

/**
 * Convierte datetime SQLite (TEXT "2024-01-01 12:00:00") a TIMESTAMPTZ.
 * SQLite almacena sin zona horaria; lo tratamos como UTC.
 */
function toTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  // Añade 'Z' si no tiene zona horaria explícita
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) {
    return s.replace(' ', 'T') + 'Z';
  }
  return s; // Ya tiene zona horaria o es ISO completo
}

/** Reinicia la secuencia de identidad de una tabla al max(id) actual */
async function resetSequence(pool: pg.Pool, table: string): Promise<void> {
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence($1, 'id'),
      COALESCE((SELECT MAX(id) FROM "${table}"), 1),
      true
    )
  `, [table]);
}

/** Inserta un lote de filas con OVERRIDING SYSTEM VALUE (preserva IDs) */
async function insertBatch(
  pool: pg.Pool,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;
  const colList = columns.map(c => `"${c}"`).join(', ');
  for (const row of rows) {
    const placeholders = row.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
      `INSERT INTO "${table}" (${colList}) OVERRIDING SYSTEM VALUE
       VALUES (${placeholders})
       ON CONFLICT DO NOTHING`,
      row,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL no está definida');
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = process.env.DATABASE_PATH
    ?? path.join(__dirname, '../vtb.db');

  console.log(`\n📦 Origen SQLite: ${dbPath}`);
  console.log(`🐘 Destino PG   : ${databaseUrl.replace(/:\/\/[^@]+@/, '://<credentials>@')}\n`);

  // Abrir SQLite
  process.env.DATABASE_PATH = dbPath;
  const sqlite = new Database();
  await sqlite.initialize();

  // Abrir PG
  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

  try {
    // Envolver todo en una transacción para rollback automático ante error
    const pgClient = await pool.connect();
    await pgClient.query('BEGIN');

    try {
      // ── 1. org_units ────────────────────────────────────────────────────
      const orgUnits = await sqlite.run<any>('SELECT * FROM org_units');
      await insertBatch(pool, 'org_units', [
        'id', 'name', 'domain', 'parent_domain', 'unit_type',
        'institution_domain', 'logo_url', 'primary_color', 'created_at',
      ], orgUnits.map(r => [
        r.id, r.name, r.domain, r.parent_domain, r.unit_type ?? 'institution',
        r.institution_domain ?? '', r.logo_url, r.primary_color,
        toTimestamp(r.created_at),
      ]));
      console.log(`  ✓ org_units          (${orgUnits.length} filas)`);

      // ── 2. schools_and_degrees ──────────────────────────────────────────
      const schools = await sqlite.run<any>('SELECT * FROM schools_and_degrees');
      await insertBatch(pool, 'schools_and_degrees', [
        'id', 'institution_domain', 'school_name', 'degree_name',
        'degree_code', 'years', 'created_at',
      ], schools.map(r => [
        r.id, r.institution_domain, r.school_name, r.degree_name,
        r.degree_code, r.years ?? 4, toTimestamp(r.created_at),
      ]));
      console.log(`  ✓ schools_and_degrees (${schools.length} filas)`);

      // ── 3. users ────────────────────────────────────────────────────────
      // Insertar primero sin approved_by para evitar la auto-referencia FK
      const users = await sqlite.run<any>('SELECT * FROM users');
      await insertBatch(pool, 'users', [
        'id', 'email', 'password_hash', 'name', 'student_id', 'role',
        'admin_domain', 'is_approved', 'is_eligible', 'must_change_password',
        'org_unit', 'school', 'degree', 'year', 'study_group',
        'created_at', 'updated_at',
        // approved_by y approved_at se actualizan en el siguiente paso
      ], users.map(r => [
        r.id, r.email, r.password_hash, r.name, r.student_id, r.role ?? 'student',
        r.admin_domain, toBool(r.is_approved), toBool(r.is_eligible),
        toBool(r.must_change_password),
        r.org_unit, r.school, r.degree, r.year, r.study_group,
        toTimestamp(r.created_at), toTimestamp(r.updated_at) ?? toTimestamp(r.created_at),
      ]));

      // Ahora actualizar approved_by / approved_at
      for (const u of users) {
        if (u.approved_by != null) {
          await pool.query(
            `UPDATE users SET approved_by = $1, approved_at = $2 WHERE id = $3`,
            [u.approved_by, toTimestamp(u.approved_at), u.id],
          );
        }
      }
      console.log(`  ✓ users              (${users.length} filas)`);

      // ── 4. elections ────────────────────────────────────────────────────
      const elections = await sqlite.run<any>('SELECT * FROM elections');
      // image_url va en la propia fila de la elección porque es de donde la lee
      // la aplicación (admin.ts la escribe, elections.ts la devuelve). La copia
      // en election_images de más abajo se mantiene para el día que se mueva de
      // sitio, pero hoy no la lee nadie: si solo se rellenase esa tabla, todas
      // las imágenes desaparecerían de la interfaz tras migrar.
      await insertBatch(pool, 'elections', [
        'id', 'election_id_blockchain', 'name', 'description',
        'start_time', 'end_time', 'is_active',
        'banner_color', 'target_type', 'target_description', 'voter_role',
        'image_url',
        'created_at', 'updated_at',
      ], elections.map(r => [
        r.id, r.election_id_blockchain, r.name, r.description,
        r.start_time, r.end_time, toBool(r.is_active),
        r.banner_color ?? '#1E3A5F', r.target_type ?? 'domain',
        r.target_description, r.voter_role ?? 'student',
        r.image_url ?? null,
        toTimestamp(r.created_at), toTimestamp(r.updated_at) ?? toTimestamp(r.created_at),
      ]));
      console.log(`  ✓ elections          (${elections.length} filas)`);

      // ── 4b. election_images (desde image_url en elections) ──────────────
      const withImages = elections.filter((r: any) => r.image_url);
      for (const e of withImages) {
        const match = (e.image_url as string).match(/^data:([^;]+);base64,/);
        const mimeType = match ? match[1] : 'image/png';
        await pool.query(
          `INSERT INTO election_images (election_id, mime_type, data, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (election_id) DO NOTHING`,
          [e.id, mimeType, e.image_url, toTimestamp(e.created_at)],
        );
      }
      console.log(`  ✓ election_images    (${withImages.length} filas)`);

      // ── 5. candidates ───────────────────────────────────────────────────
      const candidates = await sqlite.run<any>('SELECT * FROM candidates');
      await insertBatch(pool, 'candidates', [
        'id', 'election_id', 'name', 'description', 'position', 'created_at',
      ], candidates.map(r => [
        r.id, r.election_id, r.name, r.description, r.position ?? 0,
        toTimestamp(r.created_at),
      ]));
      console.log(`  ✓ candidates         (${candidates.length} filas)`);

      // ── 6. election_access ──────────────────────────────────────────────
      const access = await sqlite.run<any>('SELECT * FROM election_access');
      await insertBatch(pool, 'election_access', [
        'id', 'election_id', 'email_domain', 'created_at',
      ], access.map(r => [
        r.id, r.election_id, r.email_domain, toTimestamp(r.created_at),
      ]));
      console.log(`  ✓ election_access    (${access.length} filas)`);

      // ── 7. election_targets ─────────────────────────────────────────────
      const targets = await sqlite.run<any>('SELECT * FROM election_targets');
      await insertBatch(pool, 'election_targets', [
        'id', 'election_id', 'target_type', 'target_value', 'created_at',
      ], targets.map(r => [
        r.id, r.election_id, r.target_type, r.target_value, toTimestamp(r.created_at),
      ]));
      console.log(`  ✓ election_targets   (${targets.length} filas)`);

      // ── 8. election_voters ──────────────────────────────────────────────
      const voters = await sqlite.run<any>('SELECT * FROM election_voters');
      for (const v of voters) {
        await pool.query(
          `INSERT INTO election_voters (election_id, user_id, added_at)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [v.election_id, v.user_id, toTimestamp(v.added_at)],
        );
      }
      console.log(`  ✓ election_voters    (${voters.length} filas)`);

      // ── 9. nullifier_audit ──────────────────────────────────────────────
      const audit = await sqlite.run<any>('SELECT * FROM nullifier_audit');
      await insertBatch(pool, 'nullifier_audit', [
        'id', 'user_id', 'election_id', 'nullifier_hash',
        'vote_choice', 'tx_hash', 'block_number', 'candidate_id', 'generated_at',
      ], audit.map(r => [
        r.id, r.user_id, r.election_id, r.nullifier_hash,
        r.vote_choice, r.tx_hash, r.block_number, r.candidate_id,
        toTimestamp(r.generated_at),
      ]));
      console.log(`  ✓ nullifier_audit    (${audit.length} filas)`);

      // ── 10. registration_requests ───────────────────────────────────────
      // approved_password se descarta (columna huérfana eliminada en PG)
      const reqs = await sqlite.run<any>('SELECT * FROM registration_requests');
      await insertBatch(pool, 'registration_requests', [
        'id', 'full_name', 'email', 'student_id', 'status',
        'rejection_reason', 'password_hash',
        'org_unit', 'school', 'degree', 'year', 'study_group',
        'created_at', 'reviewed_at',
      ], reqs.map(r => [
        r.id, r.full_name, r.email, r.student_id,
        ['pending', 'approved', 'rejected'].includes(r.status) ? r.status : 'pending',
        r.rejection_reason, r.password_hash,
        r.org_unit, r.school, r.degree, r.year, r.study_group,
        toTimestamp(r.created_at), toTimestamp(r.reviewed_at),
      ]));
      console.log(`  ✓ registration_reqs  (${reqs.length} filas)`);

      // ── 11. email_whitelist ─────────────────────────────────────────────
      const whitelist = await sqlite.run<any>('SELECT * FROM email_whitelist');
      await insertBatch(pool, 'email_whitelist', [
        'id', 'email', 'full_name', 'student_id', 'admin_domain', 'used', 'imported_at',
      ], whitelist.map(r => [
        r.id, r.email, r.full_name, r.student_id, r.admin_domain,
        toBool(r.used), toTimestamp(r.imported_at),
      ]));
      console.log(`  ✓ email_whitelist    (${whitelist.length} filas)`);

      // ── 12. Reiniciar secuencias ────────────────────────────────────────
      const tables = [
        'users', 'elections', 'election_images', 'candidates',
        'election_access', 'election_targets', 'nullifier_audit',
        'registration_requests', 'email_whitelist',
        'org_units', 'schools_and_degrees',
      ];
      for (const t of tables) {
        await pgClient.query(`
          SELECT setval(
            pg_get_serial_sequence($1, 'id'),
            COALESCE((SELECT MAX(id) FROM "${t}"), 1),
            true
          )
        `, [t]);
      }
      console.log('\n  ✓ Secuencias reiniciadas');

      await pgClient.query('COMMIT');
      console.log('\n✅ Migración completada con éxito\n');
    } catch (err) {
      await pgClient.query('ROLLBACK');
      throw err;
    } finally {
      pgClient.release();
    }
  } finally {
    await pool.end();
    await sqlite.close();
  }
}

main().catch(err => {
  console.error('\n❌ Error durante la migración:', err);
  process.exit(1);
});
