/**
 * Migration: audit_logs krijgt een vereniging
 * Created at: 2026-08-20
 *
 * GET /audit-logs staat op requireRole('admin') - de beheerder van een
 * vereniging - en filterde nergens op vereniging. Het woord association_id
 * kwam in dat hele routebestand niet voor. Elke beheerder zag daarmee het
 * logboek van de hele installatie: wie wat wanneer deed bij welke andere
 * vereniging, met naam van het object, ip-adres en browser erbij.
 *
 * De tabel kon dat ook niet: er stond alleen user_id op. Die kolom komt er nu
 * bij, met de vereniging van het lid dat de handeling deed. Een aparte kolom
 * en niet een join op users, om twee redenen: een lid kan van vereniging
 * wisselen, en dan zou zijn oude logboek meeverhuizen naar de nieuwe - terwijl
 * die handelingen bij de oude vereniging horen. En de foreign key op user_id
 * ruimt bij het hard verwijderen van een lid zijn logregels op; een logboek
 * hoort niet af te hangen van of de dader er nog is.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export function up(): void {
  const kolommen = db.prepare('PRAGMA table_info(audit_logs)').all() as { name: string }[];
  if (kolommen.some((k) => k.name === 'association_id')) {
    logger.info('audit_logs heeft al een association_id');
    return;
  }

  db.exec('ALTER TABLE audit_logs ADD COLUMN association_id TEXT');

  // Bestaande regels: de vereniging van het lid dat de handeling deed. Dat is
  // de beste toeschrijving die achteraf te maken is.
  const resultaat = db
    .prepare(
      `UPDATE audit_logs
       SET association_id = (SELECT u.association_id FROM users u WHERE u.id = audit_logs.user_id)
       WHERE association_id IS NULL`,
    )
    .run();

  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_association ON audit_logs(association_id, created_at)');

  logger.info(`audit_logs: vereniging ingevuld voor ${resultaat.changes} regel(s)`);
}

export function down(): void {
  // De kolom laten staan. Hem weghalen vraagt om het herbouwen van de tabel,
  // en dat is voor een logboek een groter risico dan een ongebruikte kolom.
  db.exec('DROP INDEX IF EXISTS idx_audit_logs_association');
}
