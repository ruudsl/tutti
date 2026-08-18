/**
 * Migration: vier tabellen/kolommen waar de code op rekent maar die nooit
 * zijn aangemaakt.
 *
 * Alle vier kwamen uit de schema-audit (scripts/audit-schema-usage.py):
 *
 * 1. transactions.is_posted / posted_at — boekhouding. "Geboekt" (definitief,
 *    niet meer bewerkbaar) is een ander begrip dan "afgeletterd" tegen een
 *    bankregel; de code gebruikt beide, het schema kende alleen is_reconciled.
 * 2. email_campaign_attachments — bijlagen bij een mailing; tabel ontbrak
 *    volledig, waardoor uploaden en versturen met bijlage een 500 gaf.
 * 3. email_campaign_recipients.created_at — geschreven bij elke INSERT.
 * 4. equipment_damage_reports — schaderapportages op equipment_items; tabel
 *    ontbrak volledig.
 * 5. equipment_item_loans — routes/equipment.ts schreef naar equipment_loans,
 *    maar die naam was al bezet door de oudere instrumenten-tabel met een
 *    heel andere kolomindeling. Beide stonden als CREATE TABLE IF NOT EXISTS
 *    in schema.ts, dus de eerste won en de tweede werd stil genegeerd.
 *
 * Verse installaties krijgen alles via schema.ts; deze migratie brengt
 * bestaande databases bij.
 */

import db from '../database/connection';
import logger from '../utils/logger';

/** Voeg een kolom alleen toe wanneer die nog niet bestaat. */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.length === 0) {
    return; // tabel bestaat niet in deze database
  }
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.info(`Added column ${table}.${column}`);
  }
}

export const up = (): void => {
  logger.info('Running migration: schema_mismatches (up)');

  // 1. Boekhouding: geboekt-status
  addColumnIfMissing('transactions', 'is_posted', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('transactions', 'posted_at', 'DATETIME');

  // 2. Mailing: bijlagen
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_campaign_attachments (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        uploaded_by TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_email_attachments_campaign ON email_campaign_attachments(campaign_id)');

  // 3. Mailing: ontvangers
  addColumnIfMissing('email_campaign_recipients', 'created_at', 'DATETIME');

  // 4. Inventaris: bruikleen op equipment_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_item_loans (
        id TEXT PRIMARY KEY,
        equipment_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        checkout_date DATETIME NOT NULL,
        expected_return_date DATETIME,
        actual_return_date DATETIME,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned', 'overdue', 'lost')),
        condition_at_checkout TEXT,
        condition_at_return TEXT,
        checkout_notes TEXT,
        return_notes TEXT,
        related_concert_id TEXT,
        related_rehearsal_id TEXT,
        related_project_id TEXT,
        created_by TEXT NOT NULL,
        returned_to TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (equipment_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (returned_to) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_equipment ON equipment_item_loans(equipment_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_user ON equipment_item_loans(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_status ON equipment_item_loans(status)');

  // 5. Inventaris: schaderapportages
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_damage_reports (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        reported_by TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe', 'unusable')),
        photos TEXT,
        repair_cost REAL,
        repaired_at DATETIME,
        repaired_by TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (repaired_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_damage_reports_item ON equipment_damage_reports(item_id)');

  // 6. Annotaties: het vrije-vorm tekenpad (annotations.ts POST /drawings)
  addColumnIfMissing('pdf_annotations', 'data', 'TEXT');
  addColumnIfMissing('pdf_annotations', 'stroke_width', 'REAL');
  addColumnIfMissing('pdf_annotations', 'opacity', 'REAL');
  addColumnIfMissing('pdf_annotations', 'is_shared', 'INTEGER DEFAULT 0');

  // 7. IMSLP-import schrijft updated_at mee
  addColumnIfMissing('music_titles', 'updated_at', 'DATETIME');

  // 8. Seizoenen: migratie 20260604000003 maakte een smallere variant dan
  //    routes/seasons.ts verwacht. Sjabloon, begroting en geplande datum
  //    ontbraken, waardoor seizoen aanmaken en events toevoegen faalden.
  addColumnIfMissing('season_templates', 'default_rehearsal_day', 'INTEGER');
  addColumnIfMissing('season_templates', 'default_rehearsal_time', 'TEXT');
  addColumnIfMissing('season_templates', 'default_rehearsal_duration', 'INTEGER');
  addColumnIfMissing('season_templates', 'default_rehearsal_location', 'TEXT');
  addColumnIfMissing('season_templates', 'typical_concerts_count', 'INTEGER');
  addColumnIfMissing('seasons', 'template_id', 'TEXT');
  addColumnIfMissing('seasons', 'budget_total', 'REAL');
  addColumnIfMissing('seasons', 'budget_allocated', 'REAL DEFAULT 0');
  addColumnIfMissing('season_events', 'planned_date', 'TEXT');
  addColumnIfMissing('season_events', 'budget_amount', 'REAL');

  // 9. Tabellen die routes/gdpr.ts en routes/search.ts tot nu toe zelf
  //    aanmaakten bij elk verzoek. Dat werkte, maar zette DDL in een
  //    request-pad en hield ze buiten schema.ts en de migraties.
  db.exec(`
    CREATE TABLE IF NOT EXISTS deletion_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        processed_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS data_retention_settings (
        id TEXT PRIMARY KEY,
        association_id TEXT NOT NULL,
        data_type TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        auto_delete INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(association_id, data_type)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_recent_searches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_recent_searches_user ON user_recent_searches(user_id)');

  logger.info('Migration completed: schema_mismatches');
};

export const down = (): void => {
  logger.info('Running migration: schema_mismatches (down)');

  // Alleen de nieuwe tabellen gaan terug; de toegevoegde kolommen zijn
  // nullable of hebben een default, en SQLite kan kolommen niet betrouwbaar
  // droppen in alle ondersteunde versies.
  db.exec('DROP TABLE IF EXISTS equipment_damage_reports');
  db.exec('DROP TABLE IF EXISTS equipment_item_loans');
  db.exec('DROP TABLE IF EXISTS email_campaign_attachments');

  logger.info('Rollback completed: schema_mismatches');
};
