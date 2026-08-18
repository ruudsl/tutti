/**
 * Migration: External Musicians Network
 * Created at: 2026-06-04
 *
 * Creates tables for managing external musicians (alumni, guests, substitutes)
 * and replacement requests for events when the orchestra is understaffed.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // External musicians (gastmuzikanten, alumni, invallers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS external_musicians (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      musician_type TEXT NOT NULL CHECK (musician_type IN ('alumni', 'guest', 'substitute', 'friend')),
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
      last_played_date TEXT,
      total_performances INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Indexes for external musicians
  db.exec('CREATE INDEX IF NOT EXISTS idx_external_musicians_association ON external_musicians(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_external_musicians_type ON external_musicians(musician_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_external_musicians_active ON external_musicians(is_active)');

  // External musician instruments (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS external_musician_instruments (
      id TEXT PRIMARY KEY,
      external_musician_id TEXT NOT NULL,
      instrument_id TEXT NOT NULL,
      skill_level TEXT CHECK (skill_level IS NULL OR skill_level IN ('beginner', 'intermediate', 'advanced', 'professional')),
      is_primary INTEGER DEFAULT 0,
      FOREIGN KEY (external_musician_id) REFERENCES external_musicians(id) ON DELETE CASCADE,
      FOREIGN KEY (instrument_id) REFERENCES instruments(id)
    )
  `);

  // Indexes for external musician instruments
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_external_musician_instruments_musician ON external_musician_instruments(external_musician_id)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_external_musician_instruments_instrument ON external_musician_instruments(instrument_id)',
  );

  // Replacement requests (when orchestra needs substitutes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS replacement_requests (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('concert', 'rehearsal')),
      event_id TEXT NOT NULL,
      event_date TEXT NOT NULL,
      instrument_id TEXT NOT NULL,
      positions_needed INTEGER DEFAULT 1,
      positions_filled INTEGER DEFAULT 0,
      urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
      notes TEXT,
      deadline TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id),
      FOREIGN KEY (instrument_id) REFERENCES instruments(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Indexes for replacement requests
  db.exec('CREATE INDEX IF NOT EXISTS idx_replacement_requests_association ON replacement_requests(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_replacement_requests_status ON replacement_requests(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_replacement_requests_event ON replacement_requests(event_type, event_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_replacement_requests_date ON replacement_requests(event_date)');

  // Replacement assignments (which external musician fills which request)
  db.exec(`
    CREATE TABLE IF NOT EXISTS replacement_assignments (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      external_musician_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'completed', 'no_show')),
      invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      fee_amount REAL,
      notes TEXT,
      FOREIGN KEY (request_id) REFERENCES replacement_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (external_musician_id) REFERENCES external_musicians(id)
    )
  `);

  // Indexes for replacement assignments
  db.exec('CREATE INDEX IF NOT EXISTS idx_replacement_assignments_request ON replacement_assignments(request_id)');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_replacement_assignments_musician ON replacement_assignments(external_musician_id)',
  );
  db.exec('CREATE INDEX IF NOT EXISTS idx_replacement_assignments_status ON replacement_assignments(status)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  // Drop indexes first
  db.exec('DROP INDEX IF EXISTS idx_replacement_assignments_status');
  db.exec('DROP INDEX IF EXISTS idx_replacement_assignments_musician');
  db.exec('DROP INDEX IF EXISTS idx_replacement_assignments_request');
  db.exec('DROP INDEX IF EXISTS idx_replacement_requests_date');
  db.exec('DROP INDEX IF EXISTS idx_replacement_requests_event');
  db.exec('DROP INDEX IF EXISTS idx_replacement_requests_status');
  db.exec('DROP INDEX IF EXISTS idx_replacement_requests_association');
  db.exec('DROP INDEX IF EXISTS idx_external_musician_instruments_instrument');
  db.exec('DROP INDEX IF EXISTS idx_external_musician_instruments_musician');
  db.exec('DROP INDEX IF EXISTS idx_external_musicians_active');
  db.exec('DROP INDEX IF EXISTS idx_external_musicians_type');
  db.exec('DROP INDEX IF EXISTS idx_external_musicians_association');

  // Drop tables
  db.exec('DROP TABLE IF EXISTS replacement_assignments');
  db.exec('DROP TABLE IF EXISTS replacement_requests');
  db.exec('DROP TABLE IF EXISTS external_musician_instruments');
  db.exec('DROP TABLE IF EXISTS external_musicians');
}
