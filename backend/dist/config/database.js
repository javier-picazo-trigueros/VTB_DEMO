import sqlite3 from "sqlite3";
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
const DATABASE_PATH = path.join(__dirname, "../../vtb.db");
export class Database {
    constructor() {
        this.db = new sqlite3.Database(DATABASE_PATH);
        // Habilitar foreign keys
        this.db.run("PRAGMA foreign_keys = ON");
    }
    /**
     * Inicializa las tablas de la base de datos
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Tabla de Usuarios (Censo Electoral)
                this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            student_id TEXT UNIQUE NOT NULL,
            role TEXT DEFAULT 'student',
            is_eligible BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        `, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        });
    }
    /**
     * Ejecuta una query SELECT y retorna todos los resultados
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows);
            });
        });
    }
    /**
     * Ejecuta una query y retorna una fila
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err)
                    reject(err);
                else
                    resolve(row);
            });
        });
    }
    /**
     * Ejecuta INSERT/UPDATE/DELETE
     */
    exec(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err)
                    reject(err);
                else
                    resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }
    /**
     * Cierra la conexión
     */
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
}
// Singleton instance
let dbInstance = null;
export function getDatabase() {
    if (!dbInstance) {
        dbInstance = new Database();
    }
    return dbInstance;
}
//# sourceMappingURL=database.js.map