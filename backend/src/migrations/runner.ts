/**
 * Database Migration Runner for Harmonie Music App
 *
 * Provides functionality to run, rollback, and track database migrations.
 * Uses timestamp-based versioning (e.g., 20260328120000_create_users_table.ts)
 */

import fs from 'fs';
import path from 'path';
import db from '../database/connection';

export interface Migration {
  version: string;
  name: string;
  up: () => void;
  down: () => void;
}

export interface MigrationRecord {
  id: string;
  version: string;
  name: string;
  applied_at: string;
}

export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
  applied_at?: string;
}

/**
 * Initialize the migrations tracking table
 */
export function initMigrationsTable(): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_migrations_version ON migrations(version)');
}

/**
 * Get all applied migrations from the database
 */
export function getAppliedMigrations(): MigrationRecord[] {
  return db.prepare('SELECT * FROM migrations ORDER BY version ASC').all() as MigrationRecord[];
}

/**
 * Check if a specific migration has been applied
 */
export function isMigrationApplied(version: string): boolean {
  const result = db.prepare('SELECT id FROM migrations WHERE version = ?').get(version);
  return !!result;
}

/**
 * Record a migration as applied
 */
export function recordMigration(version: string, name: string): void {
  const id = `mig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  db.prepare('INSERT INTO migrations (id, version, name) VALUES (?, ?, ?)').run(id, version, name);
}

/**
 * Remove a migration record (for rollback)
 */
export function removeMigrationRecord(version: string): void {
  db.prepare('DELETE FROM migrations WHERE version = ?').run(version);
}

/**
 * Get the last applied migration
 */
export function getLastAppliedMigration(): MigrationRecord | undefined {
  return db.prepare('SELECT * FROM migrations ORDER BY version DESC LIMIT 1').get() as MigrationRecord | undefined;
}

/**
 * Load all migration files from the migrations directory
 */
export async function loadMigrationFiles(): Promise<Migration[]> {
  const migrationsDir = path.join(__dirname, '.');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.match(/^\d{14}_.*\.(ts|js)$/) && !f.endsWith('.d.ts'))
    .sort();

  const migrations: Migration[] = [];

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const migrationModule = await import(filePath);

    const version = file.substring(0, 14);
    const name = file.substring(15).replace(/\.(ts|js)$/, '');

    if (typeof migrationModule.up !== 'function' || typeof migrationModule.down !== 'function') {
      throw new Error(`Migration ${file} must export 'up' and 'down' functions`);
    }

    migrations.push({
      version,
      name,
      up: migrationModule.up,
      down: migrationModule.down,
    });
  }

  return migrations;
}

/**
 * Get pending migrations (not yet applied)
 */
export async function getPendingMigrations(): Promise<Migration[]> {
  const allMigrations = await loadMigrationFiles();
  return allMigrations.filter((m) => !isMigrationApplied(m.version));
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<{ applied: string[]; errors: string[] }> {
  initMigrationsTable();

  const pending = await getPendingMigrations();
  const applied: string[] = [];
  const errors: string[] = [];

  for (const migration of pending) {
    try {
      console.log(`Running migration: ${migration.version}_${migration.name}`);

      // Run the up migration in a transaction
      const runTransaction = db.transaction(() => {
        migration.up();
        recordMigration(migration.version, migration.name);
      });
      runTransaction();

      applied.push(`${migration.version}_${migration.name}`);
      console.log(`  ✓ Applied successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${migration.version}_${migration.name}: ${errorMsg}`);
      console.error(`  ✗ Failed: ${errorMsg}`);
      // Stop on first error
      break;
    }
  }

  return { applied, errors };
}

/**
 * Rollback the last applied migration
 */
export async function rollbackLastMigration(): Promise<{ rolledBack: string | null; error: string | null }> {
  initMigrationsTable();

  const lastMigration = getLastAppliedMigration();

  if (!lastMigration) {
    return { rolledBack: null, error: 'No migrations to rollback' };
  }

  const allMigrations = await loadMigrationFiles();
  const migration = allMigrations.find((m) => m.version === lastMigration.version);

  if (!migration) {
    return {
      rolledBack: null,
      error: `Migration file for ${lastMigration.version}_${lastMigration.name} not found`,
    };
  }

  try {
    console.log(`Rolling back migration: ${migration.version}_${migration.name}`);

    // Run the down migration in a transaction
    const runTransaction = db.transaction(() => {
      migration.down();
      removeMigrationRecord(migration.version);
    });
    runTransaction();

    console.log(`  ✓ Rolled back successfully`);
    return { rolledBack: `${migration.version}_${migration.name}`, error: null };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Rollback failed: ${errorMsg}`);
    return { rolledBack: null, error: errorMsg };
  }
}

/**
 * Get the status of all migrations
 */
export async function getMigrationStatus(): Promise<MigrationStatus[]> {
  initMigrationsTable();

  const allMigrations = await loadMigrationFiles();
  const appliedMigrations = getAppliedMigrations();
  const appliedMap = new Map(appliedMigrations.map((m) => [m.version, m]));

  return allMigrations.map((m) => {
    const applied = appliedMap.get(m.version);
    return {
      version: m.version,
      name: m.name,
      applied: !!applied,
      applied_at: applied?.applied_at,
    };
  });
}

/**
 * Generate a new migration file
 */
export function createMigrationFile(name: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);

  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const filename = `${timestamp}_${safeName}.ts`;
  const filepath = path.join(__dirname, filename);

  const template = `/**
 * Migration: ${name}
 * Created at: ${new Date().toISOString()}
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // TODO: Add your migration code here
    // Example:
    // db.exec(\`
    //     CREATE TABLE IF NOT EXISTS new_table (
    //         id TEXT PRIMARY KEY,
    //         name TEXT NOT NULL,
    //         created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    //     )
    // \`);
}

/**
 * Rollback the migration
 */
export function down(): void {
    // TODO: Add your rollback code here
    // Example:
    // db.exec('DROP TABLE IF EXISTS new_table');
}
`;

  fs.writeFileSync(filepath, template);
  return filepath;
}
