/**
 * Database Migration Module for Harmonie Music App
 *
 * This module exports all migration-related functions for programmatic access.
 * For CLI usage, run the commands defined in package.json:
 *
 *   npm run migrate:up        - Run pending migrations
 *   npm run migrate:down      - Rollback last migration
 *   npm run migrate:status    - Show migration status
 *   npm run migrate:create <name> - Create new migration
 */

export {
  // Core types
  Migration,
  MigrationRecord,
  MigrationStatus,

  // Functions
  initMigrationsTable,
  getAppliedMigrations,
  isMigrationApplied,
  recordMigration,
  removeMigrationRecord,
  getLastAppliedMigration,
  loadMigrationFiles,
  getPendingMigrations,
  runMigrations,
  rollbackLastMigration,
  getMigrationStatus,
  createMigrationFile,
} from './runner';
