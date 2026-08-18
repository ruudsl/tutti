import db from '../database/connection';

export const id = '20260424000002';
export const name = 'telegram_whatsapp_config';

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
 * Adds per-association configuration columns for Telegram and WhatsApp
 * notification channels, so admins can configure them from the UI
 * instead of relying on environment variables.
 */
export function up(): void {
  // Telegram
  addColumnIfNotExists('associations', 'telegram_bot_token', 'TEXT');
  addColumnIfNotExists('associations', 'telegram_enabled', 'BOOLEAN DEFAULT 0');

  // WhatsApp: provider is 'meta' or 'twilio'
  addColumnIfNotExists('associations', 'whatsapp_provider', 'TEXT');
  addColumnIfNotExists('associations', 'whatsapp_enabled', 'BOOLEAN DEFAULT 0');

  // Meta WhatsApp Business API
  addColumnIfNotExists('associations', 'whatsapp_phone_number_id', 'TEXT');
  addColumnIfNotExists('associations', 'whatsapp_access_token', 'TEXT');

  // Twilio WhatsApp
  addColumnIfNotExists('associations', 'twilio_account_sid', 'TEXT');
  addColumnIfNotExists('associations', 'twilio_auth_token', 'TEXT');
  addColumnIfNotExists('associations', 'twilio_whatsapp_from', 'TEXT');
}

export function down(): void {
  // SQLite pre-3.35 doesn't support DROP COLUMN reliably; leave columns in place
}
