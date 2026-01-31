// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js');
import path from 'path';
import fs from 'fs';
import { schema } from './schema';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/harmonie.db');

// Zorg ervoor dat de data directory bestaat
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Wrapper class to provide better-sqlite3 compatible API
class DatabaseWrapper {
    private db: any = null;
    private dbPath: string;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            const SQL = await initSqlJs();

            // Load existing database or create new one
            if (fs.existsSync(this.dbPath)) {
                const buffer = fs.readFileSync(this.dbPath);
                this.db = new SQL.Database(buffer);
            } else {
                this.db = new SQL.Database();
            }

            // Enable foreign keys
            this.db.run('PRAGMA foreign_keys = ON');

            // Initialize schema
            this.db.run(schema);

            // Save to disk
            this.save();

            this.initialized = true;
        })();

        return this.initPromise;
    }

    private ensureInit(): any {
        if (!this.db) {
            throw new Error('Database not initialized. Call init() first.');
        }
        return this.db;
    }

    save(): void {
        if (this.db) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
    }

    prepare(sql: string): PreparedStatement {
        return new PreparedStatement(this, sql);
    }

    exec(sql: string): void {
        this.ensureInit().run(sql);
        this.save();
    }

    runStatement(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
        const db = this.ensureInit();
        db.run(sql, params);
        this.save();

        const changesResult = db.exec('SELECT changes() as changes');
        const changes = changesResult.length > 0 && changesResult[0].values.length > 0
            ? Number(changesResult[0].values[0][0])
            : 0;

        const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = lastIdResult.length > 0 && lastIdResult[0].values.length > 0
            ? Number(lastIdResult[0].values[0][0])
            : 0;

        return { changes, lastInsertRowid };
    }

    getStatement(sql: string, params: any[] = []): any {
        const db = this.ensureInit();
        const stmt = db.prepare(sql);
        stmt.bind(params);

        if (stmt.step()) {
            const columns = stmt.getColumnNames();
            const values = stmt.get();
            stmt.free();

            const result: any = {};
            columns.forEach((col: string, i: number) => {
                result[col] = values[i];
            });
            return result;
        }

        stmt.free();
        return undefined;
    }

    allStatement(sql: string, params: any[] = []): any[] {
        const db = this.ensureInit();
        const stmt = db.prepare(sql);
        stmt.bind(params);

        const results: any[] = [];
        const columns = stmt.getColumnNames();

        while (stmt.step()) {
            const values = stmt.get();
            const row: any = {};
            columns.forEach((col: string, i: number) => {
                row[col] = values[i];
            });
            results.push(row);
        }

        stmt.free();
        return results;
    }

    /**
     * Execute multiple operations in a transaction.
     * If the function throws, the transaction is rolled back.
     * Compatible with better-sqlite3 transaction API.
     */
    transaction<T>(fn: () => T): () => T {
        return () => {
            const db = this.ensureInit();
            db.run('BEGIN TRANSACTION');
            try {
                const result = fn();
                db.run('COMMIT');
                this.save();
                return result;
            } catch (error) {
                db.run('ROLLBACK');
                throw error;
            }
        };
    }
}

class PreparedStatement {
    private wrapper: DatabaseWrapper;
    private sql: string;

    constructor(wrapper: DatabaseWrapper, sql: string) {
        this.wrapper = wrapper;
        this.sql = sql;
    }

    run(...params: any[]): { changes: number; lastInsertRowid: number } {
        return this.wrapper.runStatement(this.sql, params);
    }

    get(...params: any[]): any {
        return this.wrapper.getStatement(this.sql, params);
    }

    all(...params: any[]): any[] {
        return this.wrapper.allStatement(this.sql, params);
    }
}

const db = new DatabaseWrapper(DB_PATH);

// Export types for compatibility
export type { DatabaseWrapper as Database };
export default db;
