/**
 * Instrumenten in bezit van de vereniging inlezen uit een spreadsheet
 * (tabel instrument_assets, module inventaris). Zie index.ts en
 * docs/IMPORTEREN.md.
 *
 * Een instrument bestaat al als de vereniging een instrument heeft met
 * hetzelfde serienummer. Zonder serienummer is de naam de sleutel
 * ("Trompet 3"): een vereniging nummert haar instrumenten zo meestal zelf.
 *
 * Met `bijwerken` krijgt een bestaand instrument wat in het bestand anders is;
 * zie `bepaalWijzigingen` in gemeenschappelijk.ts.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import {
  bepaalWijzigingen,
  herkenKolommen,
  lees,
  leesBedrag,
  leesDatum,
  maakKeuze,
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

const INSTRUMENTVELDEN: Record<string, Veld> = {
  naam: { verplicht: true, namen: ['Naam', 'Name', 'Omschrijving', 'Bezeichnung', 'Instrumentnaam'] },
  soort: { verplicht: true, namen: ['Soort', 'Instrument', 'Type', 'Instrumenttype', 'Art', 'Instrumentart'] },
  categorie: { namen: ['Categorie', 'Category', 'Kategorie', 'Groep', 'Gruppe'] },
  merk: { namen: ['Merk', 'Brand', 'Make', 'Marke', 'Hersteller', 'Fabrikant'] },
  model: { namen: ['Model', 'Modell'] },
  serienummer: { namen: ['Serienummer', 'Serial number', 'Serial', 'Seriennummer', 'Nummer'] },
  bouwjaar: { namen: ['Bouwjaar', 'Jaar', 'Year', 'Baujahr'] },
  aankoopdatum: { namen: ['Aankoopdatum', 'Gekocht op', 'Purchase date', 'Kaufdatum'] },
  aankoopprijs: { namen: ['Aankoopprijs', 'Prijs', 'Purchase price', 'Price', 'Kaufpreis', 'Preis'] },
  waarde: { namen: ['Waarde', 'Huidige waarde', 'Current value', 'Value', 'Wert', 'Zeitwert'] },
  status: { namen: ['Status', 'Beschikbaarheid', 'Verfügbarkeit'] },
  staat: { namen: ['Staat', 'Conditie', 'Condition', 'Zustand'] },
  locatie: { namen: ['Locatie', 'Opslag', 'Location', 'Standort', 'Lagerort'] },
  opmerkingen: { namen: ['Opmerkingen', 'Opmerking', 'Notities', 'Notes', 'Bemerkungen', 'Notizen'] },
};

type Categorie = 'woodwind' | 'brass' | 'percussion' | 'strings' | 'keyboard' | 'accessories' | 'other';
type Status = 'available' | 'on_loan' | 'in_repair' | 'in_storage' | 'written_off' | 'sold' | 'lost';
type Staat = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | 'needs_repair';

const categorie = maakKeuze<Categorie>({
  woodwind: ['houtblazers', 'hout', 'woodwinds', 'holzbläser', 'holz'],
  brass: ['koperblazers', 'koper', 'blech', 'blechbläser'],
  percussion: ['slagwerk', 'slagwerk en percussie', 'percussie', 'schlagwerk', 'schlagzeug'],
  strings: ['strijkers', 'snaren', 'streicher'],
  keyboard: ['toetsen', 'toetsinstrumenten', 'keyboards', 'tasteninstrumente'],
  accessories: ['accessoires', 'toebehoren', 'zubehör'],
  other: ['overig', 'anders', 'sonstiges'],
});

const status = maakKeuze<Status>({
  available: ['beschikbaar', 'vrij', 'verfügbar'],
  on_loan: ['uitgeleend', 'in bruikleen', 'on loan', 'loaned', 'verliehen', 'ausgeliehen'],
  in_repair: ['in reparatie', 'reparatie', 'in repair', 'in reparatur'],
  in_storage: ['opgeslagen', 'opslag', 'in storage', 'eingelagert', 'im lager'],
  written_off: ['afgeschreven', 'written off', 'abgeschrieben'],
  sold: ['verkocht', 'verkauft'],
  lost: ['kwijt', 'vermist', 'verloren', 'vermisst'],
});

const staat = maakKeuze<Staat>({
  excellent: ['uitstekend', 'zeer goed', 'hervorragend', 'sehr gut'],
  good: ['goed', 'gut'],
  fair: ['redelijk', 'matig', 'befriedigend', 'mittel'],
  poor: ['slecht', 'schlecht'],
  damaged: ['beschadigd', 'kapot', 'beschädigt'],
  needs_repair: ['reparatie nodig', 'moet gerepareerd', 'needs repair', 'reparaturbedürftig'],
});

export interface InstrumentGegevens {
  naam: string;
  soort: string;
  categorie: Categorie;
  merk: string | null;
  model: string | null;
  serienummer: string | null;
  bouwjaar: number | null;
  aankoopdatum: string | null;
  aankoopprijs: number | null;
  waarde: number | null;
  status: Status;
  staat: Staat;
  locatie: string | null;
  opmerkingen: string | null;
}

/** Tekstvelden langer dan dit worden afgekapt met een waarschuwing, behalve opmerkingen. */
const MAX_TEKST = 255;

/** Per veld de kolom in instrument_assets, voor het bijwerken. */
const KOLOM: Record<string, string> = {
  naam: 'name',
  soort: 'instrument_type',
  categorie: 'category',
  merk: 'brand',
  model: 'model',
  bouwjaar: 'year_manufactured',
  aankoopdatum: 'purchase_date',
  aankoopprijs: 'purchase_price',
  waarde: 'current_value',
  status: 'status',
  staat: 'condition',
  locatie: 'location',
  opmerkingen: 'notes',
};

function beoordeelInstrumentenIntern(associationId: string, csv: string, opties: ImportOpties = {}) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, INSTRUMENTVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const bestaand = db
    .prepare('SELECT * FROM instrument_assets WHERE association_id = ? AND deleted_at IS NULL')
    .all(associationId) as Record<string, unknown>[];
  const bestaandeSeries = new Map<string, Record<string, unknown>>();
  const bestaandeNamen = new Map<string, Record<string, unknown>>();
  for (const rij of bestaand) {
    if (rij.serial_number) bestaandeSeries.set(String(rij.serial_number).toLowerCase(), rij);
    bestaandeNamen.set(String(rij.name).toLowerCase(), rij);
  }
  const bijwerkingen: Bijwerking[] = [];

  const dezeJaar = new Date().getFullYear();
  const gezienSerie = new Set<string>();
  const gezienNaam = new Set<string>();

  const regels: Beoordeling<InstrumentGegevens>[] = rijen.map((rij, i) => {
    const fouten: string[] = [];
    const waarschuwingen: string[] = [];

    const tekst = (veld: string, label: string): string | null => {
      const waarde = cel(rij, veld);
      if (waarde.length > MAX_TEKST) {
        waarschuwingen.push(`${label} is langer dan ${MAX_TEKST} tekens en wordt ingekort.`);
        return waarde.slice(0, MAX_TEKST);
      }
      return waarde || null;
    };

    const naam = cel(rij, 'naam');
    const soort = cel(rij, 'soort');
    if (!naam) fouten.push('Naam ontbreekt.');
    if (!soort) fouten.push('Soort instrument ontbreekt.');
    if (naam.length > MAX_TEKST || soort.length > MAX_TEKST)
      fouten.push(`Naam of soort is langer dan ${MAX_TEKST} tekens.`);

    const keuze = <T>(veld: string, lezer: (t: string) => T | undefined, standaard: T, label: string): T => {
      const waarde = cel(rij, veld);
      if (!waarde) return standaard;
      const gelezen = lezer(waarde);
      if (gelezen === undefined) {
        waarschuwingen.push(`${label} "${waarde}" is onbekend; het wordt de standaardwaarde.`);
        return standaard;
      }
      return gelezen;
    };

    const bouwjaarTekst = cel(rij, 'bouwjaar');
    let bouwjaar: number | null = null;
    if (bouwjaarTekst) {
      const jaar = Number(bouwjaarTekst);
      if (Number.isInteger(jaar) && jaar >= 1800 && jaar <= dezeJaar) bouwjaar = jaar;
      else
        waarschuwingen.push(
          `Bouwjaar "${bouwjaarTekst}" is geen jaar tussen 1800 en ${dezeJaar} en wordt overgeslagen.`,
        );
    }

    const aankoopdatumTekst = cel(rij, 'aankoopdatum');
    const aankoopdatum = aankoopdatumTekst ? leesDatum(aankoopdatumTekst) : undefined;
    if (aankoopdatumTekst && !aankoopdatum) {
      waarschuwingen.push(`Aankoopdatum "${aankoopdatumTekst}" is niet te lezen en wordt overgeslagen.`);
    }

    const bedrag = (veld: string, label: string): number | null => {
      const waarde = cel(rij, veld);
      if (!waarde) return null;
      const gelezen = leesBedrag(waarde);
      if (gelezen === undefined || gelezen < 0) {
        waarschuwingen.push(`${label} "${waarde}" is geen bedrag en wordt overgeslagen.`);
        return null;
      }
      return gelezen;
    };

    const gegevens: InstrumentGegevens = {
      naam,
      soort,
      categorie: keuze('categorie', categorie, 'other', 'Categorie'),
      merk: tekst('merk', 'Merk'),
      model: tekst('model', 'Model'),
      serienummer: tekst('serienummer', 'Serienummer'),
      bouwjaar,
      aankoopdatum: aankoopdatum ?? null,
      aankoopprijs: bedrag('aankoopprijs', 'Aankoopprijs'),
      waarde: bedrag('waarde', 'Waarde'),
      status: keuze('status', status, 'available', 'Status'),
      staat: keuze('staat', staat, 'good', 'Staat'),
      locatie: tekst('locatie', 'Locatie'),
      opmerkingen: cel(rij, 'opmerkingen') || null,
    };

    let uitkomst: RegelStatus = 'nieuw';
    let gevonden: Record<string, unknown> | undefined;
    const serie = gegevens.serienummer?.toLowerCase();
    const naamSleutel = naam.toLowerCase();
    if (serie) {
      if (gezienSerie.has(serie)) fouten.push('Dit serienummer staat eerder in het bestand.');
      else gevonden = bestaandeSeries.get(serie);
      gezienSerie.add(serie);
    } else if (naam) {
      if (gezienNaam.has(naamSleutel))
        fouten.push('Een instrument zonder serienummer met deze naam staat eerder in het bestand.');
      else gevonden = bestaandeNamen.get(naamSleutel);
      gezienNaam.add(naamSleutel);
    }
    if (gevonden) uitkomst = 'bestaat';

    let wijzigingen: Wijziging[] | undefined;
    if (fouten.length > 0) uitkomst = 'fout';
    else if (gevonden && opties.bijwerken) {
      // Alleen wat ingevuld is en gelezen kon worden; een keuze die onbekend
      // was (en dus de standaardwaarde kreeg) laat het oude staan.
      const gelezen = <T>(veld: string, lezer: (t: string) => T | undefined) =>
        cel(rij, veld) ? (lezer(cel(rij, veld)) ?? null) : null;
      const velden: Bijwerkbaar[] = [
        { veld: 'naam', kolom: KOLOM.naam, waarde: serie ? naam || null : null },
        { veld: 'soort', kolom: KOLOM.soort, waarde: soort || null },
        { veld: 'categorie', kolom: KOLOM.categorie, waarde: gelezen('categorie', categorie) },
        { veld: 'merk', kolom: KOLOM.merk, waarde: gegevens.merk },
        { veld: 'model', kolom: KOLOM.model, waarde: gegevens.model },
        { veld: 'bouwjaar', kolom: KOLOM.bouwjaar, waarde: gegevens.bouwjaar },
        { veld: 'aankoopdatum', kolom: KOLOM.aankoopdatum, waarde: gegevens.aankoopdatum },
        { veld: 'aankoopprijs', kolom: KOLOM.aankoopprijs, waarde: gegevens.aankoopprijs },
        { veld: 'waarde', kolom: KOLOM.waarde, waarde: gegevens.waarde },
        { veld: 'status', kolom: KOLOM.status, waarde: gelezen('status', status) },
        { veld: 'staat', kolom: KOLOM.staat, waarde: gelezen('staat', staat) },
        { veld: 'locatie', kolom: KOLOM.locatie, waarde: gegevens.locatie },
        { veld: 'opmerkingen', kolom: KOLOM.opmerkingen, waarde: gegevens.opmerkingen },
      ];
      const uitkomstWijziging = bepaalWijzigingen(String(gevonden.id), gevonden, velden);
      if (uitkomstWijziging.wijzigingen.length > 0) {
        uitkomst = 'bijwerken';
        wijzigingen = uitkomstWijziging.wijzigingen;
        bijwerkingen.push(uitkomstWijziging.bijwerking);
      }
    }

    return { rij: i + 2, status: uitkomst, gegevens, fouten, waarschuwingen, ...(wijzigingen && { wijzigingen }) };
  });

  return { kolommen, genegeerd, regels, bijwerkingen };
}

export function beoordeelInstrumenten(
  associationId: string,
  csv: string,
  opties: ImportOpties = {},
): Voorbeeld<InstrumentGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelInstrumentenIntern(associationId, csv, opties);
  return { kolommen, genegeerd, regels, tellingen: tel(regels) };
}

export function importeerInstrumenten(
  associationId: string,
  gebruikerId: string,
  csv: string,
  opties: ImportOpties = {},
): ImportUitkomst<InstrumentGegevens> {
  const { kolommen, genegeerd, regels, bijwerkingen } = beoordeelInstrumentenIntern(associationId, csv, opties);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');
  let bijgewerkt = 0;

  withTransaction(() => {
    bijgewerkt = werkBij('instrument_assets', associationId, bijwerkingen);
    const invoegen = db.prepare(
      `INSERT INTO instrument_assets (
         id, association_id, name, instrument_type, category, brand, model, serial_number,
         year_manufactured, purchase_date, purchase_price, current_value, status, condition,
         location, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const { gegevens: g } of nieuw) {
      invoegen.run(
        uuidv4(),
        associationId,
        g.naam,
        g.soort,
        g.categorie,
        g.merk,
        g.model,
        g.serienummer,
        g.bouwjaar,
        g.aankoopdatum,
        g.aankoopprijs,
        g.waarde,
        g.status,
        g.staat,
        g.locatie,
        g.opmerkingen,
        gebruikerId,
      );
    }
  });

  return { kolommen, genegeerd, regels, tellingen: tel(regels), geimporteerd: nieuw.length, bijgewerkt };
}
