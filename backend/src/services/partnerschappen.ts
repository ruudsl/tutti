/**
 * Wat een partnerschap tussen twee verenigingen daadwerkelijk oplevert.
 *
 * De tabel association_partnerships bestaat sinds de multi-vereniging-migratie,
 * met share_music, share_events en share_members erop. Buiten de routes die het
 * partnerschap zelf beheren werd die tabel nergens gelezen: een goedgekeurd
 * partnerschap veranderde niets, en de drie vlaggen hadden geen betekenis.
 *
 * Deze module maakt van een actief partnerschap een echte toegang. De regels
 * die overal gelden:
 *
 * - Alleen een partnerschap met status 'active' telt. Een aanvraag die nog
 *   openstaat of is afgewezen geeft niets.
 * - Het partnerschap is wederzijds. Wie de aanvraag deed doet er niet toe.
 * - Delen is altijd alleen lezen, en altijd alleen wat de eigenaar zelf heeft
 *   aangemerkt. Bij muziek is dat is_shared op de titel; dat vlaggetje bestond
 *   al en had tot nu toe geen enkele werking.
 * - Wat intern heet blijft intern: internal_notes bij een titel en de notities
 *   bij een concert gaan niet mee.
 */

import db from '../database/connection';

export interface PartnerVereniging {
  id: string;
  name: string;
  displayName: string | null;
}

type DeelSoort = 'share_music' | 'share_events' | 'share_members';

/**
 * De verenigingen waarmee een actief partnerschap bestaat dat deze soort
 * gegevens deelt.
 */
export function haalPartners(associationId: string, soort: DeelSoort): PartnerVereniging[] {
  return db
    .prepare(
      `
      SELECT a.id, a.name, a.display_name AS displayName
      FROM association_partnerships ap
      JOIN associations a
        ON a.id = CASE WHEN ap.association_a_id = ? THEN ap.association_b_id ELSE ap.association_a_id END
      WHERE (ap.association_a_id = ? OR ap.association_b_id = ?)
        AND ap.status = 'active'
        AND ap.${soort} = 1
        AND COALESCE(a.is_active, 1) = 1
      ORDER BY a.name
    `,
    )
    .all(associationId, associationId, associationId) as PartnerVereniging[];
}

/** Deelt deze vereniging deze soort gegevens met die andere? */
export function deeltMet(associationId: string, partnerId: string, soort: DeelSoort): boolean {
  return haalPartners(associationId, soort).some((p) => p.id === partnerId);
}

export interface GedeeldeTitel {
  id: string;
  title: string;
  composer: string | null;
  arranger: string | null;
  durationSeconds: number | null;
  grade: string | null;
  youtubeUrl: string | null;
  associationId: string;
  associationName: string;
}

/**
 * De muziektitels die partners hebben opengesteld.
 *
 * Alleen titels met is_shared = 1, en zonder internal_notes: die staan er
 * juist om binnen de eigen vereniging te blijven. De bladmuziek zelf wordt
 * niet gedeeld - dit is de catalogus, niet het archief.
 */
export function haalGedeeldeMuziek(associationId: string): GedeeldeTitel[] {
  const partners = haalPartners(associationId, 'share_music');
  if (partners.length === 0) return [];

  const plaatshouders = partners.map(() => '?').join(', ');
  return db
    .prepare(
      `
      SELECT mt.id, mt.title, mt.composer, mt.arranger,
             mt.duration_seconds AS durationSeconds, mt.grade,
             mt.youtube_url AS youtubeUrl,
             mt.association_id AS associationId,
             COALESCE(a.display_name, a.name) AS associationName
      FROM music_titles mt
      JOIN associations a ON a.id = mt.association_id
      WHERE mt.association_id IN (${plaatshouders})
        AND mt.is_shared = 1
        AND mt.deleted_at IS NULL
      ORDER BY a.name, mt.title
    `,
    )
    .all(...partners.map((p) => p.id)) as GedeeldeTitel[];
}

export interface GedeeldConcert {
  id: string;
  name: string;
  date: string;
  endDate: string | null;
  location: string | null;
  concertType: string | null;
  description: string | null;
  associationId: string;
  associationName: string;
}

/**
 * De aankomende concerten van partners.
 *
 * Alleen wat nog komt: een agenda van een ander is bedoeld om er rekening mee
 * te houden, niet om terug te kijken. De interne notities blijven achter.
 */
export function haalGedeeldeConcerten(associationId: string): GedeeldConcert[] {
  const partners = haalPartners(associationId, 'share_events');
  if (partners.length === 0) return [];

  const plaatshouders = partners.map(() => '?').join(', ');
  return db
    .prepare(
      `
      SELECT c.id, c.name, c.date, c.end_date AS endDate, c.location,
             c.concert_type AS concertType, c.description,
             c.association_id AS associationId,
             COALESCE(a.display_name, a.name) AS associationName
      FROM concerts c
      JOIN associations a ON a.id = c.association_id
      WHERE c.association_id IN (${plaatshouders})
        AND c.deleted_at IS NULL
        AND date(c.date) >= date('now')
      ORDER BY c.date
    `,
    )
    .all(...partners.map((p) => p.id)) as GedeeldConcert[];
}
