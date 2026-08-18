#!/usr/bin/env node
/**
 * Migration CLI for Harmonie Music App
 *
 * Usage:
 *   npx tsx src/migrations/cli.ts up        - Run pending migrations
 *   npx tsx src/migrations/cli.ts down      - Rollback last migration
 *   npx tsx src/migrations/cli.ts status    - Show migration status
 *   npx tsx src/migrations/cli.ts create <name> - Create new migration
 */

import db from '../database/connection';
import {
  runMigrations,
  rollbackLastMigration,
  getMigrationStatus,
  createMigrationFile,
  initMigrationsTable,
} from './runner';

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  // Initialize database connection
  await db.init();

  try {
    switch (command) {
      case 'up':
        await handleUp();
        break;

      case 'down':
        await handleDown();
        break;

      case 'status':
        await handleStatus();
        break;

      case 'create':
        handleCreate(args[0]);
        break;

      default:
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  process.exit(0);
}

async function handleUp() {
  console.log('Running pending migrations...\n');

  const { applied, errors } = await runMigrations();

  if (applied.length === 0 && errors.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  console.log('\n--- Summary ---');

  if (applied.length > 0) {
    console.log(`Applied ${applied.length} migration(s):`);
    applied.forEach((m) => console.log(`  - ${m}`));
  }

  if (errors.length > 0) {
    console.log(`\nFailed ${errors.length} migration(s):`);
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

async function handleDown() {
  console.log('Rolling back last migration...\n');

  const { rolledBack, error } = await rollbackLastMigration();

  if (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }

  if (rolledBack) {
    console.log(`\nRolled back: ${rolledBack}`);
  }
}

async function handleStatus() {
  console.log('Migration Status\n');
  console.log('='.repeat(80));

  const status = await getMigrationStatus();

  if (status.length === 0) {
    console.log('No migrations found.');
    return;
  }

  // Format status table
  const maxVersionLen = Math.max(...status.map((s) => s.version.length), 7);
  const maxNameLen = Math.max(...status.map((s) => s.name.length), 4);

  console.log('Version'.padEnd(maxVersionLen + 2) + 'Name'.padEnd(maxNameLen + 2) + 'Status'.padEnd(12) + 'Applied At');
  console.log('-'.repeat(80));

  for (const s of status) {
    const statusStr = s.applied ? '✓ Applied' : '○ Pending';
    const appliedAt = s.applied_at || '-';

    console.log(s.version.padEnd(maxVersionLen + 2) + s.name.padEnd(maxNameLen + 2) + statusStr.padEnd(12) + appliedAt);
  }

  console.log('-'.repeat(80));

  const appliedCount = status.filter((s) => s.applied).length;
  const pendingCount = status.filter((s) => !s.applied).length;

  console.log(`\nTotal: ${status.length} | Applied: ${appliedCount} | Pending: ${pendingCount}`);
}

function handleCreate(name: string | undefined) {
  if (!name) {
    console.error('Error: Migration name is required');
    console.log('Usage: migrate:create <name>');
    process.exit(1);
  }

  console.log(`Creating new migration: ${name}`);

  const filepath = createMigrationFile(name);

  console.log(`\nCreated: ${filepath}`);
  console.log('\nEdit the file to add your migration code.');
}

function showHelp() {
  console.log(`
Harmonie Database Migration CLI

Usage:
  npx tsx src/migrations/cli.ts <command> [options]

Commands:
  up              Run all pending migrations
  down            Rollback the last applied migration
  status          Show the status of all migrations
  create <name>   Create a new migration file

Examples:
  npx tsx src/migrations/cli.ts up
  npx tsx src/migrations/cli.ts down
  npx tsx src/migrations/cli.ts status
  npx tsx src/migrations/cli.ts create add_phone_to_users

npm scripts (after adding to package.json):
  npm run migrate:up
  npm run migrate:down
  npm run migrate:status
  npm run migrate:create -- add_phone_to_users
`);
}

// Run the CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
