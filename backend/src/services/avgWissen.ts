/**
 * Wat er bij het wissen van een lid (AVG artikel 17) buiten de gewone
 * DELETE-lijst in routes/gdpr.ts nog moet gebeuren.
 *
 * Die lijst haalde rijen weg, maar liet drie dingen staan:
 *
 * - de profielfoto op schijf. De database bewaart alleen het pad; het bestand
 *   bleef staan, ook nadat de rij van het lid al lang weg was;
 * - de koppeling met Google Agenda. Het token stond nog in
 *   user_calendar_settings, en bij Google bleef de toestemming gewoon geldig;
 * - het auditlogboek, waar naam en e-mailadres van het lid in de
 *   omschrijving en in de wijzigingen staan.
 *
 * Het auditlogboek wordt niet gewist maar gepseudonimiseerd: dat er iets met
 * een account is gebeurd, door wie en wanneer, blijft voor de vereniging
 * aantoonbaar. Wie het was, staat er niet meer in.
 */

import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import config from '../config';
import logger from '../utils/logger';
import { bestandInMap } from '../utils/bestandInMap';
import { trekGoogleToestemmingIn } from './calendarSync';

/** Waar profielfoto's staan; zie saveProfilePhoto in onboarding.ts en entra-sync.ts. */
export function profielfotoMap(): string {
  return path.resolve(config.uploadDir, 'profile-photos');
}

/**
 * Verwijder een profielfoto van schijf. Alleen binnen de map met
 * profielfoto's, op bestandsnaam: het opgeslagen pad is absoluut en komt uit
 * de database, en wat daar staat mag nooit bepalen welk bestand elders op de
 * schijf verdwijnt.
 *
 * @returns true als er een bestand is verwijderd.
 */
export function verwijderProfielfoto(opgeslagenPad: string | null | undefined): boolean {
  if (!opgeslagenPad) return false;
  try {
    const pad = bestandInMap(profielfotoMap(), opgeslagenPad);
    if (!fs.existsSync(pad)) return false;
    fs.unlinkSync(pad);
    return true;
  } catch (fout) {
    logger.warn('Profielfoto kon niet worden verwijderd', { error: (fout as Error).message });
    return false;
  }
}

function escapeVoorRegex(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Vervang naam en e-mailadressen van een lid in het auditlogboek door een
 * pseudoniem: overal waar het lid de handelende persoon is, en overal waar
 * het lid het onderwerp is (entity_type 'user').
 *
 * Een user-id is een uuid en dus uniek over de installatie; de filter op
 * vereniging staat er om binnen de eigen vereniging te blijven. Rijen van
 * vóór de kolom association_id (NULL) horen er wel bij: die zijn aan het id
 * van dit lid te herkennen.
 *
 * @returns het aantal aangepaste rijen.
 */
export function pseudonimiseerAuditlog(
  userId: string,
  associationId: string | null,
  lid: { naam: string | null; emails: (string | null | undefined)[] },
): number {
  const pseudoniemNaam = 'Deleted User';
  const pseudoniemEmail = `deleted_${userId}@deleted.local`;

  const vervangingen: [RegExp, string][] = [];
  for (const email of lid.emails) {
    if (email && email.trim()) vervangingen.push([new RegExp(escapeVoorRegex(email.trim()), 'gi'), pseudoniemEmail]);
  }
  if (lid.naam && lid.naam.trim()) {
    vervangingen.push([new RegExp(escapeVoorRegex(lid.naam.trim()), 'gi'), pseudoniemNaam]);
  }
  if (vervangingen.length === 0) return 0;

  const rijen = db
    .prepare(
      `SELECT id, entity_name, changes FROM audit_logs
       WHERE (association_id = ? OR association_id IS NULL)
         AND ((entity_type = 'user' AND entity_id = ?) OR user_id = ?)`,
    )
    .all(associationId, userId, userId) as { id: string; entity_name: string | null; changes: string | null }[];

  const pas = (tekst: string | null): string | null => {
    if (tekst === null) return null;
    let uit = tekst;
    for (const [patroon, vervanging] of vervangingen) uit = uit.replace(patroon, vervanging);
    return uit;
  };

  const werkBij = db.prepare('UPDATE audit_logs SET entity_name = ?, changes = ? WHERE id = ?');
  let aangepast = 0;
  for (const rij of rijen) {
    const naam = pas(rij.entity_name);
    const wijzigingen = pas(rij.changes);
    if (naam !== rij.entity_name || wijzigingen !== rij.changes) {
      werkBij.run(naam, wijzigingen, rij.id);
      aangepast++;
    }
  }
  return aangepast;
}

/**
 * Trek de toestemming voor Google Agenda in bij Google zelf.
 *
 * Het token uit de database weggooien is niet genoeg: bij Google blijft de
 * toestemming bestaan, en wie het token ooit heeft gezien (een reservekopie)
 * kan er nog mee in de agenda van het lid. Een mislukking houdt het wissen niet
 * tegen - de gegevens bij ons zijn dan al weg - maar komt wel in het logboek,
 * zodat een beheerder het lid kan vragen de toegang zelf in te trekken.
 *
 * @returns true als Google het intrekken bevestigde.
 */
export async function trekGoogleKoppelingIn(userId: string, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await trekGoogleToestemmingIn(token);
    logger.info('Google Agenda-toestemming ingetrokken bij het wissen van een lid', { userId });
    return true;
  } catch (fout) {
    logger.warn('Google Agenda-toestemming kon niet worden ingetrokken; vraag het lid dat zelf te doen', {
      userId,
      error: (fout as Error).message,
    });
    return false;
  }
}
