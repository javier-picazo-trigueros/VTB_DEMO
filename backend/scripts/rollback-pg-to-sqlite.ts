/**
 * rollback-pg-to-sqlite.ts
 *
 * Copia los datos actuales de PostgreSQL de vuelta al SQLite local.
 * Útil si la migración a PG falla en producción y hay que revertir.
 *
 * ⚠️  DESTRUCTIVO: trunca las tablas SQLite antes de re-insertar.
 *     Asegúrate de hacer backup de vtb.db antes de ejecutar.
 *
 * Conversiones inversas:
 *   - BOOLEAN PG  → 0/1 INTEGER (SQLite)
 *   - TIMESTAMPTZ → TEXT sin zona horaria (SQLite style: "YYYY-MM-DD HH:MM:SS")
 *   - election_images.data → elections.image_url
 *
 * Uso:
 *   DATABASE_URL=postgresql://user:pass@host/db \
 *   DATABASE_PATH=./vtb.db \
 *   npx tsx scripts/rollback-pg-to-sqlite.ts
 */

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from '../src/config/database.js';

const { Pool } = pg;

// ── Helpers ───────────────────────────────────────────────────────────────

function fromBool(v: boolean | null): number | null {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

function fromTimestamp(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL no está definida');
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = process.env.DATABASE_PATH ?? path.join(__dirname, '../vtb.db');

  console.log(`\n🐘 Origen PG     : ${databaseUrl.replace(/:\/\/[^@]+@/, '://<credentials>@')}`);
  console.log(`📦 Destino SQLite: ${dbPath}\n`);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  process.env.DATABASE_PATH = dbPath;
  const sqlite = new Database();
  await sqlite.initialize();

  try {
    // Desactivar FK temporalmente para el truncado
    await sqlite.exec('PRAGMA foreign_keys = OFF');

    // Truncar en orden inverso de dependencias
    const truncateOrder = [
      'email_whitelist', 'schools_and_degrees', 'org_units',
      'registration_requests', 'nullifier_audit', 'election_voters',
      'election_targets', 'election_access', 'candidates', 'elections', 'users',
    ];
    for (const t of truncateOrder) {
      await sqlite.exec(`DELETE FROM ${t}`);
    }

    // ── 1. org_units ─────────────────────────────────────────────────────
    const orgUnits = (await pool.query('SELECT * FROM org_units ORDER BY id')).rows;
    for (const r of orgUnits) {
      await sqlite.exec(
        `INSERT INTO org_units (id, name, domain, parent_domain, unit_type,
                                institution_domain, logo_url, primary_color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.name, r.domain, r.parent_domain, r.unit_type, r.institution_domain,
         r.logo_url, r.primary_color, fromTimestamp(r.created_at)],
      );
    }
    console.log(`  ✓ org_units          (${orgUnits.length} filas)`);

    // ── 2. schools_and_degrees ────────────────────────────────────────────
    const schools = (await pool.query('SELECT * FROM schools_and_degrees ORDER BY id')).rows;
    for (const r of schools) {
      await sqlite.exec(
        `INSERT INTO schools_and_degrees (id, institution_domain, school_name, degree_name,
                                          degree_code, years, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.institution_domain, r.school_name, r.degree_name,
         r.degree_code, r.years, fromTimestamp(r.created_at)],
      );
    }
    console.log(`  ✓ schools_and_degrees (${schools.length} filas)`);

    // ── 3. users ──────────────────────────────────────────────────────────
    const users = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    for (const r of users) {
      await sqlite.exec(
        `INSERT INTO users (id, email, password_hash, name, student_id, role, admin_domain,
                            is_approved, approved_by, approved_at, is_eligible,
                            must_change_password, org_unit, school, degree, year, study_group,
                            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.email, r.password_hash, r.name, r.student_id, r.role, r.admin_domain,
         fromBool(r.is_approved), r.approved_by, fromTimestamp(r.approved_at),
         fromBool(r.is_eligible), fromBool(r.must_change_password),
         r.org_unit, r.school, r.degree, r.year, r.study_group,
         fromTimestamp(r.created_at), fromTimestamp(r.updated_at)],
      );
    }
    console.log(`  ✓ users              (${users.length} filas)`);

    // ── 4. elections (con image_url reconstituida desde election_images) ──
    const elections = (await pool.query('SELECT * FROM elections ORDER BY id')).rows;
    const images = (await pool.query('SELECT * FROM election_images')).rows;
    const imageByElection = new Map(images.map((i: any) => [i.election_id, i.data as string]));

    for (const r of elections) {
      await sqlite.exec(
        `INSERT INTO elections (id, election_id_blockchain, name, description,
                                start_time, end_time, is_active, image_url,
                                banner_color, target_type, target_description, voter_role,
                                created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.election_id_blockchain, r.name, r.description,
         r.start_time, r.end_time, fromBool(r.is_active),
         imageByElection.get(r.id) ?? null,
         r.banner_color, r.target_type, r.target_description, r.voter_role,
         fromTimestamp(r.created_at), fromTimestamp(r.updated_at)],
      );
    }
    console.log(`  ✓ elections          (${elections.length} filas)`);

    // ── 5. candidates ─────────────────────────────────────────────────────
    const candidates = (await pool.query('SELECT * FROM candidates ORDER BY id')).rows;
    for (const r of candidates) {
      await sqlite.exec(
        `INSERT INTO candidates (id, election_id, name, description, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [r.id, r.election_id, r.name, r.description, r.position, fromTimestamp(r.created_at)],
      );
    }
    console.log(`  ✓ candidates         (${candidates.length} filas)`);

    // ── 6. election_access ────────────────────────────────────────────────
    const access = (await pool.query('SELECT * FROM election_access ORDER BY id')).rows;
    for (const r of access) {
      await sqlite.exec(
        `INSERT INTO election_access (id, election_id, email_domain, created_at)
         VALUES (?, ?, ?, ?)`,
        [r.id, r.election_id, r.email_domain, fromTimestamp(r.created_at)],
      );
    }
    console.log(`  ✓ election_access    (${access.length} filas)`);

    // ── 7. election_targets ───────────────────────────────────────────────
    const targets = (await pool.query('SELECT * FROM election_targets ORDER BY id')).rows;
    for (const r of targets) {
      await sqlite.exec(
        `INSERT INTO election_targets (id, election_id, target_type, target_value, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [r.id, r.election_id, r.target_type, r.target_value, fromTimestamp(r.created_at)],
      );
    }
    console.log(`  ✓ election_targets   (${targets.length} filas)`);

    // ── 8. election_voters ────────────────────────────────────────────────
    const voters = (await pool.query('SELECT * FROM election_voters ORDER BY election_id, user_id')).rows;
    for (const r of voters) {
      await sqlite.exec(
        `INSERT OR IGNORE INTO election_voters (election_id, user_id, added_at)
         VALUES (?, ?, ?)`,
        [r.election_id, r.user_id, fromTimestamp(r.added_at)],
      );
    }
    console.log(`  ✓ election_voters    (${voters.length} filas)`);

    // ── 9. nullifier_audit ────────────────────────────────────────────────
    const audit = (await pool.query('SELECT * FROM nullifier_audit ORDER BY id')).rows;
    for (const r of audit) {
      await sqlite.exec(
        `INSERT INTO nullifier_audit
           (id, user_id, election_id, nullifier_hash, vote_choice,
            tx_hash, block_number, candidate_id, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.user_id, r.election_id, r.nullifier_hash, r.vote_choice,
         r.tx_hash, r.block_number, r.candidate_id, fromTimestamp(r.generated_at)],
      );
    }
    console.log(`  ✓ nullifier_audit    (${audit.length} filas)`);

    // ── 10. registration_requests ─────────────────────────────────────────
    const reqs = (await pool.query('SELECT * FROM registration_requests ORDER BY id')).rows;
    for (const r of reqs) {
      await sqlite.exec(
        `INSERT INTO registration_requests
           (id, full_name, email, student_id, status, rejection_reason,
            password_hash, org_unit, school, degree, year, study_group,
            created_at, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.full_name, r.email, r.student_id, r.status, r.rejection_reason,
         r.password_hash, r.org_unit, r.school, r.degree, r.year, r.study_group,
         fromTimestamp(r.created_at), fromTimestamp(r.reviewed_at)],
      );
    }
    console.log(`  ✓ registration_reqs  (${reqs.length} filas)`);

    // ── 11. email_whitelist ───────────────────────────────────────────────
    const whitelist = (await pool.query('SELECT * FROM email_whitelist ORDER BY id')).rows;
    for (const r of whitelist) {
      await sqlite.exec(
        `INSERT INTO email_whitelist (id, email, full_name, student_id, admin_domain, used, imported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.email, r.full_name, r.student_id, r.admin_domain,
         fromBool(r.used), fromTimestamp(r.imported_at)],
      );
    }
    console.log(`  ✓ email_whitelist    (${whitelist.length} filas)`);

    // Reactivar FK
    await sqlite.exec('PRAGMA foreign_keys = ON');

    console.log('\n✅ Rollback completado con éxito\n');
  } finally {
    await pool.end();
    await sqlite.close();
  }
}

main().catch(err => {
  console.error('\n❌ Error durante el rollback:', err);
  process.exit(1);
});
