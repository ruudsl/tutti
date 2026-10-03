/**
 * Concertkleding inlezen uit een spreadsheet: de tenues die een vereniging bij
 * een concert voorschrijft (tabel outfits, module inventaris, pagina
 * Concertkleding). Zie index.ts en docs/IMPORTEREN.md.
 *
 * Een tenue bestaat al als de vereniging er een met dezelfde naam heeft.
 * Met `bijwerken` krijgt het een andere omschrijving, kleur of andere
 * onderdelen uit het bestand. Of het het standaardtenue is, verandert de
 * import bij een bestaand tenue niet: dat is één keuze voor de hele
 * vereniging, en die hoort op de pagina zelf.
 *
 * De kleur is op de pagina een kleurkiezer en staat in de tabel als
 * kleurcode (#1b2a49). Uit een spreadsheet komt ook een kleurcode, of een
 * gewone kleurnaam; een kleur die geen van beide is, gaat mee in de
 * omschrijving, zodat hij niet verloren gaat.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import {
  bepaalWijzigingen,
  herkenKolommen,
  lees,
  lijst,
  maakKeuze,
  normaliseer,
  tel,
  werkBij,
  type Beoordeling,
  type Bijwerkbaar,
  type Bijwerking,
  type ImportOpties,
  type ImportUitkomst,
  type RegelStatus,
  type Veld,
  type Voorbeeld,
  type Wijziging,
} from './gemeenschappelijk';

const KLEDINGVELDEN: Record<string, Veld> = {
  naam: {
    verplicht: true,
    namen: [
      'Naam',
      'Tenue',
      'Kleding',
      'Concertkleding',
      'Name',
      'Outfit',
      'Dress code',
      'Kleidung',
      'Konzertkleidung',
    ],
  },
  omschrijving: { namen: ['Omschrijving', 'Beschrijving', 'Description', 'Beschreibung'] },
  kleur: { namen: ['Kleur', 'Kleurcode', 'Color', 'Colour', 'Farbe', 'Farbcode'] },
  onderdelen: {
    namen: ['Onderdelen', 'Kledingstukken', 'Stukken', 'Items', 'Pieces', 'Teile', 'Bestandteile', 'Kleidungsstücke'],
  },
  standaard: { namen: ['Standaard', 'Standaardtenue', 'Default', 'Standard'] },
};

/** Dezelfde grenzen als bij aanmaken op de pagina (routes/outfits.ts). */
const MAX_NAAM = 100;
const MAX_OMSCHRIJVING = 500;
const MAX_ONDERDEEL = 100;
const MAX_ONDERDELEN = 30;

const janee = maakKeuze<'ja' | 'nee'>({
  ja: ['j', 'yes', 'y', 'true', '1', 'x', 'wel'],
  nee: ['n', 'no', 'false', '0', 'niet', 'nein'],
});

/** Gangbare kleuren van concertkleding, in drie talen. */
const KLEURNAMEN: [string, string[]][] = [
  ['#000000', ['zwart', 'black', 'schwarz']],
  ['#ffffff', ['wit', 'white', 'weiß', 'weiss']],
  ['#1b2a49', ['donkerblauw', 'marineblauw', 'navy', 'dark blue', 'dunkelblau', 'marineblau']],
  ['#1f4e9c', ['blauw', 'blue', 'blau', 'koningsblauw', 'royal blue', 'königsblau']],
  ['#c0392b', ['rood', 'red', 'rot']],
  ['#7b1e2b', ['bordeaux', 'bordeauxrood', 'wijnrood', 'burgundy', 'weinrot']],
  ['#2e7d32', ['groen', 'green', 'grün']],
  ['#808080', ['grijs', 'grey', 'gray', 'grau']],
  ['#383e42', ['antraciet', 'anthracite', 'anthrazit']],
  ['#c9a227', ['goud', 'gold']],
  ['#c0c0c0', ['zilver', 'silver', 'silber']],
  ['#f1c40f', ['geel', 'yellow', 'gelb']],
  ['#e67e22', ['oranje', 'orange']],
  ['#7d3c98', ['paars', 'purple', 'lila', 'violet', 'violett']],
  ['#6d4c41', ['bruin', 'brown', 'braun']],
  ['#d8c3a5', ['beige']],
];

const kleurcodes = new Map<string, string>(
  KLEURNAMEN.flatMap(([code, namen]) => namen.map((naam) => [normaliseer(naam), code] as [string, string])),
);

/** Een kleurcode (#1b2a49, 1B2A49, #fff) of een kleurnaam; anders `undefined`. */
export function leesKleur(tekst: string): string | undefined {
  const code = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(tekst.trim());
  if (code) {
    const hex = code[1].toLowerCase();
    // De kleurkiezer in de browser kent alleen de vorm met zes tekens.
    return `#${hex.length === 3 ? [...hex].map((teken) => teken + teken).join('') : hex}`;
  }
  return kleurcodes.get(normaliseer(tekst));
}

export interface KledingGegevens {
  naam: string;
  omschrijving: string | null;
  /** Als kleurcode, zoals de pagina hem opslaat. */
  kleur: string | null;
  onderdelen: string[];
  standaard: boolean;
}

function beoordeelKledingIntern(associationId: string, csv: string, opties: ImportOpties) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, KLEDINGVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const bestaand = new Map<string, Record<string, unknown>>();
  for (const rij of db
    .prepare(
      `SELECT id, name, description, color_code, items FROM outfits
       WHERE association_id = ? AND deleted_at IS NULL`,
    )
    .all(associationId) as Record<string, unknown>[]) {
    bestaand.set(String(rij.name).toLowerCase(), rij);
  }

  const gezien = new Set<string>();
  const bijwerkingen: Bijwerking[] = [];
  let standaardGekozen = false;

  const regels: Beoordeling<KledingGegevens>[] = rijen.map((rij, i) => {
    const fouten: string[] = [];
    const waarschuwingen: string[] = [];

    let naam = cel(rij, 'naam');
    if (!naam) fouten.push('Naam ontbreekt.');
    else if (naam.length > MAX_NAAM) {
      waarschuwingen.push(`De naam is langer dan ${MAX_NAAM} tekens en wordt ingekort.`);
      naam = naam.slice(0, MAX_NAAM);
    }

    let omschrijving = cel(rij, 'omschrijving') || null;

    const kleurTekst = cel(rij, 'kleur');
    let kleur: string | null = null;
    if (kleurTekst) {
      kleur = leesKleur(kleurTekst) ?? null;
      if (!kleur) {
        waarschuwingen.push(`Kleur "${kleurTekst}" is geen kleurcode of bekende kleur; hij gaat in de omschrijving.`);
        omschrijving = [omschrijving, `Kleur: ${kleurTekst.slice(0, MAX_ONDERDEEL)}`].filter(Boolean).join(' - ');
      }
    }
    if (omschrijving && omschrijving.length > MAX_OMSCHRIJVING) {
      waarschuwingen.push(`De omschrijving is langer dan ${MAX_OMSCHRIJVING} tekens en wordt ingekort.`);
      omschrijving = omschrijving.slice(0, MAX_OMSCHRIJVING);
    }

    let onderdelen = lijst(cel(rij, 'onderdelen')).map((deel) => deel.slice(0, MAX_ONDERDEEL));
    if (onderdelen.length > MAX_ONDERDELEN) {
      waarschuwingen.push(`Meer dan ${MAX_ONDERDELEN} onderdelen; alleen de eerste ${MAX_ONDERDELEN} gaan mee.`);
      onderdelen = onderdelen.slice(0, MAX_ONDERDELEN);
    }

    const standaardTekst = cel(rij, 'standaard');
    let standaard = false;
    if (standaardTekst) {
      const gelezen = janee(standaardTekst);
      if (gelezen) standaard = gelezen === 'ja';
      else waarschuwingen.push(`Standaard "${standaardTekst}" is geen ja of nee; het wordt nee.`);
    }

    let status: RegelStatus = 'nieuw';
    const sleutel = naam.toLowerCase();
    let gevonden: Record<string, unknown> | undefined;
    if (naam && gezien.has(sleutel)) fouten.push('Een tenue met deze naam staat eerder in het bestand.');
    else if (naam) gevonden = bestaand.get(sleutel);
    if (gevonden) status = 'bestaat';
    if (naam) gezien.add(sleutel);
    if (fouten.length > 0) status = 'fout';

    // Eén standaardtenue per vereniging: de eerste nieuwe regel die het vraagt.
    if (standaard && status === 'nieuw') {
      if (standaardGekozen) {
        waarschuwingen.push('Een eerdere regel is al het standaardtenue; deze wordt het niet.');
        standaard = false;
      }
      standaardGekozen ||= standaard;
    } else if (standaard && status === 'bestaat') {
      waarschuwingen.push('Het standaardtenue kies je op de pagina Concertkleding; de import verandert het niet.');
      standaard = false;
    }

    const gegevens: KledingGegevens = { naam, omschrijving, kleur, onderdelen, standaard };

    let wijzigingen: Wijziging[] | undefined;
    if (status === 'bestaat' && gevonden && opties.bijwerken) {
      const velden: Bijwerkbaar[] = [
        { veld: 'omschrijving', kolom: 'description', waarde: omschrijving },
        { veld: 'kleur', kolom: 'color_code', waarde: kleur },
        { veld: 'onderdelen', kolom: 'items', waarde: onderdelen.length > 0 ? JSON.stringify(onderdelen) : null },
      ];
      const bepaald = bepaalWijzigingen(String(gevonden.id), gevonden, velden);
      if (bepaald.wijzigingen.length > 0) {
        status = 'bijwerken';
        // De onderdelen staan als JSON in de tabel; in het voorbeeld als lijst.
        wijzigingen = bepaald.wijzigingen.map((w) =>
          w.veld === 'onderdelen' ? { ...w, oud: alsLijst(w.oud), nieuw: alsLijst(w.nieuw) } : w,
        );
        bijwerkingen.push(bepaald.bijwerking);
      }
    }

    return { rij: i + 2, status, gegevens, fouten, waarschuwingen, ...(wijzigingen && { wijzigingen }) };
  });

  return { kolommen, genegeerd, regels, bijwerkingen };
}

/** Een JSON-lijst uit de kolom items als leesbare tekst. */
function alsLijst(waarde: Wijziging['oud']): Wijziging['oud'] {
  if (typeof waarde !== 'string') return waarde;
  try {
    const lijstWaarde = JSON.parse(waarde);
    return Array.isArray(lijstWaarde) ? lijstWaarde.join(', ') : waarde;
  } catch {
    return waarde;
  }
}

export function beoordeelKleding(
  associationId: string,
  csv: string,
  opties: ImportOpties = {},
): Voorbeeld<KledingGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelKledingIntern(associationId, csv, opties);
  return { kolommen, genegeerd, regels, tellingen: tel(regels) };
}

export function importeerKleding(
  associationId: string,
  gebruikerId: string,
  csv: string,
  opties: ImportOpties = {},
): ImportUitkomst<KledingGegevens> {
  const { kolommen, genegeerd, regels, bijwerkingen } = beoordeelKledingIntern(associationId, csv, opties);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');
  const volgorde = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS hoogste FROM outfits WHERE association_id = ? AND deleted_at IS NULL',
    )
    .get(associationId) as { hoogste: number };
  let bijgewerkt = 0;

  withTransaction(() => {
    bijgewerkt = werkBij('outfits', associationId, bijwerkingen);
    if (nieuw.some(({ gegevens }) => gegevens.standaard)) {
      db.prepare('UPDATE outfits SET is_default = 0 WHERE association_id = ?').run(associationId);
    }
    const invoegen = db.prepare(
      `INSERT INTO outfits (id, association_id, name, description, color_code, items, is_default, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    nieuw.forEach(({ gegevens: g }, i) => {
      invoegen.run(
        uuidv4(),
        associationId,
        g.naam,
        g.omschrijving,
        g.kleur,
        g.onderdelen.length > 0 ? JSON.stringify(g.onderdelen) : null,
        g.standaard ? 1 : 0,
        volgorde.hoogste + i + 1,
        gebruikerId,
      );
    });
  });

  return { kolommen, genegeerd, regels, tellingen: tel(regels), geimporteerd: nieuw.length, bijgewerkt };
}
