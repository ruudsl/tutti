# Database Migrations

This guide covers how database migrations work in Harmonie and how to create and manage them.

## Overview

Harmonie uses **better-sqlite3** as its database engine and implements a custom migration system. Migrations are stored in `backend/src/migrations/` and tracked in a `migrations` table in the database.

## Migration System Architecture

### Migration Runner (`backend/src/migrations/runner.ts`)

The migration runner provides:

- **Timestamp-based versioning**: Migrations use 14-digit timestamps (e.g., `20260328120000_create_users_table.ts`)
- **Automatic tracking**: Applied migrations are recorded in a `migrations` table
- **Transaction support**: Each migration runs within a transaction for atomicity
- **Rollback capability**: Every migration must define both `up()` and `down()` functions

### Migration Interface

```typescript
interface Migration {
  version: string;    // 14-digit timestamp
  name: string;       // Descriptive name
  up: () => void;     // Apply migration
  down: () => void;   // Rollback migration
}
```

## Creating a New Migration

### Option 1: Use the Generator

```typescript
import { createMigrationFile } from './migrations/runner';

// Creates: backend/src/migrations/20260625120000_add_user_preferences.ts
createMigrationFile('add_user_preferences');
```

### Option 2: Manual Creation

Create a new file in `backend/src/migrations/` following the naming convention:

```
{timestamp}_{description}.ts
```

Example: `20260625143000_add_user_preferences.ts`

### Migration Template

```typescript
/**
 * Migration: Add user preferences
 * Created at: 2026-06-25T14:30:00.000Z
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      preference_key TEXT NOT NULL,
      preference_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  db.exec('DROP TABLE IF EXISTS user_preferences');
}
```

## Naming Conventions

### Timestamps

Use the format `YYYYMMDDHHmmss`:
- Year (4 digits)
- Month (2 digits)
- Day (2 digits)
- Hour (2 digits)
- Minute (2 digits)
- Second (2 digits)

### Descriptions

Use lowercase with underscores:
- `add_user_preferences` - Adding new table/column
- `remove_legacy_field` - Removing deprecated data
- `add_performance_indexes` - Performance improvements
- `equipment_and_uniforms` - Feature-related changes

## Running Migrations

### Automatic (on Server Start)

Migrations run automatically when the backend starts. The `runMigrations()` function is called during initialization.

### Manual

```typescript
import { runMigrations } from './migrations/runner';

const result = await runMigrations();
console.log('Applied:', result.applied);
console.log('Errors:', result.errors);
```

### Check Status

```typescript
import { getMigrationStatus } from './migrations/runner';

const status = await getMigrationStatus();
status.forEach(m => {
  console.log(`${m.version}_${m.name}: ${m.applied ? 'Applied' : 'Pending'}`);
});
```

## Rolling Back Migrations

### SQLite Limitations

SQLite has limited `ALTER TABLE` support. You cannot:
- Drop columns directly (before SQLite 3.35.0)
- Rename columns in older versions
- Modify column constraints

### Rollback Process

Use the `rollbackLastMigration()` function:

```typescript
import { rollbackLastMigration } from './migrations/runner';

const result = await rollbackLastMigration();
if (result.error) {
  console.error('Rollback failed:', result.error);
} else {
  console.log('Rolled back:', result.rolledBack);
}
```

### Manual Rollback for Complex Cases

For migrations that cannot be automatically rolled back:

1. **Create a compensating migration**: Add a new migration that reverses the changes
2. **Recreate the table**: For column removals, recreate the table without the column:

```typescript
export function down(): void {
  // SQLite table recreation pattern
  db.exec(`
    CREATE TABLE users_backup AS SELECT id, name, email FROM users;
    DROP TABLE users;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
    INSERT INTO users SELECT * FROM users_backup;
    DROP TABLE users_backup;
  `);
}
```

## Best Practices

### 1. Always Provide Both `up()` and `down()`

Even if rollback is complex, document what manual steps would be needed:

```typescript
export function down(): void {
  // Note: This requires manual data migration
  // See MIGRATIONS.md for recovery procedure
  throw new Error('Manual rollback required - see documentation');
}
```

### 2. Use Transactions

The migration runner wraps each migration in a transaction, but for complex multi-step migrations, be explicit:

```typescript
export function up(): void {
  const migrate = db.transaction(() => {
    db.exec('CREATE TABLE ...');
    db.exec('INSERT INTO ...');
    db.exec('CREATE INDEX ...');
  });
  migrate();
}
```

### 3. Check Before Modifying

Handle cases where the change might already exist:

```typescript
export function up(): void {
  // Safe: Uses IF NOT EXISTS
  db.exec('CREATE TABLE IF NOT EXISTS ...');
  db.exec('CREATE INDEX IF NOT EXISTS ...');
}
```

For columns, check first:

```typescript
import { columnExists, tableExists } from '../database/migrations';

export function up(): void {
  if (!columnExists(db, 'users', 'phone')) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }
}
```

### 4. Create Indexes for Foreign Keys

Always index foreign key columns for query performance:

```typescript
export function up(): void {
  db.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
}
```

### 5. Use Descriptive Comments

Document the purpose and any special considerations:

```typescript
/**
 * Migration: Add performance indexes
 * 
 * These indexes improve query performance for:
 * - User session lookups by expiry time
 * - Rehearsal attendance queries
 * - Equipment loan history
 */
export function up(): void {
  // ...
}
```

### 6. Test Migrations Locally

Before deploying:
1. Run the migration on a copy of production data
2. Verify the `up()` function works correctly
3. Test the `down()` function if possible
4. Check query performance on affected tables

## Troubleshooting

### Migration Failed Mid-Way

If a migration fails, the transaction is rolled back. Check the error message and fix the migration file before running again.

### Duplicate Column Error

If you see "duplicate column" errors:
- The column already exists (possibly from an earlier partial run)
- Use `columnExists()` check or `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (SQLite 3.35+)

### Missing Migration File

If the database shows a migration as applied but the file is missing:
- The migration was applied and the file was later deleted
- Remove the record manually: `DELETE FROM migrations WHERE version = '...'`

### Out-of-Order Migrations

Migrations run in timestamp order. If you need to insert a migration before existing ones:
- Use an earlier timestamp
- Ensure it doesn't conflict with already-applied migrations

## Legacy Migration System

The codebase also includes a legacy migration system in `backend/src/database/migrations.ts`. This uses a simpler version-number approach and is being phased out in favor of the timestamp-based system in `backend/src/migrations/`.

Legacy migrations:
- Use integer version numbers (1, 2, 3, ...)
- Stored in `schema_migrations` table
- Only support `up` operations (no rollback)
