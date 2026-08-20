/**
 * Migration: facturen voor kaartbestellingen echt bewaren
 * Created at: 2026-08-20
 *
 * services/invoices bewaarde facturen in een Map in het geheugen, met de
 * opmerking dat het in productie naar de database moest. Bij elke herstart was
 * alles weg — op een omgeving die bij inactiviteit afschakelt dus regelmatig.
 * Een factuur is een bewaarplichtig document.
 *
 * De tabellen ticket_invoices en invoice_line_items bestaan al sinds
 * 20260329000001, maar de service gebruikte ze nooit. Ze missen een aantal
 * gegevens die de service wel bijhoudt; die komen er hier bij. De bestaande
 * kolommen blijven zoals ze zijn, inclusief vat_rate als percentage.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>;
  return kolommen.some((k) => k.name === kolom);
}

const NIEUWE_KOLOMMEN: Array<[string, string, string]> = [
  ['ticket_invoices', 'association_id', 'TEXT'],
  ['ticket_invoices', 'concert_id', 'TEXT'],
  ['ticket_invoices', 'concert_name', 'TEXT'],
  ['ticket_invoices', 'buyer_name', 'TEXT'],
  ['ticket_invoices', 'buyer_email', 'TEXT'],
  ['ticket_invoices', 'service_fee_vat', 'REAL DEFAULT 0'],
  ['ticket_invoices', 'issued_at', 'TEXT'],
  ['ticket_invoices', 'due_date', 'TEXT'],
  ['ticket_invoices', 'status', "TEXT DEFAULT 'issued'"],
  ['ticket_invoices', 'updated_at', 'TEXT'],
  // Het btw-bedrag per regel wordt bewaard en niet afgeleid: het is per regel
  // op centen afgerond, zodat netto en btw precies optellen tot het bruto.
  ['invoice_line_items', 'vat_amount', 'REAL DEFAULT 0'],
];

export const up = (): void => {
  logger.info('Running migration: ticket_invoices (up)');

  for (const [tabel, kolom, type] of NIEUWE_KOLOMMEN) {
    if (!heeftKolom(tabel, kolom)) {
      db.exec(`ALTER TABLE ${tabel} ADD COLUMN ${kolom} ${type}`);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ticket_invoices_association ON ticket_invoices(association_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_invoices_buyer ON ticket_invoices(buyer_email);
  `);

  logger.info('Migration completed: ticket_invoices');
};

export const down = (): void => {
  logger.info('Running migration: ticket_invoices (down)');

  db.exec('DROP INDEX IF EXISTS idx_ticket_invoices_association');
  db.exec('DROP INDEX IF EXISTS idx_ticket_invoices_buyer');

  // SQLite kan pas sinds 3.35 kolommen laten vallen; laten staan is hier
  // onschadelijk, want zonder de code eromheen wordt er niets gelezen.
  logger.info('Rollback completed: ticket_invoices (kolommen blijven staan)');
};
