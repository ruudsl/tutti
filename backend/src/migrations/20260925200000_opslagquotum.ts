/**
 * Migration: opslagquotum
 * Created at: 2026-09-25
 *
 * Een grens aan de opslag per vereniging (services/abonnementLimieten.ts). Het
 * gebruik wordt live opgeteld uit de grootte die bij elk opgeslagen bestand
 * staat. Voor audio-opnames, wiki-bijlagen en mailbijlagen stond die er al;
 * voor bladmuziek en mp3's niet. Deze migratie:
 *
 * 1. voegt `music_pieces.file_size` en `music_titles.mp3_file_size` toe en
 *    vult ze voor bestaande rijen met de grootte van het bestand op schijf. Een
 *    bestand dat er niet (meer) is, laat de grootte leeg: dat telt als nul en
 *    houdt de migratie niet tegen;
 * 2. voegt `associations.opslag_limiet_bytes` toe: de grens die een
 *    super-admin per vereniging kan zetten, los van het abonnement. Leeg
 *    betekent "volgens het abonnement".
 *
 * Waarom niet max_storage_mb: die kolom staat sinds de multi-vereniging-migratie
 * op elke vereniging met standaard 5000, en werd nergens gehandhaafd. Aan de
 * waarde is niet te zien of een super-admin hem bewust koos of dat het de
 * standaard is, en elke nieuwe vereniging krijgt hem opnieuw. Hem nu gaan
 * handhaven zou elke bestaande installatie ongevraagd op 5 GB per vereniging
 * zetten. De kolom blijft staan zoals hij is.
 *
 * `down` haalt de drie kolommen weer weg.
 */

import fs from 'fs';
import path from 'path';
import db from '../database/connection';
import logger from '../utils/logger';
import { withTransaction } from '../utils/database';

// Dezelfde mappen als routes/music-pieces.ts.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../uploads/mp3');

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[];
  return kolommen.some((k) => k.name === kolom);
}

/** De grootte van een opgeslagen bestand, of `null` als het er niet is. */
function grootteOpSchijf(map: string, naam: string): number | null {
  // Een opgeslagen naam is een bestandsnaam, geen pad; wat daar niet aan
  // voldoet wordt niet opgezocht.
  if (!naam || naam !== path.basename(naam)) return null;
  try {
    const stat = fs.statSync(path.join(map, naam));
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

function vulGroottes(tabel: string, padKolom: string, grootteKolom: string, map: string): void {
  const rijen = db
    .prepare(`SELECT id, ${padKolom} AS pad FROM ${tabel} WHERE ${padKolom} IS NOT NULL AND ${grootteKolom} IS NULL`)
    .all() as { id: string; pad: string }[];
  const zet = db.prepare(`UPDATE ${tabel} SET ${grootteKolom} = ? WHERE id = ?`);

  let gevuld = 0;
  for (const rij of rijen) {
    const grootte = grootteOpSchijf(map, rij.pad);
    if (grootte === null) continue;
    zet.run(grootte, rij.id);
    gevuld++;
  }
  logger.info(
    `Migration opslagquotum: ${tabel}.${grootteKolom} gevuld voor ${gevuld} van ${rijen.length} rijen (${rijen.length - gevuld} bestanden niet op schijf)`,
  );
}

export function up(): void {
  logger.info('Running migration: opslagquotum (up)');

  withTransaction(() => {
    if (!heeftKolom('music_pieces', 'file_size')) {
      db.exec('ALTER TABLE music_pieces ADD COLUMN file_size INTEGER');
    }
    if (!heeftKolom('music_titles', 'mp3_file_size')) {
      db.exec('ALTER TABLE music_titles ADD COLUMN mp3_file_size INTEGER');
    }
    if (!heeftKolom('associations', 'opslag_limiet_bytes')) {
      db.exec('ALTER TABLE associations ADD COLUMN opslag_limiet_bytes INTEGER');
    }

    vulGroottes('music_pieces', 'file_path', 'file_size', UPLOAD_DIR);
    vulGroottes('music_titles', 'mp3_file_path', 'mp3_file_size', MP3_UPLOAD_DIR);
  });

  logger.info('Migration completed: opslagquotum');
}

export function down(): void {
  logger.info('Running migration: opslagquotum (down)');

  withTransaction(() => {
    if (heeftKolom('associations', 'opslag_limiet_bytes')) {
      db.exec('ALTER TABLE associations DROP COLUMN opslag_limiet_bytes');
    }
    if (heeftKolom('music_titles', 'mp3_file_size')) {
      db.exec('ALTER TABLE music_titles DROP COLUMN mp3_file_size');
    }
    if (heeftKolom('music_pieces', 'file_size')) {
      db.exec('ALTER TABLE music_pieces DROP COLUMN file_size');
    }
  });

  logger.info('Migration rolled back: opslagquotum');
}
