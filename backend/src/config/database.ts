import sqlite3 from "sqlite3";
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
            position INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    await this.exec("ALTER TABLE users ADD COLUMN org_unit TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE registration_requests ADD COLUMN org_unit TEXT DEFAULT NULL").catch(() => {});
    await this.exec("ALTER TABLE elections ADD COLUMN voter_role TEXT DEFAULT 'student'").catch(() => {});

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
