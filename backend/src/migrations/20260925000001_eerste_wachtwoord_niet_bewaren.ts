/**
 * Migration: eerste wachtwoord niet bewaren
 * Created at: 2026-09-25
 *
 * Bij het aanmelden van een nieuw lid (POST /onboarding/member) ging het
 * tijdelijke wachtwoord leesbaar mee in `onboarding_tasks.metadata`, als
 * `{"tempPassword": "..."}` bij de taak `harmonie_create`. Elke beheerder van
 * de vereniging kon het daar later nog opvragen (GET /onboarding/tasks/:id),
 * en het stond in elke reservekopie - ook als het lid het nooit had gewijzigd
 * en het dus nog steeds zijn wachtwoord was.
 *
 * Deze migratie:
 *
 * 1. voegt `users.moet_wachtwoord_wijzigen` toe. De route zet die bij een
 *    nieuw lid op 1; het wijzigen of herstellen van het wachtwoord zet hem
 *    weer op 0, en tot dan stuurt de frontend het lid naar het scherm om zijn
 *    wachtwoord te wijzigen;
 * 2. haalt `tempPassword` uit alle bestaande metadata. De rest van de
 *    metadata blijft staan;
 * 3. zet de vlag voor leden wier tijdelijke wachtwoord zo bewaard stond en
 *    die sindsdien hun wachtwoord niet hebben gewijzigd. Dat wachtwoord was
 *    leesbaar voor anderen, en het is nog in gebruik.
 *
 * `down` haalt de kolom weer weg. De gewiste wachtwoorden komen niet terug:
 * die bewaren was het probleem, en ze staan nergens anders.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[];
  return kolommen.some((k) => k.name === kolom);
}

export function up(): void {
  logger.info('Running migration: eerste_wachtwoord_niet_bewaren (up)');

  if (!heeftKolom('users', 'moet_wachtwoord_wijzigen')) {
    db.exec('ALTER TABLE users ADD COLUMN moet_wachtwoord_wijzigen INTEGER NOT NULL DEFAULT 0');
  }

  const rijen = db
    .prepare(`SELECT id, user_id, metadata FROM onboarding_tasks WHERE metadata LIKE '%tempPassword%'`)
    .all() as { id: string; user_id: string; metadata: string }[];

  const zetMetadata = db.prepare('UPDATE onboarding_tasks SET metadata = ? WHERE id = ?');
  const zetVlag = db.prepare(
    'UPDATE users SET moet_wachtwoord_wijzigen = 1 WHERE id = ? AND password_changed_at IS NULL AND deleted_at IS NULL',
  );

  let gewist = 0;
  let gemarkeerd = 0;
  for (const rij of rijen) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(rij.metadata);
    } catch {
      // Niet te lezen, maar het woord staat erin: dan de hele metadata weg,
      // liever dan een wachtwoord laten staan.
      zetMetadata.run(null, rij.id);
      gewist++;
      gemarkeerd += zetVlag.run(rij.user_id).changes;
      continue;
    }

    if (!metadata || typeof metadata !== 'object' || !('tempPassword' in metadata)) continue;

    const rest = { ...(metadata as Record<string, unknown>) };
    delete rest.tempPassword;
    zetMetadata.run(Object.keys(rest).length > 0 ? JSON.stringify(rest) : null, rij.id);
    gewist++;
    gemarkeerd += zetVlag.run(rij.user_id).changes;
  }

  logger.info(
    `Migration completed: eerste_wachtwoord_niet_bewaren - ${gewist} van ${rijen.length} bewaarde tijdelijke wachtwoorden gewist, ${gemarkeerd} leden moeten hun wachtwoord wijzigen`,
  );
}

export function down(): void {
  logger.info('Running migration: eerste_wachtwoord_niet_bewaren (down)');
  if (heeftKolom('users', 'moet_wachtwoord_wijzigen')) {
    db.exec('ALTER TABLE users DROP COLUMN moet_wachtwoord_wijzigen');
  }
  logger.info('Rollback completed: eerste_wachtwoord_niet_bewaren (gewiste wachtwoorden komen niet terug)');
}
