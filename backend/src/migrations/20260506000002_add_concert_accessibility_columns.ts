/**
 * Migration: Add Concert Accessibility Columns and Seed Super Admins
 * Created at: 2026-05-06
 *
 * Adds missing accessibility contact columns to concerts table
 * Seeds existing admin users as super admins
 */

import db from '../database/connection';

export function up(): void {
  // Add accessibility contact columns to concerts table
  const concertColumns = db.prepare("PRAGMA table_info(concerts)").all() as { name: string }[];
  const existingColumns = concertColumns.map(row => row.name);

  if (!existingColumns.includes('accessibility_contact_email')) {
    db.exec('ALTER TABLE concerts ADD COLUMN accessibility_contact_email TEXT');
  }

  if (!existingColumns.includes('accessibility_contact_phone')) {
    db.exec('ALTER TABLE concerts ADD COLUMN accessibility_contact_phone TEXT');
  }

  // Seed existing admins as super admins (for existing installations)
  const adminUsers = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as { id: string }[];
  for (const user of adminUsers) {
    db.prepare(`INSERT OR IGNORE INTO super_admins (id, user_id, permissions) VALUES (?, ?, '["all"]')`)
      .run(`super-${user.id}`, user.id);
  }
}

export function down(): void {
  // SQLite doesn't support DROP COLUMN easily, so we leave the columns
  // They don't cause any harm if unused
}
