/**
 * Database migrations for schema updates
 * Each migration adds missing columns/tables to existing databases
 */

interface Migration {
  version: number;
  name: string;
  up: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'add_posts_scheduled_at',
    up: [
      `ALTER TABLE posts ADD COLUMN scheduled_at DATETIME`,
    ],
  },
  {
    version: 2,
    name: 'add_task_templates',
    up: [
      `CREATE TABLE IF NOT EXISTS task_templates (
        id TEXT PRIMARY KEY,
        association_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        task_list_id TEXT,
        priority TEXT DEFAULT 'medium',
        estimated_hours REAL,
        checklist_items TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
        FOREIGN KEY (task_list_id) REFERENCES task_lists(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_task_templates_assoc ON task_templates(association_id)`,
    ],
  },
  {
    version: 3,
    name: 'add_workflow_executions_status',
    up: [
      `ALTER TABLE workflow_executions ADD COLUMN status TEXT DEFAULT 'pending'`,
    ],
  },
  {
    version: 4,
    name: 'add_wiki_attachments',
    up: [
      `CREATE TABLE IF NOT EXISTS wiki_attachments (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        uploaded_by TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_wiki_attachments_page ON wiki_attachments(page_id)`,
    ],
  },
  {
    version: 5,
    name: 'add_email_campaign_attachments',
    up: [
      `CREATE TABLE IF NOT EXISTS email_campaign_attachments (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        uploaded_by TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_email_campaign_attachments_campaign ON email_campaign_attachments(campaign_id)`,
    ],
  },
  {
    version: 6,
    name: 'add_budgets_table',
    up: [
      `CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        association_id TEXT NOT NULL,
        fiscal_year_id TEXT,
        account_id TEXT NOT NULL,
        cost_center_id TEXT,
        name TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
        FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE SET NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_budgets_assoc ON budgets(association_id)`,
      `CREATE INDEX IF NOT EXISTS idx_budgets_fiscal_year ON budgets(fiscal_year_id)`,
      `CREATE INDEX IF NOT EXISTS idx_budgets_account ON budgets(account_id)`,
    ],
  },
  {
    version: 7,
    name: 'add_equipment_damage_reports',
    up: [
      `CREATE TABLE IF NOT EXISTS equipment_damage_reports (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        reported_by TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'severe', 'unusable')),
        photos TEXT,
        repair_cost REAL,
        repaired_at DATETIME,
        repaired_by TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (repaired_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_equipment_damage_item ON equipment_damage_reports(item_id)`,
    ],
  },
  {
    version: 8,
    name: 'add_polls_auto_rehearsal',
    up: [
      `ALTER TABLE polls ADD COLUMN is_date_poll INTEGER DEFAULT 0`,
      `ALTER TABLE polls ADD COLUMN auto_create_rehearsal INTEGER DEFAULT 0`,
      `ALTER TABLE polls ADD COLUMN target_orchestra_id TEXT`,
      `ALTER TABLE poll_options ADD COLUMN option_value TEXT`,
    ],
  },
  {
    version: 9,
    name: 'ensure_workflow_executions_status',
    up: [
      // Re-ensure status column exists (in case migration 3 was skipped)
      `ALTER TABLE workflow_executions ADD COLUMN status TEXT DEFAULT 'pending'`,
    ],
  },
  {
    version: 10,
    name: 'add_ticket_transfers',
    up: [
      `CREATE TABLE IF NOT EXISTS ticket_transfers (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        from_user_id TEXT,
        from_email TEXT NOT NULL,
        from_name TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        transfer_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, cancelled, expired
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        accepted_at DATETIME,
        cancelled_at DATETIME,
        accepted_by_user_id TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON ticket_transfers(ticket_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_transfers_code ON ticket_transfers(transfer_code)`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_transfers_from_user ON ticket_transfers(from_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_transfers_recipient ON ticket_transfers(recipient_email)`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_transfers_status ON ticket_transfers(status)`,
    ],
  },
  {
    version: 11,
    name: 'add_performance_indices',
    up: [
      // User queries - commonly filtered by association, status, and role
      `CREATE INDEX IF NOT EXISTS idx_users_association_status ON users(association_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
      `CREATE INDEX IF NOT EXISTS idx_users_microsoft_id ON users(microsoft_id)`,
      `CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`,
      `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)`,

      // User orchestras - frequently joined
      `CREATE INDEX IF NOT EXISTS idx_user_orchestras_orchestra ON user_orchestras(orchestra_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_orchestras_user ON user_orchestras(user_id)`,

      // User instruments - frequently joined
      `CREATE INDEX IF NOT EXISTS idx_user_instruments_instrument ON user_instruments(instrument_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_instruments_user ON user_instruments(user_id)`,

      // Music pieces - commonly filtered by title, association, uploaded_by
      `CREATE INDEX IF NOT EXISTS idx_music_pieces_uploaded_by ON music_pieces(uploaded_by)`,
      `CREATE INDEX IF NOT EXISTS idx_music_pieces_created_at ON music_pieces(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_music_pieces_title_association ON music_pieces(title, association_id)`,

      // Music list pieces - join table optimization
      `CREATE INDEX IF NOT EXISTS idx_music_list_pieces_piece ON music_list_pieces(music_piece_id)`,
      `CREATE INDEX IF NOT EXISTS idx_music_list_pieces_list ON music_list_pieces(music_list_id)`,

      // Music lists - commonly filtered
      `CREATE INDEX IF NOT EXISTS idx_music_lists_orchestra ON music_lists(orchestra_id)`,
      `CREATE INDEX IF NOT EXISTS idx_music_lists_active ON music_lists(is_active)`,

      // Rehearsals - commonly filtered by date range
      `CREATE INDEX IF NOT EXISTS idx_rehearsals_orchestra ON rehearsals(orchestra_id)`,
      `CREATE INDEX IF NOT EXISTS idx_rehearsals_type ON rehearsals(type)`,
      `CREATE INDEX IF NOT EXISTS idx_rehearsals_date_association ON rehearsals(date, association_id)`,

      // Concerts - commonly filtered by date and type
      `CREATE INDEX IF NOT EXISTS idx_concerts_date_association ON concerts(date, association_id)`,

      // Session management
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)`,

      // User favorites - commonly queried per user
      `CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id)`,

      // Recent views - commonly queried per user with order by date
      `CREATE INDEX IF NOT EXISTS idx_user_recent_views_user_date ON user_recent_views(user_id, viewed_at DESC)`,

      // Practice logs - commonly queried per user
      `CREATE INDEX IF NOT EXISTS idx_practice_logs_user ON practice_logs(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_practice_logs_title ON practice_logs(music_title_id)`,
      `CREATE INDEX IF NOT EXISTS idx_practice_logs_date ON practice_logs(practiced_at)`,

      // Push subscriptions
      `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)`,

      // Music title genres - join table
      `CREATE INDEX IF NOT EXISTS idx_music_title_genres_title ON music_title_genres(music_title_id)`,
      `CREATE INDEX IF NOT EXISTS idx_music_title_genres_genre ON music_title_genres(genre_id)`,

      // Ticket orders - commonly filtered
      `CREATE INDEX IF NOT EXISTS idx_ticket_orders_buyer_email ON ticket_orders(buyer_email)`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_orders_paid_at ON ticket_orders(paid_at)`,
      `CREATE INDEX IF NOT EXISTS idx_ticket_orders_created_at ON ticket_orders(created_at)`,
    ],
  },
];

/**
 * Check if a column exists in a table
 */
export function columnExists(db: any, table: string, column: string): boolean {
  try {
    const result = db.prepare(`PRAGMA table_info(${table})`).all();
    return result.some((col: any) => col.name === column);
  } catch {
    return false;
  }
}

/**
 * Check if a table exists
 */
export function tableExists(db: any, table: string): boolean {
  try {
    const result = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table);
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: any): void {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
  );

  // Run pending migrations
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    console.log(`Running migration ${migration.version}: ${migration.name}`);

    for (const sql of migration.up) {
      try {
        // Skip ALTER TABLE if table doesn't exist (will be created by schema)
        if (sql.includes('ALTER TABLE')) {
          const tableMatch = sql.match(/ALTER TABLE (\w+)/);
          if (tableMatch && !tableExists(db, tableMatch[1])) {
            console.log(`  Skipping: table ${tableMatch[1]} does not exist yet (will be created by schema)`);
            continue;
          }
        }

        // Skip ALTER TABLE if column already exists
        if (sql.includes('ALTER TABLE') && sql.includes('ADD COLUMN')) {
          const match = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
          if (match && columnExists(db, match[1], match[2])) {
            console.log(`  Skipping: column ${match[2]} already exists in ${match[1]}`);
            continue;
          }
        }

        // Skip CREATE TABLE if table already exists (handled by IF NOT EXISTS, but double-check)
        if (sql.includes('CREATE TABLE') && !sql.includes('IF NOT EXISTS')) {
          const match = sql.match(/CREATE TABLE (\w+)/);
          if (match && tableExists(db, match[1])) {
            console.log(`  Skipping: table ${match[1]} already exists`);
            continue;
          }
        }

        db.exec(sql);
      } catch (err: any) {
        // Ignore "duplicate column" errors
        if (err.message?.includes('duplicate column')) {
          console.log(`  Skipping: ${err.message}`);
          continue;
        }
        throw err;
      }
    }

    // Record migration
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      migration.version,
      migration.name
    );

    console.log(`  Migration ${migration.version} complete`);
  }
}
