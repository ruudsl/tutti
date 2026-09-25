/**
 * Een versleutelde reservekopie van de database weer leesbaar maken.
 *
 * De automatische back-up (scheduler/backup.ts), de kopie van vóór een
 * terugzetting en de download uit het beheerscherm (routes/backup.ts, een
 * `.zip.enc`) worden versleuteld zodra ENCRYPTION_SECRET is ingesteld. Om er
 * een buiten de applicatie te gebruiken, maak je hem eerst leesbaar - met
 * dezelfde ENCRYPTION_SECRET (en ENCRYPTION_SALT, als die is ingesteld) als de
 * server die hem schreef:
 *
 *   npm run backup:ontsleutel --workspace=backend -- <bestand.sqlite.enc> [doel.sqlite]
 *   npm run backup:ontsleutel --workspace=backend -- <harmonie-backup-….zip.enc> [doel.zip]
 *
 * Een `.zip.enc` kan ook zonder ontsleutelen terug via het beheerscherm, op
 * een installatie met dezelfde sleutel.
 *
 * In een productie-image zonder tsx: `node dist/scripts/ontsleutel-backup.js`.
 *
 * Zonder doel komt het resultaat naast het bronbestand, zonder `.enc`. Het
 * resultaat is alleen leesbaar voor wie het aanmaakt (0600). Zie
 * docs/BACKUP_RESTORE.md voor de rest van het terugzetten.
 */

import 'dotenv/config';
import fs from 'fs';
import { ontsleutelBuffer } from '../utils/encryption';
import { schrijfPriveBestand } from '../utils/priveBestand';

/** Ontsleutel `bron` naar `doel` en geef het pad van het resultaat terug. */
export function ontsleutelBackupbestand(bron: string, doel?: string): string {
  const uit = doel ?? bron.replace(/\.enc$/, '');
  if (uit === bron) {
    throw new Error('Geef een doelbestand op: de bron eindigt niet op .enc.');
  }
  if (fs.existsSync(uit)) {
    throw new Error(`${uit} bestaat al; kies een ander doel.`);
  }
  schrijfPriveBestand(uit, ontsleutelBuffer(fs.readFileSync(bron)));
  return uit;
}

if (require.main === module) {
  const [bron, doel] = process.argv.slice(2);
  if (!bron) {
    console.error(
      'Gebruik: npm run backup:ontsleutel --workspace=backend -- <bestand.sqlite.enc|bestand.zip.enc> [doel]',
    );
    process.exit(1);
  }
  try {
    console.log(`Ontsleuteld: ${ontsleutelBackupbestand(bron, doel)}`);
  } catch (fout) {
    console.error(`Ontsleutelen mislukt: ${(fout as Error).message}`);
    console.error('Klopt ENCRYPTION_SECRET (en ENCRYPTION_SALT) met die van de server die de kopie maakte?');
    process.exit(1);
  }
}
