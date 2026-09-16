import sqlite3 from "sqlite3";
import crypto from "crypto";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

/**
 * @title Database Configuration - VTB Backend
 * @author Senior Web3 Architect
 * @dev Configuración de SQLite para gestionar usuarios y censo electoral
 *
 * ARQUITECTURA:
 * - SQLite almacena: Usuarios, contraseñas hash, datos del censo
 * - NO almacena: Nullifiers (generados on-the-fly), votos (en blockchain)
 * - Tablas: users, elections_registry, audit_logs
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "../../vtb.db");

export class Database {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(DATABASE_PATH);
    // Habilitar foreign keys
    this.db.run("PRAGMA foreign_keys = ON");
  }

  /**
   * Inicializa las tablas de la base de datos
   */
  async initialize(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.serialize(() => {
        // Tabla de Usuarios (Censo Electoral)
        // is_approved: cuenta aprobada por un administrador (controla acceso al login)
        // is_eligible: usuario elegible para votar (controla acceso al voto)
        // approved_by: FK al admin que aprobó la cuenta
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            student_id TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            admin_domain TEXT DEFAULT NULL,
            is_approved BOOLEAN NOT NULL DEFAULT 0,
            approved_by INTEGER DEFAULT NULL,
            approved_at DATETIME DEFAULT NULL,
            is_eligible BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (approved_by) REFERENCES users (id)
          )
        `);

        // Tabla de Elecciones (Metadata)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS elections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id_blockchain INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabla de Auditoría de Generación de Nullifiers
        this.db.run(`
          CREATE TABLE IF NOT EXISTS nullifier_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            election_id INTEGER NOT NULL,
            nullifier_hash TEXT NOT NULL,
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (election_id) REFERENCES elections (id),
            UNIQUE(user_id, election_id)
          )
        `);

        // Tabla de Candidatos para cada Elección
        this.db.run(`
          CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            -- position es el identificador del candidato en la cadena: única
            -- por elección, igual que en PostgreSQL (migración 009). Aquí no
            -- hay disparador de inmutabilidad; el motor real es PostgreSQL y
            -- esto solo mantiene la paridad para los tests.
            position INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(election_id, position),
            FOREIGN KEY (election_id) REFERENCES elections (id)
          )
        `);

        // Tabla de Electores Permitidos por Elección (FIX D - BLOQUE 2.x)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS election_voters (
            election_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (election_id, user_id),
            FOREIGN KEY (election_id) REFERENCES elections (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `);

        // Tabla de Solicitudes de Registro (3.1 - Registration Request Flow)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS registration_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            student_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            rejection_reason TEXT,
            password_hash TEXT DEFAULT NULL,
            approved_password TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME
          )
        `);

        // Tabla de Mapeo Elecciones-Dominios
        this.db.run(`
          CREATE TABLE IF NOT EXISTS election_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id INTEGER NOT NULL,
            email_domain TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (election_id) REFERENCES elections (id),
            UNIQUE(election_id, email_domain)
          )
        `);

        // Tabla de unidades organizativas (jerarquía de dominios)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS org_units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            domain TEXT NOT NULL UNIQUE,
            parent_domain TEXT DEFAULT NULL,
            unit_type TEXT DEFAULT 'institution',
            institution_domain TEXT NOT NULL DEFAULT '',
            logo_url TEXT DEFAULT NULL,
            primary_color TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabla de objetivos de elección (reemplaza el uso simple de election_access)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS election_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id INTEGER NOT NULL,
            target_type TEXT NOT NULL,
            target_value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (election_id) REFERENCES elections(id)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // Migrations para bases de datos existentes
    await this.exec("ALTER TABLE users ADD COLUMN admin_domain TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT 0").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN approved_by INTEGER DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN approved_at DATETIME DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN approved_password TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN password_hash TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE nullifier_audit ADD COLUMN vote_choice TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE nullifier_audit ADD COLUMN tx_hash TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE nullifier_audit ADD COLUMN block_number INTEGER DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE nullifier_audit ADD COLUMN candidate_id INTEGER DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN org_unit_domain TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE elections ADD COLUMN image_url TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE elections ADD COLUMN banner_color TEXT DEFAULT '#1E3A5F'").catch(() => {});
    await this.exec("ALTER TABLE elections ADD COLUMN target_type TEXT DEFAULT 'domain'").catch(() => {});
    await this.exec("ALTER TABLE elections ADD COLUMN target_description TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE org_units ADD COLUMN institution_domain TEXT NOT NULL DEFAULT ''").catch(() => {});
    await this.exec("ALTER TABLE org_units ADD COLUMN logo_url TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE org_units ADD COLUMN primary_color TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN org_unit TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN org_unit TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE elections ADD COLUMN voter_role TEXT DEFAULT 'student'").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN deleted_at DATETIME DEFAULT NULL").catch(() => {});

    await this.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});
    await this.exec(
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)'
    ).catch(() => {});

    // New attribute-based org structure
    await this.exec("ALTER TABLE users ADD COLUMN school TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN degree TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN year INTEGER DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE users ADD COLUMN study_group TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN school TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN degree TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN year INTEGER DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN study_group TEXT DEFAULT NULL").catch(() => {});

    await this.exec(`
      CREATE TABLE IF NOT EXISTS schools_and_degrees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        institution_domain TEXT NOT NULL,
        school_name TEXT NOT NULL,
        degree_name TEXT NOT NULL,
        degree_code TEXT,
        years INTEGER DEFAULT 4,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(institution_domain, school_name, degree_name)
      )
    `).catch(() => {});

    await this.exec(`
      CREATE TABLE IF NOT EXISTS email_whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        full_name TEXT,
        student_id TEXT,
        admin_domain TEXT NOT NULL,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        used INTEGER DEFAULT 0,
        UNIQUE(email, admin_domain)
      )
    `).catch(() => {});

    // Los superadmin y admin creados directamente en BD ya están aprobados
    await this.exec(
      "UPDATE users SET is_approved = 1, approved_at = CURRENT_TIMESTAMP WHERE role IN ('admin', 'superadmin') AND is_approved = 0"
    ).catch(() => {});

    // ── Email infrastructure ─────────────────────────────────────────────────
    await this.exec(`
      CREATE TABLE IF NOT EXISTS email_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient     TEXT NOT NULL,
        template_name TEXT NOT NULL,
        subject       TEXT NOT NULL,
        html_body     TEXT DEFAULT NULL,
        text_body     TEXT DEFAULT NULL,
        resend_id     TEXT DEFAULT NULL,
        status        TEXT NOT NULL DEFAULT 'queued',
        attempts      INTEGER NOT NULL DEFAULT 0,
        last_error    TEXT DEFAULT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at       DATETIME DEFAULT NULL
      )
    `).catch(() => {});
    // Migrations para DBs existentes antes de añadir las columnas de cuerpo
    await this.exec('ALTER TABLE email_log ADD COLUMN html_body TEXT DEFAULT NULL').catch(() => {});
    await this.exec('ALTER TABLE email_log ADD COLUMN text_body TEXT DEFAULT NULL').catch(() => {});
    await this.exec(
      'CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON email_log(recipient)'
    ).catch(() => {});
    await this.exec(
      'CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status, created_at)'
    ).catch(() => {});

    // ── Cola de emails con estado en BD (HIGH-1) ─────────────────────────────
    // next_retry_at   → cuándo vuelve a ser elegible (sustituye a los setTimeout)
    // claimed_at      → cuándo la reclamó un worker; permite recuperar filas
    //                   que quedaron en 'sending' porque el proceso murió
    // idempotency_key → se envía a Resend para que un reintento tras un crash
    //                   no entregue el mismo correo dos veces
    await this.exec('ALTER TABLE email_log ADD COLUMN next_retry_at DATETIME DEFAULT NULL').catch(() => {});
    await this.exec('ALTER TABLE email_log ADD COLUMN claimed_at DATETIME DEFAULT NULL').catch(() => {});
    await this.exec('ALTER TABLE email_log ADD COLUMN idempotency_key TEXT DEFAULT NULL').catch(() => {});
    await this.exec(
      'CREATE INDEX IF NOT EXISTS idx_email_log_pending ON email_log(status, next_retry_at)'
    ).catch(() => {});

    // Reconciliación de filas anteriores al cambio de máquina de estados.
    // 'failed' dejó de ser un estado de espera: ahora lo pendiente es 'queued'
    // y lo agotado es 'dead'. Sin esto, los correos que quedaron en 'failed'
    // no los recogería nadie.
    await this.exec(
      "UPDATE email_log SET status = 'queued' WHERE status = 'failed' AND attempts < 5"
    ).catch(() => {});
    await this.exec(
      "UPDATE email_log SET status = 'dead' WHERE status = 'failed' AND attempts >= 5"
    ).catch(() => {});
    // Filas 'queued' antiguas sin next_retry_at: elegibles ya.
    await this.exec(
      "UPDATE email_log SET next_retry_at = ? WHERE status = 'queued' AND next_retry_at IS NULL",
      [new Date().toISOString()]
    ).catch(() => {});

    await this.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        type       TEXT NOT NULL DEFAULT 'reset',
        expires_at DATETIME NOT NULL,
        used_at    DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});
    await this.exec(
      'CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)'
    ).catch(() => {});
    await this.exec(
      'CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash)'
    ).catch(() => {});

    // ── P1-7: email_log no guarda tokens ─────────────────────────────────────
    // Los correos con enlace se encolan con template_data, sin cuerpo, y el
    // token se genera al enviar (services/email/queue.ts). Esto limpia lo que
    // quedó guardado antes del cambio. En PostgreSQL lo hace la migración
    // 20260915000007_email_log_without_tokens.
    await this.exec('ALTER TABLE email_log ADD COLUMN template_data TEXT DEFAULT NULL').catch(() => {});
    await this.scrubLoggedEmailTokens().catch((err) =>
      console.error('[email_log] limpieza de tokens (P1-7) fallida:', err)
    );

    // Tracking de notificaciones de elección (apertura / cierre)
    await this.exec(
      'ALTER TABLE elections ADD COLUMN notify_open_sent_at DATETIME DEFAULT NULL'
    ).catch(() => {});
    await this.exec(
      'ALTER TABLE elections ADD COLUMN notify_close_sent_at DATETIME DEFAULT NULL'
    ).catch(() => {});

    // Estado de sincronización con blockchain (migración 008 en PostgreSQL). Las
    // filas existentes quedan 'pending' por el DEFAULT: su election_id_blockchain
    // salió de la antigua renumeración 1..N y no hay forma de saber si es correcto.
    for (const ddl of [
      "ALTER TABLE elections ADD COLUMN chain_status TEXT NOT NULL DEFAULT 'pending'",
      'ALTER TABLE elections ADD COLUMN chain_tx_hash TEXT DEFAULT NULL',
      'ALTER TABLE elections ADD COLUMN chain_error TEXT DEFAULT NULL',
      'ALTER TABLE elections ADD COLUMN chain_attempts INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE elections ADD COLUMN chain_next_retry_at DATETIME DEFAULT NULL',
      'ALTER TABLE elections ADD COLUMN chain_claimed_at DATETIME DEFAULT NULL',
      'ALTER TABLE elections ADD COLUMN chain_synced_at DATETIME DEFAULT NULL',
    ]) {
      await this.exec(ddl).catch(() => {});
    }
  }

  /**
   * P1-7: anula los tokens cuyo texto en claro quedó en cuerpos de email_log,
   * descarta los correos pendientes que lo llevan y vacía los cuerpos de las
   * filas en estado final. Mismo efecto que la migración 007 de PostgreSQL.
   *
   * Se ejecuta en cada initialize(), y es barato: tras la primera pasada ya no
   * quedan cuerpos con token que encontrar. El orden importa, porque el primer
   * paso lee los cuerpos que el último borra.
   */
  async scrubLoggedEmailTokens(): Promise<void> {
    const rows = await this.run<{ html_body: string | null; text_body: string | null }>(
      "SELECT html_body, text_body FROM email_log WHERE html_body LIKE '%token=%' OR text_body LIKE '%token=%'"
    );

    // password_reset_tokens guarda sha256(token) en hex.
    const leaked = new Set<string>();
    for (const r of rows) {
      for (const m of `${r.text_body ?? ''} ${r.html_body ?? ''}`.matchAll(/token=([0-9a-f]{64})/g)) {
        leaked.add(crypto.createHash('sha256').update(m[1]).digest('hex'));
      }
    }
    for (const hash of leaked) {
      await this.exec(
        'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND used_at IS NULL',
        [hash]
      );
    }

    await this.exec(
      `UPDATE email_log
          SET status = 'dead',
              last_error = 'P1-7: el cuerpo llevaba el token en claro; descartado sin enviar',
              claimed_at = NULL,
              next_retry_at = NULL
        WHERE status IN ('queued', 'sending')
          AND template_data IS NULL
          AND (html_body LIKE '%token=%' OR text_body LIKE '%token=%')`
    );
    await this.exec(
      `UPDATE email_log
          SET html_body = NULL, text_body = NULL
        WHERE status IN ('sent', 'dead', 'skipped')
          AND (html_body IS NOT NULL OR text_body IS NOT NULL)`
    );
  }

  /**
   * Ejecuta una query SELECT y retorna todos los resultados
   */
  run<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  /**
   * Ejecuta una query y retorna una fila
   */
  get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  /**
   * Ejecuta INSERT/UPDATE/DELETE
   */
  exec(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /**
   * Cierra la conexión
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Singleton instance
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}
