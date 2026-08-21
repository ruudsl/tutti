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
  const concertColumns = db.prepare('PRAGMA table_info(concerts)').all() as { name: string }[];
  const existingColumns = concertColumns.map((row) => row.name);

  if (!existingColumns.includes('accessibility_contact_email')) {
    db.exec('ALTER TABLE concerts ADD COLUMN accessibility_contact_email TEXT');
  }

  if (!existingColumns.includes('accessibility_contact_phone')) {
    db.exec('ALTER TABLE concerts ADD COLUMN accessibility_contact_phone TEXT');
  }

  // Hier stond een lus die elke gebruiker met role = 'admin' in super_admins
  // zette. Dat haalde precies de grens weg die deze tabel moet trekken:
  // requireRole('admin') is de beheerder van een vereniging, requireSuperAdmin
  // gaat over de hele installatie. Met die seed kon elke verenigingsbeheerder
  // de gegevens van alle andere verenigingen inzien en wijzigen.
  //
  // Een super-admin ontstaat op drie manieren, en alle drie zijn ze expliciet:
  // de eerste beheerder bij init.ts, MAKE_SUPER_ADMIN in de omgeving, en
  // POST /multi-association/super-admin/super-admins. Rijen die hier al zijn
  // aangemaakt worden opgeruimd door 20260821000001_super_admins_opschonen.
}

export function down(): void {
  // SQLite doesn't support DROP COLUMN easily, so we leave the columns
  // They don't cause any harm if unused
}
