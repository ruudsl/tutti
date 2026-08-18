/**
 * Migration: Initial Schema
 * Created at: 2026-03-28
 *
 * This migration creates the initial database schema for the Harmonie music app.
 * It includes all core tables for associations, orchestras, users, instruments,
 * music management, and related features.
 */

import db from '../database/connection';

/**
 * Run the migration - Create all initial tables
 */
export function up(): void {
  // ===========================================
  // CORE TABLES
  // ===========================================

  // Associations (parent organizations)
  db.exec(`
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
        )
    `);

  // Orchestras within an association
  db.exec(`
        CREATE TABLE IF NOT EXISTS orchestras (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            association_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

  // Instruments with main name
  db.exec(`
        CREATE TABLE IF NOT EXISTS instruments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tuning TEXT,
            clef TEXT DEFAULT 'sol',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, tuning, clef)
        )
    `);

  // Instrument aliases/subnames
  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_aliases (
            id TEXT PRIMARY KEY,
            instrument_id TEXT NOT NULL,
            alias TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            UNIQUE(instrument_id, alias)
        )
    `);

  // Users/Members
  db.exec(`
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE SET NULL
        )
    `);

  // User-Instrument junction table
  db.exec(`
        CREATE TABLE IF NOT EXISTS user_instruments (
            user_id TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            PRIMARY KEY (user_id, instrument_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
        )
    `);

  // User-Orchestra junction table
  db.exec(`
        CREATE TABLE IF NOT EXISTS user_orchestras (
            user_id TEXT NOT NULL,
            orchestra_id TEXT NOT NULL,
            PRIMARY KEY (user_id, orchestra_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

  // Genres for music pieces
  db.exec(`
        CREATE TABLE IF NOT EXISTS genres (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

  // ===========================================
  // MUSIC MANAGEMENT
  // ===========================================

  // Music lists per orchestra
  db.exec(`
        CREATE TABLE IF NOT EXISTS music_lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            orchestra_id TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            list_type TEXT NOT NULL DEFAULT 'regular',
            concert_date TEXT,
            concert_location TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

  // Music titles (metadata)
  db.exec(`
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            UNIQUE(title, arranger, association_id)
        )
    `);

  // Music pieces (sheet music files)
  db.exec(`
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // Music list pieces junction table
  db.exec(`
        CREATE TABLE IF NOT EXISTS music_list_pieces (
            music_list_id TEXT NOT NULL,
            music_piece_id TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (music_list_id, music_piece_id),
            FOREIGN KEY (music_list_id) REFERENCES music_lists(id) ON DELETE CASCADE,
            FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE
        )
    `);

  // Music title genres junction table
  db.exec(`
        CREATE TABLE IF NOT EXISTS music_title_genres (
            music_title_id TEXT NOT NULL,
            genre_id TEXT NOT NULL,
            PRIMARY KEY (music_title_id, genre_id),
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
            FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
        )
    `);

  // Shared music access (legacy)
  db.exec(`
        CREATE TABLE IF NOT EXISTS shared_music_access (
            music_piece_id TEXT NOT NULL,
            association_id TEXT NOT NULL,
            granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (music_piece_id, association_id),
            FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

  // Shared title access
  db.exec(`
        CREATE TABLE IF NOT EXISTS shared_title_access (
            music_title_id TEXT NOT NULL,
            association_id TEXT NOT NULL,
            granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (music_title_id, association_id),
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // USER FEATURES
  // ===========================================

  // User favorites
  db.exec(`
        CREATE TABLE IF NOT EXISTS user_favorites (
            user_id TEXT NOT NULL,
            music_title_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, music_title_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
        )
    `);

  // Recent views
  db.exec(`
        CREATE TABLE IF NOT EXISTS user_recent_views (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_title TEXT NOT NULL,
            viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // Practice logs
  db.exec(`
        CREATE TABLE IF NOT EXISTS practice_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            music_title_id TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            notes TEXT,
            practiced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
        )
    `);

  // PDF annotations
  db.exec(`
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
        )
    `);

  // User sessions
  db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // Push subscriptions
  db.exec(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh_key TEXT NOT NULL,
            auth_key TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // Password reset tokens
  db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            used BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // ISSUE TRACKING & LOANS
  // ===========================================

  // Piece issues (Meldkamer)
  db.exec(`
        CREATE TABLE IF NOT EXISTS piece_issues (
            id TEXT PRIMARY KEY,
            music_piece_id TEXT NOT NULL,
            reported_by TEXT NOT NULL,
            page_number INTEGER,
            measure_number TEXT,
            description TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            resolution_notes TEXT,
            resolved_by TEXT,
            resolved_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
            FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // Music loans
  db.exec(`
        CREATE TABLE IF NOT EXISTS loans (
            id TEXT PRIMARY KEY,
            music_title_id TEXT NOT NULL,
            borrower_name TEXT NOT NULL,
            borrower_email TEXT,
            borrower_organization TEXT,
            notes TEXT,
            date_out DATETIME DEFAULT CURRENT_TIMESTAMP,
            expected_return DATETIME,
            date_returned DATETIME,
            status TEXT DEFAULT 'active',
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // Activity log
  db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INDEXES FOR CORE TABLES
  // ===========================================

  db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_association ON users(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orchestras_association ON orchestras(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_music_pieces_instrument ON music_pieces(instrument_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_music_pieces_association ON music_pieces(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_music_pieces_title ON music_pieces(title)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_aliases_alias ON instrument_aliases(alias)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_music_titles_title ON music_titles(title)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_music_titles_association ON music_titles(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_piece_issues_piece ON piece_issues(music_piece_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_piece_issues_status ON piece_issues(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_loans_title ON loans(music_title_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)');
}

/**
 * Rollback the migration - Drop all tables
 */
export function down(): void {
  // Drop tables in reverse order of dependencies
  const tables = [
    'password_reset_tokens',
    'activity_log',
    'loans',
    'piece_issues',
    'push_subscriptions',
    'user_sessions',
    'pdf_annotations',
    'practice_logs',
    'user_recent_views',
    'user_favorites',
    'shared_title_access',
    'shared_music_access',
    'music_title_genres',
    'music_list_pieces',
    'music_pieces',
    'music_titles',
    'music_lists',
    'genres',
    'user_orchestras',
    'user_instruments',
    'users',
    'instrument_aliases',
    'instruments',
    'orchestras',
    'associations',
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
