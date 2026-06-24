/**
 * Migration: Fix Foreign Keys and Indices
 * Created at: 2026-06-24
 *
 * Adds missing database indices for improved query performance.
 *
 * Note: SQLite does not support ALTER TABLE to modify foreign key constraints.
 * The following foreign keys are missing ON DELETE clauses and should be
 * addressed in a future schema rebuild:
 *
 * - loans.created_by -> users.id (should be ON DELETE SET NULL)
 * - ticket_invoices.user_id -> users.id (should be ON DELETE SET NULL)
 * - invoice_line_items.invoice_id -> ticket_invoices.id (should be ON DELETE CASCADE)
 * - user_recent_views.user_id -> users.id (should be ON DELETE CASCADE)
 * - external_musicians.created_by -> users.id (should be ON DELETE SET NULL)
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // Index for user recent views lookups by item type and id
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_recent_views_item
    ON user_recent_views(item_type, item_id)
  `);

  // Index for loans by creator
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_created_by
    ON loans(created_by)
  `);

  // Index for loans by expected return date (for overdue queries)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_expected_return
    ON loans(expected_return)
  `);

  // Index for ticket invoices by creation date (for reporting queries)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ticket_invoices_created_at
    ON ticket_invoices(created_at)
  `);

  // Index for invoice line items by invoice (for invoice detail lookups)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
    ON invoice_line_items(invoice_id)
  `);

  // Index for external musicians by email (for duplicate detection)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_external_musicians_email
    ON external_musicians(email)
  `);
}

/**
 * Rollback the migration
 */
export function down(): void {
  db.exec('DROP INDEX IF EXISTS idx_user_recent_views_item');
  db.exec('DROP INDEX IF EXISTS idx_loans_created_by');
  db.exec('DROP INDEX IF EXISTS idx_loans_expected_return');
  db.exec('DROP INDEX IF EXISTS idx_ticket_invoices_created_at');
  db.exec('DROP INDEX IF EXISTS idx_invoice_line_items_invoice_id');
  db.exec('DROP INDEX IF EXISTS idx_external_musicians_email');
}
