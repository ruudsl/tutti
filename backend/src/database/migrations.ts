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
      `ALTER TABLE workflow_executions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`,
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
