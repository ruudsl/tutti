/**
 * Migration: elke vereniging krijgt een slug
 * Created at: 2026-08-20
 *
 * De kolom slug staat sinds de multi-vereniging-migratie op associations, maar
 * werd alleen gevuld als een super-admin de vereniging via het beheerscherm
 * aanmaakte. De vereniging die bij de eerste start ontstaat heeft er geen, en
 * elke installatie van voor die migratie ook niet.
 *
 * Het inlogscherm gebruikt de slug nu: /login/<slug> toont de naam en het logo
 * van die vereniging. Zonder slug is er geen link om te delen, dus vullen we
 * hem hier alsnog, afgeleid van de naam en op dezelfde manier als het
 * beheerscherm dat doet.
 *
 * Botsingen krijgen een volgnummer. Namen zijn uniek, maar twee verschillende
 * namen kunnen dezelfde slug opleveren ("Harmonie St. Cecilia" en
 * "Harmonie St Cecilia") en de kolom hoort uniek te blijven binnen deze
 * toepassing.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function maakSlug(naam: string): string {
  return naam
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

export function up(): void {
  const zonderSlug = db
    .prepare(`SELECT id, name FROM associations WHERE slug IS NULL OR TRIM(slug) = '' ORDER BY created_at, rowid`)
    .all() as { id: string; name: string }[];

  if (zonderSlug.length === 0) return;

  const bezet = new Set(
    (
      db.prepare(`SELECT slug FROM associations WHERE slug IS NOT NULL AND TRIM(slug) != ''`).all() as {
        slug: string;
      }[]
    ).map((r) => r.slug),
  );

  const bijwerken = db.prepare('UPDATE associations SET slug = ? WHERE id = ?');

  for (const vereniging of zonderSlug) {
    const basis = maakSlug(vereniging.name) || 'vereniging';
    let slug = basis;
    let volgnummer = 2;
    while (bezet.has(slug)) {
      slug = `${basis}-${volgnummer}`;
      volgnummer++;
    }
    bezet.add(slug);
    bijwerken.run(slug, vereniging.id);
  }

  logger.info(`Slug ingevuld voor ${zonderSlug.length} vereniging(en)`);
}

export function down(): void {
  // Een slug weghalen zou de inloglinks van verenigingen breken die hem al
  // gebruiken, en we weten hier niet welke slug voor deze migratie bestond.
  // Terugdraaien laat de kolom daarom staan.
}
