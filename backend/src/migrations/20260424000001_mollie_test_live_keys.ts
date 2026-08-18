import db from '../database/connection';

export const id = '20260424000001';
export const name = 'mollie_test_live_keys';

function columnExists(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

function addColumnIfNotExists(table: string, column: string, definition: string): void {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Adds separate test/live Mollie API key columns and an active mode toggle.
 * The existing mollie_api_key_encrypted column is kept as the LIVE key.
 */
export function up(): void {
  addColumnIfNotExists('payment_settings', 'mollie_test_api_key_encrypted', 'TEXT');
  addColumnIfNotExists('payment_settings', 'mollie_test_profile_id', 'TEXT');
  addColumnIfNotExists('payment_settings', 'mollie_mode', "TEXT NOT NULL DEFAULT 'live'");

  // If existing users had a test_ key in mollie_api_key_encrypted, copy it to the test column
  // and set mode to 'test'. We check by decoding each row's stored key.
  const rows = db
    .prepare('SELECT id, mollie_api_key_encrypted FROM payment_settings WHERE mollie_api_key_encrypted IS NOT NULL')
    .all() as { id: string; mollie_api_key_encrypted: string }[];

  for (const row of rows) {
    try {
      const decoded = Buffer.from(row.mollie_api_key_encrypted, 'base64').toString('utf-8');
      if (decoded.startsWith('test_')) {
        db.prepare(
          `UPDATE payment_settings
                     SET mollie_test_api_key_encrypted = ?,
                         mollie_api_key_encrypted = NULL,
                         mollie_mode = 'test'
                     WHERE id = ?`,
        ).run(row.mollie_api_key_encrypted, row.id);
      }
    } catch {
      // Leave row as-is if we can't decode
    }
  }
}

export function down(): void {
  // SQLite doesn't support DROP COLUMN before 3.35, no-op
}
