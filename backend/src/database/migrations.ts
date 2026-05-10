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
