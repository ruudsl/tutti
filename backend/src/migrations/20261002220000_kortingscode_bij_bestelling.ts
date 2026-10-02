/**
 * Migration: kortingscode bij bestelling
 * Created at: 2026-10-02
 *
 * Kortingscodes waren half gebouwd: aanmaken en controleren kon, maar een
 * bestelling nam geen code aan. Besluit oktober 2026: afbouwen. Deze migratie
 * geeft een bestelling de code en het kortingsbedrag
 * (`ticket_orders.discount_code_id`, `ticket_orders.discount_amount`), en
 * maakt het gebruik uniek per bestelling: dezelfde bestelling kan een code
 * niet twee keer tellen. Zie services/kortingscodes.ts.
 *
 * `down` haalt de index en de twee kolommen weer weg.
 */

import db from '../database/connection';
import logger from '../utils/logger';
import { withTransaction } from '../utils/database';

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[];
  return kolommen.some((k) => k.name === kolom);
}

export function up(): void {
  logger.info('Running migration: kortingscode_bij_bestelling (up)');

  withTransaction(() => {
    if (!heeftKolom('ticket_orders', 'discount_code_id')) {
      db.exec(
        'ALTER TABLE ticket_orders ADD COLUMN discount_code_id TEXT REFERENCES discount_codes(id) ON DELETE SET NULL',
      );
    }
    if (!heeftKolom('ticket_orders', 'discount_amount')) {
      db.exec('ALTER TABLE ticket_orders ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_code_usage_bestelling ON discount_code_usage(order_id)');
  });

  logger.info('Migration completed: kortingscode_bij_bestelling');
}

export function down(): void {
  logger.info('Running migration: kortingscode_bij_bestelling (down)');

  withTransaction(() => {
    db.exec('DROP INDEX IF EXISTS idx_discount_code_usage_bestelling');
    if (heeftKolom('ticket_orders', 'discount_amount')) {
      db.exec('ALTER TABLE ticket_orders DROP COLUMN discount_amount');
    }
    if (heeftKolom('ticket_orders', 'discount_code_id')) {
      db.exec('ALTER TABLE ticket_orders DROP COLUMN discount_code_id');
    }
  });

  logger.info('Migration rolled back: kortingscode_bij_bestelling');
}
