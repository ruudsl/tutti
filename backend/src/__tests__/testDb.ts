/**
 * In-memory test database for integration tests
 * Mimics the production DatabaseWrapper API using sql.js
 */

// sql.js has no ESM build that works under vitest's CJS interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js');

import { schema } from '../database/schema';

/**
 * The tests run against the real schema (src/database/schema.ts) instead of a
 * hand-maintained copy. The copy that used to live here had drifted: tables
 * and columns added since it was written (music_titles.streaming_links,
 * shared_music_access, ...) were missing, so route tests hit "no such table"
 * errors and had to assert on `[200, 500]` to stay green.
 *
 * Tables that only exist in a migration (and not in schema.ts) are still
 * absent here; those routes cannot be integration-tested yet.
 */
const testSchema = schema;

/**
 * Apply the schema statement by statement, mirroring what
 * database/connection.ts does on a real database: an index whose column is
 * only added by a later migration is skipped instead of aborting the whole
 * schema. Anything else still throws, so a genuinely broken schema fails the
 * test run loudly.
 */
function applySchema(db: any): void {
  for (const statement of testSchema.split(';')) {
    const trimmed = statement.trim();
    if (!trimmed) continue;

    try {
      db.run(trimmed);
    } catch (err: any) {
      const message: string = err?.message ?? '';
      if (message.includes('no such column') && trimmed.includes('CREATE INDEX')) continue;
      if (message.includes('already exists')) continue;
      throw err;
    }
  }
}

/**
 * Tables added after the initial schema live only in src/migrations. Running
 * them here gives the tests the same set of tables a freshly migrated
 * production database has, instead of only the subset in schema.ts.
 *
 * Statements that are already satisfied by schema.ts (duplicate table/column)
 * are skipped, mirroring the tolerant behaviour of the real migration runner.
 */
async function applyMigrations(): Promise<void> {
  const { loadMigrationFiles } = await import('../migrations/runner');
  const migrations = await loadMigrationFiles();

  for (const migration of migrations) {
    try {
      migration.up();
    } catch (err: any) {
      const message: string = err?.message ?? '';
      if (
        message.includes('already exists') ||
        message.includes('duplicate column name') ||
        message.includes('no such column')
      ) {
        continue;
      }
      throw new Error(`Test migration ${migration.version} failed: ${message}`, { cause: err });
    }
  }
}

class PreparedStatement {
  private wrapper: TestDatabaseWrapper;
  private sql: string;

  constructor(wrapper: TestDatabaseWrapper, sql: string) {
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

class TestDatabaseWrapper {
  private db: any = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private sqlJs: any = null;
  private emptySnapshot: Uint8Array | null = null;
  private inTransaction: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const SQL = await initSqlJs();
      this.sqlJs = SQL;
      this.db = new SQL.Database();
      this.db.run('PRAGMA foreign_keys = ON');
      applySchema(this.db);
      this.initialized = true;
      // Migrations run through the mocked connection module, which resolves
      // to this wrapper, so they must run after `initialized` is set.
      await applyMigrations();
      // Snapshot the fully migrated, empty database so reset() is a restore
      // instead of re-running ~200 DDL statements before every test.
      this.emptySnapshot = this.db.export();
    })();

    return this.initPromise;
  }

  async reset(): Promise<void> {
    if (!this.db) return;

    // Restore the empty, fully migrated snapshot taken during init().
    const SQL = this.sqlJs ?? (await initSqlJs());
    this.db = this.emptySnapshot ? new SQL.Database(this.emptySnapshot) : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON');
    if (!this.emptySnapshot) {
      applySchema(this.db);
    }
  }

  private ensureInit(): any {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  save(): void {
    // No-op for in-memory test database
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this, sql);
  }

  exec(sql: string): void {
    this.ensureInit().run(sql);
  }

  runStatement(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
    const db = this.ensureInit();
    db.run(sql, params);

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

  transaction<T>(fn: () => T): () => T {
    return () => {
      const db = this.ensureInit();
      this.inTransaction = true;
      db.run('BEGIN TRANSACTION');
      try {
        const result = fn();
        db.run('COMMIT');
        this.inTransaction = false;
        return result;
      } catch (error) {
        db.run('ROLLBACK');
        this.inTransaction = false;
        throw error;
      }
    };
  }
}

const testDb = new TestDatabaseWrapper();

export type { TestDatabaseWrapper as Database };
export default testDb;
