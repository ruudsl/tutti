/**
 * Een kopie van de gegevens van één vereniging, voor haar eigen beheerder
 * (GET /api/backup/vereniging). Besluit oktober 2026: alleen downloaden;
 * terugzetten blijft bij de superbeheerder, met de reservekopie van de hele
 * installatie (routes/backup.ts).
 *
 * Het archief bevat per tabel een JSON-bestand met de rijen van deze
 * vereniging, de geüploade bestanden die bij die rijen horen, een manifest en
 * een leesmij. Wat er níét in komt, is net zo belangrijk:
 *
 * - **Geen rij van een andere vereniging.** Welke rijen bij de vereniging
 *   horen, volgt uit de database zelf: een tabel met `association_id` filtert
 *   daarop; een tabel zonder volgt zijn foreign keys tot een tabel die er een
 *   heeft (`rehearsal_attendance` → `rehearsals`). Een tabel waarvoor geen weg
 *   te vinden is, gaat niet mee en staat in het manifest. Een nieuwe tabel kan
 *   dus niet ongemerkt alles van iedereen meenemen.
 * - **Geen geheimen.** Wachtwoorden, tokens, sleutels en codes waarmee je
 *   ergens binnenkomt, gaan eruit (kolommen) of blijven helemaal weg
 *   (tabellen als sessies en herstelcodes).
 * - **Geen bestanden van een ander.** Een bestand gaat alleen mee als een rij
 *   van de vereniging ernaar wijst, en alleen uit de map waar het hoort; er
 *   wordt nooit een map doorlopen.
 */

import fs from 'fs';
import path from 'path';
import db from '../database/connection';
import config from '../config';

/** Tabellen die nooit meegaan: van het platform, of alleen geheimen. */
const NOOIT = new Set([
  'migrations',
  'sqlite_sequence',
  'super_admins',
  'inlogvertragingen',
  'blocked_ips',
  'checkout_rate_limits',
  'payment_webhooks',
  'vocabulary_cache',
  'ip_whitelist',
  'achtergrondtaken',
  'user_sessions',
  'password_reset_tokens',
  'oauth_states',
  'mfa_recovery_codes',
  'telegram_link_codes',
  'whatsapp_verifications',
  'push_subscriptions',
  'association_link_codes',
  'scanner_sync_tokens',
]);

/**
 * Kolommen die nooit meegaan. Op naam, zodat een nieuw geheim met een
 * gangbare naam er vanzelf onder valt.
 */
const GEHEIME_KOLOM =
  /(pass(word)?|secret|token|api_?key|_hash$|auth_key|p256dh|qr_code|qr_secret|transfer_code|webhook_url|microsoft_id|^mfa_)/i;

/** Gedeelde catalogi: een verwijzing ernaar zegt niet bij wie een rij hoort. */
const CATALOGUS = new Set(['instruments', 'genres']);

/**
 * Tabellen die alleen via een lid bij de vereniging horen, en die toch mee
 * mogen. Een lid kan bij meer verenigingen horen; zijn meldingen, activiteit
 * of zoekgeschiedenis kunnen dan over een andere vereniging gaan. Wat hier
 * staat, gaat over het lid zelf: welk instrument, wanneer afwezig, welke
 * toestemming.
 */
const VIA_LEDEN_TOEGESTAAN = new Set([
  'user_instruments',
  'member_availability',
  'privacy_consents',
  'user_privacy_settings',
]);

/**
 * Waar de foreign keys een verkeerde eigenaar zouden kiezen: bij een gedeelde
 * of geïmporteerde titel is de vereniging van de titel de eigenaar, niet de
 * partner.
 */
const EIGENAAR_VIA: Record<string, string> = {
  music_title_shares: 'music_title_id',
  imported_titles: 'title_id',
};

interface Kolom {
  name: string;
  notnull: number;
}
interface Verwijzing {
  table: string;
  from: string;
  to: string | null;
}

const kolomInfo = (tabel: string): Kolom[] => db.prepare(`PRAGMA table_info("${tabel}")`).all() as Kolom[];
const kolommen = (tabel: string): string[] => kolomInfo(tabel).map((k) => k.name);

const verwijzingen = (tabel: string): Verwijzing[] =>
  db.prepare(`PRAGMA foreign_key_list("${tabel}")`).all() as Verwijzing[];

/** De voorwaarde voor één tabel, met `?` voor het id van de vereniging. */
type Voorwaarde = string;

interface Pad {
  voorwaarde: Voorwaarde;
  /** De weg loopt via een lid (users), niet via iets van de vereniging zelf. */
  viaLeden: boolean;
}

/**
 * Hoe de rijen van `tabel` bij de vereniging horen, of `null` als daar geen
 * weg voor is. Volgt foreign keys tot een tabel met `association_id`, in deze
 * volgorde: verplichte verwijzingen voor optionele (een optionele verwijzing
 * zou de rijen zonder die verwijzing missen), iets van de vereniging voor een
 * lid, en de catalogi (alleen de eigen items) als laatste.
 */
function padVoor(tabel: string, bezocht: Set<string> = new Set()): Pad | null {
  if (tabel === 'associations') return { voorwaarde: 'id = ?', viaLeden: false };
  if (tabel === 'users') {
    // Ook wie via een tweede lidmaatschap bij de vereniging hoort.
    return {
      voorwaarde: 'association_id = ? OR id IN (SELECT user_id FROM user_associations WHERE association_id = ?)',
      viaLeden: true,
    };
  }
  if (kolommen(tabel).includes('association_id')) return { voorwaarde: 'association_id = ?', viaLeden: false };

  const alle = verwijzingen(tabel);

  // Een kolom met een andere naam die naar de vereniging wijst
  // (association_a_id, owner_association_id, ...): een van die is genoeg.
  const naarVereniging = alle.filter((v) => v.table === 'associations');
  if (naarVereniging.length > 0 && !EIGENAAR_VIA[tabel]) {
    return { voorwaarde: naarVereniging.map((v) => `"${v.from}" = ?`).join(' OR '), viaLeden: false };
  }

  if (bezocht.has(tabel) || bezocht.size > 6) return null;
  const verder = new Set(bezocht).add(tabel);

  const verplicht = new Set(
    kolomInfo(tabel)
      .filter((k) => Number(k.notnull) === 1)
      .map((k) => k.name),
  );
  const rang = (v: Verwijzing) =>
    (CATALOGUS.has(v.table) ? 4 : 0) + (v.table === 'users' ? 1 : 0) + (verplicht.has(v.from) ? 0 : 2);
  const kandidaten = alle
    .filter((v) => v.table !== tabel && v.table !== 'associations' && !NOOIT.has(v.table))
    .filter((v) => !EIGENAAR_VIA[tabel] || v.from === EIGENAAR_VIA[tabel])
    .sort((a, b) => rang(a) - rang(b));

  for (const v of kandidaten) {
    const ouder = padVoor(v.table, verder);
    if (ouder) {
      return {
        voorwaarde: `"${v.from}" IN (SELECT "${v.to ?? 'id'}" FROM "${v.table}" WHERE ${ouder.voorwaarde})`,
        viaLeden: ouder.viaLeden,
      };
    }
  }
  return null;
}

export interface ExportPlan {
  tabellen: { tabel: string; voorwaarde: Voorwaarde }[];
  overgeslagen: string[];
}

/** Welke tabellen meegaan en hoe ze gefilterd worden; de rest, overgeslagen. */
export function maakExportPlan(): ExportPlan {
  const alle = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  ).map((r) => r.name);

  const plan: ExportPlan = { tabellen: [], overgeslagen: [] };
  for (const tabel of alle) {
    if (NOOIT.has(tabel) || tabel.startsWith('sqlite_')) {
      plan.overgeslagen.push(tabel);
      continue;
    }
    const pad = padVoor(tabel);
    if (pad && (!pad.viaLeden || tabel === 'users' || VIA_LEDEN_TOEGESTAAN.has(tabel))) {
      plan.tabellen.push({ tabel, voorwaarde: pad.voorwaarde });
    } else {
      plan.overgeslagen.push(tabel);
    }
  }
  return plan;
}

/** De rijen van één tabel voor deze vereniging, zonder geheime kolommen. */
export function rijenVoor(tabel: string, voorwaarde: Voorwaarde, associationId: string): Record<string, unknown>[] {
  const veilig = kolommen(tabel).filter((k) => !GEHEIME_KOLOM.test(k));
  if (veilig.length === 0) return [];
  const aantal = (voorwaarde.match(/\?/g) ?? []).length;
  const lijst = veilig.map((k) => `"${k}"`).join(', ');
  return db
    .prepare(`SELECT ${lijst} FROM "${tabel}" WHERE ${voorwaarde}`)
    .all(...Array(aantal).fill(associationId)) as Record<string, unknown>[];
}

// Dezelfde mappen als de routes die de bestanden opslaan.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'); // routes/music-pieces.ts
const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../uploads/mp3');
const OPNAMES = path.join(process.cwd(), 'uploads', 'recordings'); // routes/audio-recordings.ts
const WIKI = path.join(process.cwd(), 'uploads', 'wiki'); // routes/wiki.ts
const MAILBIJLAGEN = path.join(process.cwd(), 'uploads', 'email-attachments'); // routes/email-campaigns.ts
const LOGOS = path.resolve(config.uploadDir, 'logos'); // routes/settings.ts
const PROFIELFOTOS = path.resolve(config.uploadDir, 'profile-photos'); // routes/users.ts

/** Een bestand in de archiefmap `archiefmap`, gelezen uit `map`. */
export interface ExportBestand {
  bron: string;
  naam: string;
}

/** Het pad van `opgeslagen` in `map`, als het daar ligt en bestaat. */
function inMap(map: string, opgeslagen: string | null | undefined): string | null {
  if (!opgeslagen) return null;
  const basis = path.resolve(map);
  const pad = path.resolve(basis, path.basename(opgeslagen));
  if (!pad.startsWith(basis + path.sep)) return null;
  try {
    return fs.statSync(pad).isFile() ? pad : null;
  } catch {
    return null;
  }
}

/**
 * De bestanden van de vereniging: alleen wat een rij van haar noemt, alleen
 * uit de map waar dat soort bestand hoort.
 */
export function bestandenVoor(associationId: string): ExportBestand[] {
  const bronnen: { map: string; archief: string; sql: string; params: number }[] = [
    {
      map: UPLOAD_DIR,
      archief: 'bladmuziek',
      sql: 'SELECT file_path AS pad FROM music_pieces WHERE association_id = ?',
      params: 1,
    },
    {
      map: MP3_UPLOAD_DIR,
      archief: 'mp3',
      sql: 'SELECT mp3_file_path AS pad FROM music_titles WHERE association_id = ?',
      params: 1,
    },
    {
      map: OPNAMES,
      archief: 'opnames',
      sql: 'SELECT file_path AS pad FROM audio_recordings WHERE association_id = ?',
      params: 1,
    },
    {
      map: WIKI,
      archief: 'wiki',
      sql: `SELECT a.file_path AS pad FROM wiki_attachments a
            JOIN wiki_pages p ON p.id = a.page_id WHERE p.association_id = ?`,
      params: 1,
    },
    {
      map: MAILBIJLAGEN,
      archief: 'mailbijlagen',
      sql: `SELECT a.filename AS pad FROM email_campaign_attachments a
            JOIN email_campaigns c ON c.id = a.campaign_id WHERE c.association_id = ?`,
      params: 1,
    },
    { map: LOGOS, archief: 'logo', sql: 'SELECT logo_path AS pad FROM associations WHERE id = ?', params: 1 },
    {
      map: PROFIELFOTOS,
      archief: 'profielfotos',
      sql: `SELECT profile_photo_path AS pad FROM users
            WHERE association_id = ? OR id IN (SELECT user_id FROM user_associations WHERE association_id = ?)`,
      params: 2,
    },
  ];

  const gezien = new Set<string>();
  const uit: ExportBestand[] = [];
  for (const bron of bronnen) {
    let rijen: { pad: string | null }[];
    try {
      rijen = db.prepare(bron.sql).all(...Array(bron.params).fill(associationId)) as { pad: string | null }[];
    } catch {
      // Een tabel of kolom die op deze installatie (nog) niet bestaat.
      continue;
    }
    for (const { pad } of rijen) {
      const bestand = inMap(bron.map, pad);
      if (!bestand || gezien.has(bestand)) continue;
      gezien.add(bestand);
      uit.push({ bron: bestand, naam: `bestanden/${bron.archief}/${path.basename(bestand)}` });
    }
  }
  return uit;
}

export const LEESMIJ = `Gegevens van de vereniging, uit Tutti
=====================================

Dit archief bevat de gegevens van één vereniging, zoals ze op het moment van
downloaden in Tutti stonden.

- gegevens/<tabel>.json  de rijen van de vereniging, per tabel
- bestanden/             bladmuziek, mp3's, opnames, wiki- en mailbijlagen,
                         het logo en profielfoto's
- manifest.json          wanneer, welke vereniging, hoeveel rijen per tabel,
                         en welke tabellen niet zijn meegenomen

Niet meegenomen: wachtwoorden, tokens, sleutels en andere geheimen, en
tabellen van het platform zelf (zoals sessies). Dit archief is een kopie om
te bewaren of om gegevens over te zetten; terugzetten in Tutti gaat via de
beheerder van de installatie.

Bewaar het archief zorgvuldig: het bevat persoonsgegevens van leden.
`;
