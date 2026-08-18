// eslint-disable-next-line @typescript-eslint/no-require-imports -- sql.js ships a CJS factory without usable ESM typings
const initSqlJs = require('sql.js');
import path from 'path';
import fs from 'fs';
import { schema } from './schema';
import { runMigrations } from './migrations';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/harmonie.db');

// Zorg ervoor dat de data directory bestaat
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Debounce window for coalescing automatic after-write saves
const SAVE_DEBOUNCE_MS = 500;

// Wrapper class to provide better-sqlite3 compatible API
class DatabaseWrapper {
    private db: any = null;
    private dbPath: string;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;
    private inTransaction: boolean = false;
    private SQL: any = null;
    private dirty: boolean = false;
    private saveTimer: NodeJS.Timeout | null = null;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            const SQL = await initSqlJs();
            this.SQL = SQL;

            const isExistingDb = fs.existsSync(this.dbPath);

            // Load existing database or create new one
            if (isExistingDb) {
                const buffer = fs.readFileSync(this.dbPath);
                this.db = new SQL.Database(buffer);
            } else {
                this.db = new SQL.Database();
            }

            // Enable foreign keys
            this.db.run('PRAGMA foreign_keys = ON');

            // For existing databases, run migrations first to add missing columns
            if (isExistingDb) {
                try {
                    runMigrations(this);
                } catch (err) {
                    console.warn('Migration warning:', err);
                }
            }

            // Initialize schema (CREATE TABLE IF NOT EXISTS statements)
            // Run each statement separately to handle partial failures gracefully
            const schemaStatements = schema.split(';').filter(s => s.trim());
            for (const statement of schemaStatements) {
                const trimmed = statement.trim();
                if (!trimmed) continue;

                try {
                    this.db.run(trimmed);
                } catch (err: any) {
                    // If index creation fails due to missing column, skip it
                    // The column will be added by migrations and index created on next restart
                    if (err.message?.includes('no such column') && trimmed.includes('CREATE INDEX')) {
                        console.warn(`Skipping index creation (column not yet added): ${err.message}`);
                        continue;
                    }
                    // If schema fails on existing DB for other column issues, log but continue
                    if (isExistingDb && err.message?.includes('no such column')) {
                        console.error('Schema error (may need manual migration):', err.message);
                        continue;
                    }
                    // For duplicate table/index errors, skip silently
                    if (err.message?.includes('already exists')) {
                        continue;
                    }
                    throw err;
                }
            }

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

    /**
     * Synchronously write the in-memory database to disk.
     * Writes atomically: first to a temp file, then renamed over the real file,
     * so a crash mid-write never leaves a corrupt/partial database file.
     */
    save(): void {
        if (!this.db) return;

        // A direct save supersedes any pending debounced save
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        const data = this.db.export();
        const buffer = Buffer.from(data);
        const tmpPath = `${this.dbPath}.tmp`;
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, this.dbPath);
        this.dirty = false;
    }

    /**
     * Mark the database as dirty and schedule a debounced save.
     * Multiple writes within the debounce window are coalesced into one disk write,
     * so the event loop is no longer blocked by an export+write after every statement.
     */
    private scheduleSave(): void {
        this.dirty = true;
        if (this.saveTimer) return;

        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            if (!this.dirty) return;
            try {
                this.save();
            } catch (err) {
                console.error('Debounced database save failed:', err);
            }
        }, SAVE_DEBOUNCE_MS);

        // Don't let a pending save keep the process alive; graceful shutdown calls flush()
        if (typeof this.saveTimer.unref === 'function') {
            this.saveTimer.unref();
        }
    }

    /**
     * Immediately and synchronously flush any pending (debounced) changes to disk.
     * Call this on graceful shutdown and before backup/restore operations.
     */
    flush(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.dirty) {
            this.save();
        }
    }

    /**
     * Alias for flush(): synchronously persist pending changes to disk right away.
     */
    saveNow(): void {
        this.flush();
    }

    /**
     * Reload the database from disk, discarding the current in-memory copy.
     * Used after a restore has replaced the database file on disk, so the running
     * process picks up the restored data instead of overwriting it on the next save.
     */
    async reload(): Promise<void> {
        // Discard any pending in-memory changes: they belong to the pre-restore state
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        this.dirty = false;

        if (!this.SQL) {
            this.SQL = await initSqlJs();
        }

        if (!fs.existsSync(this.dbPath)) {
            throw new Error(`Cannot reload database: file not found at ${this.dbPath}`);
        }

        const buffer = fs.readFileSync(this.dbPath);
        const newDb = new this.SQL.Database(buffer);
        newDb.run('PRAGMA foreign_keys = ON');

        const oldDb = this.db;
        this.db = newDb;
        this.inTransaction = false;

        if (oldDb) {
            try {
                oldDb.close();
            } catch (err) {
                console.warn('Failed to close old database instance during reload:', err);
            }
        }
    }

    prepare(sql: string): PreparedStatement {
        return new PreparedStatement(this, sql);
    }

    exec(sql: string): void {
        this.ensureInit().run(sql);
        // Only save if not inside a transaction (transaction will save on commit)
        if (!this.inTransaction) {
            this.scheduleSave();
        }
    }

    runStatement(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
        const db = this.ensureInit();
        db.run(sql, params);

        // Capture changes() and last_insert_rowid() immediately after execution,
        // before save() which may interfere with these counters
        let changes = 0;
        let lastInsertRowid = 0;

        const changesStmt = db.prepare('SELECT changes() as changes');
        if (changesStmt.step()) {
            changes = Number(changesStmt.get()[0]) || 0;
        }
        changesStmt.free();

        const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
        if (lastIdStmt.step()) {
            lastInsertRowid = Number(lastIdStmt.get()[0]) || 0;
        }
        lastIdStmt.free();

        // Only save if not inside a transaction (transaction will save on commit)
        if (!this.inTransaction) {
            this.scheduleSave();
        }

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
            this.inTransaction = true;
            db.run('BEGIN TRANSACTION');
            try {
                const result = fn();
                db.run('COMMIT');
                this.inTransaction = false;
                this.scheduleSave();
                return result;
            } catch (error) {
                db.run('ROLLBACK');
                this.inTransaction = false;
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
