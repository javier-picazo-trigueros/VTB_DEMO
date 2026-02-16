export declare class Database {
    private db;
    constructor();
    /**
     * Inicializa las tablas de la base de datos
     */
    initialize(): Promise<void>;
    /**
     * Ejecuta una query SELECT y retorna todos los resultados
     */
    run<T>(sql: string, params?: any[]): Promise<T[]>;
    /**
     * Ejecuta una query y retorna una fila
     */
    get<T>(sql: string, params?: any[]): Promise<T | undefined>;
    /**
     * Ejecuta INSERT/UPDATE/DELETE
     */
    exec(sql: string, params?: any[]): Promise<{
        lastID: number;
        changes: number;
    }>;
    /**
     * Cierra la conexión
     */
    close(): Promise<void>;
}
export declare function getDatabase(): Database;
