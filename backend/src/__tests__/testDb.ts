/**
 * In-memory test database for integration tests
 * Mimics the production DatabaseWrapper API using sql.js
 */

// sql.js has no ESM build that works under vitest's CJS interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js');

const testSchema = `
-- Associations
CREATE TABLE IF NOT EXISTS associations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    logo_path TEXT,
    theme_json TEXT,
    microsoft_client_id TEXT,
    microsoft_client_secret TEXT,
    microsoft_tenant_id TEXT,
    microsoft_enabled BOOLEAN DEFAULT 0,
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT 0,
    smtp_user TEXT,
    smtp_pass TEXT,
    smtp_from TEXT,
    smtp_enabled BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Orchestras
CREATE TABLE IF NOT EXISTS orchestras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    association_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Instruments
CREATE TABLE IF NOT EXISTS instruments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tuning TEXT,
    clef TEXT DEFAULT 'sol',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tuning, clef)
);

-- Instrument aliases
CREATE TABLE IF NOT EXISTS instrument_aliases (
    id TEXT PRIMARY KEY,
    instrument_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    UNIQUE(instrument_id, alias)
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    association_id TEXT,
    mfa_secret TEXT,
    mfa_enabled BOOLEAN DEFAULT 0,
    microsoft_id TEXT,
    profile_photo_path TEXT,
    private_email TEXT,
    last_login DATETIME,
    onboarded_at DATETIME,
    offboarded_at DATETIME,
    password_changed_at TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    deleted_at DATETIME DEFAULT NULL,
    email_before_delete TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE SET NULL
);

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User instruments
CREATE TABLE IF NOT EXISTS user_instruments (
    user_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    PRIMARY KEY (user_id, instrument_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

-- User orchestras
CREATE TABLE IF NOT EXISTS user_orchestras (
    user_id TEXT NOT NULL,
    orchestra_id TEXT NOT NULL,
    PRIMARY KEY (user_id, orchestra_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

-- Music lists
CREATE TABLE IF NOT EXISTS music_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    orchestra_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    list_type TEXT NOT NULL DEFAULT 'regular',
    concert_date TEXT,
    concert_location TEXT,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

-- Music pieces
CREATE TABLE IF NOT EXISTS music_pieces (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    arranger TEXT,
    instrument_id TEXT,
    tuning TEXT,
    group_number TEXT,
    clef TEXT,
    file_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    youtube_url TEXT,
    association_id TEXT NOT NULL,
    is_shared BOOLEAN DEFAULT 0,
    uploaded_by TEXT,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Music list pieces
CREATE TABLE IF NOT EXISTS music_list_pieces (
    music_list_id TEXT NOT NULL,
    music_piece_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (music_list_id, music_piece_id),
    FOREIGN KEY (music_list_id) REFERENCES music_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE
);

-- Music titles
CREATE TABLE IF NOT EXISTS music_titles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    composer TEXT,
    arranger TEXT,
    youtube_url TEXT,
    description TEXT,
    duration_seconds INTEGER DEFAULT 0,
    grade TEXT,
    mp3_file_path TEXT,
    is_shared BOOLEAN DEFAULT 0,
    internal_notes TEXT,
    association_id TEXT NOT NULL,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(title, arranger, association_id)
);

-- User favorites
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id TEXT NOT NULL,
    music_title_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, music_title_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
);

-- User recent views
CREATE TABLE IF NOT EXISTS user_recent_views (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_title TEXT NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Practice logs
CREATE TABLE IF NOT EXISTS practice_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    music_title_id TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    practiced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
);

-- PDF annotations
CREATE TABLE IF NOT EXISTS pdf_annotations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    music_piece_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    annotation_type TEXT NOT NULL,
    x_position REAL NOT NULL,
    y_position REAL NOT NULL,
    width REAL,
    height REAL,
    content TEXT,
    color TEXT DEFAULT '#FFFF00',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE
);

-- Password reset tokens (token column stores a SHA-256 hash)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- MFA recovery codes (SHA-256 hashes only)
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Rehearsal default days
CREATE TABLE IF NOT EXISTS rehearsal_default_days (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    orchestra_id TEXT,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL
);

-- Rehearsals
CREATE TABLE IF NOT EXISTS rehearsals (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    orchestra_id TEXT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    type TEXT NOT NULL DEFAULT 'regular',
    notes TEXT,
    spond_event_id TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Rehearsal pieces
CREATE TABLE IF NOT EXISTS rehearsal_pieces (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE
);

-- Rehearsal attendance
CREATE TABLE IF NOT EXISTS rehearsal_attendance (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL,
    user_id TEXT,
    spond_member_id TEXT,
    member_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs (simplified for tests)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data TEXT,
    is_read BOOLEAN DEFAULT 0,
    read_at DATETIME,
    sent_push BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    new_music BOOLEAN DEFAULT 1,
    rehearsal_changes BOOLEAN DEFAULT 1,
    seating_updates BOOLEAN DEFAULT 1,
    chat_messages BOOLEAN DEFAULT 1,
    practice_reminders BOOLEAN DEFAULT 1,
    concert_reminders BOOLEAN DEFAULT 1,
    email_enabled BOOLEAN DEFAULT 1,
    push_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Concert types
CREATE TABLE IF NOT EXISTS concert_types (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, value)
);

-- Concerts
CREATE TABLE IF NOT EXISTS concerts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    end_date TEXT,
    location TEXT,
    venue_type TEXT,
    concert_type TEXT DEFAULT 'concert',
    description TEXT,
    notes TEXT,
    wheelchair_spaces INTEGER DEFAULT 0,
    companion_spaces INTEGER DEFAULT 0,
    hearing_loop_available BOOLEAN DEFAULT 0,
    accessible_parking_info TEXT,
    accessibility_info TEXT,
    accessibility_contact_email TEXT,
    accessibility_contact_phone TEXT,
    created_by TEXT,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Concert program items
CREATE TABLE IF NOT EXISTS concert_program_items (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    music_title_id TEXT,
    title TEXT NOT NULL,
    composer TEXT,
    arranger TEXT,
    sort_order INTEGER DEFAULT 0,
    notes TEXT,
    part_of_set TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL
);

-- Concert media
CREATE TABLE IF NOT EXISTS concert_media (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    media_type TEXT NOT NULL,
    url TEXT,
    file_path TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE
);

-- Concert attendance
CREATE TABLE IF NOT EXISTS concert_attendance (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    user_id TEXT,
    member_name TEXT NOT NULL,
    instrument_played TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
`;

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
  private inTransaction: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const SQL = await initSqlJs();
      this.db = new SQL.Database();
      this.db.run('PRAGMA foreign_keys = ON');
      this.db.run(testSchema);
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async reset(): Promise<void> {
    if (!this.db) return;

    // Drop and recreate all tables
    const SQL = await initSqlJs();
    this.db = new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run(testSchema);
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
