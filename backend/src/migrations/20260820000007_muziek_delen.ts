/**
 * Migration: muziek delen tussen verenigingen
 * Created at: 2026-08-20
 *
 * Tot nu toe was delen een enkel vlaggetje: `is_shared` op een titel, en een
 * partnerschap met `share_music`. Wie het aanzette deelde daarmee met al zijn
 * partners tegelijk, en er was geen manier om te zien wat er waar terecht was
 * gekomen.
 *
 * Deze migratie legt zes tabellen aan die daar regels aan hangen.
 *
 * **Koppelen gaat via een code.** Er is bewust geen lijst van verenigingen op
 * het platform. Een vereniging maakt een code aan, geeft die buiten Tutti om
 * door - telefoon, mail, op een dirigentenoverleg - en de ander voert hem in.
 * Zo weet je altijd met wie je gekoppeld bent, want je hebt die ander zelf
 * gesproken.
 *
 * **Delen gaat per titel, met uitzonderingen.** Een titel wordt opengezet voor
 * een of meer gekoppelde verenigingen. Losse partijen kunnen daarvan worden
 * uitgesloten; een dirigentenpartituur is het voorbeeld waar het om begonnen
 * is. Een uitsluiting geldt voor alle partners tegelijk: "deze partij deel ik
 * niet" is een eigenschap van de partij, niet van de relatie.
 *
 * **Een bestand komt er niet vanzelf uit.** Wat een partner ziet is de
 * catalogus: titel, componist, arrangeur, duur, graad, en welke partijen er
 * zijn. Voor een concreet bestand dient hij een verzoek in, en de eigenaar
 * beslist per keer. Elke beslissing blijft staan, ook een afwijzing, zodat
 * achteraf na te gaan is wat er is vrijgegeven en door wie.
 *
 * **Oproepen.** Een vereniging die een stuk zoekt plaatst een oproep, met een
 * link of een YouTube-filmpje erbij. Gekoppelde verenigingen zien hem en de
 * muziekcommissie kan antwoorden.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export function up(): void {
  // Koppelcodes. Een code is eenmalig: zodra hij is ingewisseld staat er wie
  // hem gebruikt heeft en wanneer, en daarna doet hij niets meer.
  db.exec(`
    CREATE TABLE IF NOT EXISTS association_link_codes (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      used_by_association_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (used_by_association_id) REFERENCES associations(id) ON DELETE SET NULL
    )
  `);

  // Met welke vereniging is deze titel gedeeld. Geen rij betekent: met niemand.
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_title_shares (
      id TEXT PRIMARY KEY,
      music_title_id TEXT NOT NULL,
      partner_association_id TEXT NOT NULL,
      shared_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (music_title_id, partner_association_id),
      FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
      FOREIGN KEY (partner_association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Partijen die nooit meegaan, ongeacht met wie de titel gedeeld is.
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_share_exclusions (
      id TEXT PRIMARY KEY,
      music_piece_id TEXT NOT NULL UNIQUE,
      reason TEXT,
      excluded_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
      FOREIGN KEY (excluded_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Verzoeken om een concreet bestand.
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_file_requests (
      id TEXT PRIMARY KEY,
      music_piece_id TEXT NOT NULL,
      owner_association_id TEXT NOT NULL,
      requesting_association_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
      decided_by TEXT,
      decided_at DATETIME,
      decision_note TEXT,
      access_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (requesting_association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Oproepen: een vereniging zoekt een stuk.
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_wanted_posts (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      title TEXT NOT NULL,
      composer TEXT,
      arranger TEXT,
      description TEXT,
      reference_url TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'closed')),
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Antwoorden op een oproep. music_title_id is optioneel: "wij hebben dit
  // liggen" is sterker dan alleen een tekst, maar niet elk antwoord wijst een
  // titel aan.
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_wanted_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      association_id TEXT NOT NULL,
      music_title_id TEXT,
      body TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES music_wanted_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_link_codes_code ON association_link_codes(code);
    CREATE INDEX IF NOT EXISTS idx_title_shares_title ON music_title_shares(music_title_id);
    CREATE INDEX IF NOT EXISTS idx_title_shares_partner ON music_title_shares(partner_association_id);
    CREATE INDEX IF NOT EXISTS idx_file_requests_owner ON music_file_requests(owner_association_id, status);
    CREATE INDEX IF NOT EXISTS idx_file_requests_vrager ON music_file_requests(requesting_association_id, status);
    CREATE INDEX IF NOT EXISTS idx_wanted_posts_status ON music_wanted_posts(status);
    CREATE INDEX IF NOT EXISTS idx_wanted_replies_post ON music_wanted_replies(post_id);
  `);

  // is_shared op een titel betekende "mag gedeeld worden met andere
  // verenigingen", maar zonder te zeggen met welke. Wie dat vlaggetje aan had
  // staan en een partnerschap met share_music had, deelde in de praktijk met
  // al zijn partners. Dat blijft zo: voor elke combinatie van zo'n titel en
  // zo'n partner komt er een rij, zodat er niets stilletjes dichtgaat en
  // iedereen daarna per titel kan bijsturen.
  const bestaande = db
    .prepare(
      `
      SELECT mt.id AS titel_id,
             CASE WHEN ap.association_a_id = mt.association_id
                  THEN ap.association_b_id ELSE ap.association_a_id END AS partner_id,
             mt.association_id AS eigenaar_id
      FROM music_titles mt
      JOIN association_partnerships ap
        ON (ap.association_a_id = mt.association_id OR ap.association_b_id = mt.association_id)
      WHERE mt.is_shared = 1
        AND mt.deleted_at IS NULL
        AND ap.status = 'active'
        AND ap.share_music = 1
    `,
    )
    .all() as { titel_id: string; partner_id: string; eigenaar_id: string }[];

  if (bestaande.length > 0) {
    // shared_by is NOT NULL en er is geen lid dat deze keuze heeft gemaakt -
    // hij volgt uit het oude vlaggetje. De beheerder van de eigenaar is de
    // eerlijkste toeschrijving die hier te maken is.
    const beheerderVan = db.prepare(
      `SELECT id FROM users WHERE association_id = ? AND role = 'admin' AND deleted_at IS NULL
       ORDER BY created_at LIMIT 1`,
    );
    const invoegen = db.prepare(
      `INSERT OR IGNORE INTO music_title_shares (id, music_title_id, partner_association_id, shared_by)
       VALUES (?, ?, ?, ?)`,
    );

    let overgezet = 0;
    for (const rij of bestaande) {
      const beheerder = beheerderVan.get(rij.eigenaar_id) as { id: string } | undefined;
      if (!beheerder) continue;
      invoegen.run(`${rij.titel_id}:${rij.partner_id}`, rij.titel_id, rij.partner_id, beheerder.id);
      overgezet++;
    }
    logger.info(`Muziek delen: ${overgezet} bestaande deling(en) overgezet naar music_title_shares`);
  }
}

export function down(): void {
  db.exec(`
    DROP TABLE IF EXISTS music_wanted_replies;
    DROP TABLE IF EXISTS music_wanted_posts;
    DROP TABLE IF EXISTS music_file_requests;
    DROP TABLE IF EXISTS music_share_exclusions;
    DROP TABLE IF EXISTS music_title_shares;
    DROP TABLE IF EXISTS association_link_codes;
  `);
}
