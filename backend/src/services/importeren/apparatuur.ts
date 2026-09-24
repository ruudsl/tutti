/**
 * Apparatuur inlezen uit een spreadsheet: geluid, licht, standaards,
 * lessenaars, een aanhanger (tabel equipment_items, module inventaris). Zie
 * index.ts en docs/IMPORTEREN.md. Instrumenten hebben hun eigen import
 * (instrumenten.ts, tabel instrument_assets).
 *
 * Een stuk apparatuur bestaat al als de vereniging er een heeft met hetzelfde
 * inventarisnummer; zonder inventarisnummer telt het serienummer, en zonder
 * beide de naam. Wie geen inventarisnummer opgeeft krijgt er een, in dezelfde
 * reeks als bij het aanmaken op de pagina Apparatuur (EQ-00001).
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import {
  herkenKolommen,
  lees,
  leesBedrag,
  leesDatum,
  maakKeuze,
  tel,
  type Beoordeling,
  type ImportUitkomst,
  type RegelStatus,
  type Veld,
  type Voorbeeld,
} from './gemeenschappelijk';

const APPARATUURVELDEN: Record<string, Veld> = {
  naam: { verplicht: true, namen: ['Naam', 'Name', 'Omschrijving', 'Bezeichnung', 'Artikel'] },
  soort: { namen: ['Soort', 'Type', 'Art', 'Typ'] },
  categorie: { namen: ['Categorie', 'Category', 'Kategorie', 'Groep', 'Gruppe'] },
  inventarisnummer: {
    namen: ['Inventarisnummer', 'Inventarisnr', 'Inventory number', 'Asset number', 'Inventarnummer', 'Nummer'],
  },
  serienummer: { namen: ['Serienummer', 'Serial number', 'Serial', 'Seriennummer'] },
  merk: { namen: ['Merk', 'Brand', 'Make', 'Marke', 'Hersteller', 'Fabrikant'] },
  model: { namen: ['Model', 'Modell'] },
  status: { namen: ['Status', 'Beschikbaarheid', 'Verfügbarkeit'] },
  staat: { namen: ['Staat', 'Conditie', 'Condition', 'Zustand'] },
  locatie: { namen: ['Locatie', 'Location', 'Standort'] },
  opslag: { namen: ['Opslag', 'Opslaglocatie', 'Storage', 'Storage location', 'Lagerort'] },
  aankoopdatum: { namen: ['Aankoopdatum', 'Gekocht op', 'Purchase date', 'Kaufdatum'] },
  aankoopprijs: { namen: ['Aankoopprijs', 'Prijs', 'Purchase price', 'Price', 'Kaufpreis', 'Preis'] },
  waarde: { namen: ['Waarde', 'Huidige waarde', 'Current value', 'Value', 'Wert', 'Zeitwert'] },
  garantieTot: { namen: ['Garantie tot', 'Garantie', 'Warranty', 'Warranty expiry', 'Garantie bis'] },
  onderhoudsinterval: {
    namen: ['Onderhoudsinterval', 'Onderhoud om de', 'Maintenance interval', 'Wartungsintervall'],
  },
  laatsteOnderhoud: { namen: ['Laatste onderhoud', 'Last maintenance', 'Letzte Wartung'] },
  uitleenbaar: { namen: ['Uitleenbaar', 'Te leen', 'Loanable', 'Ausleihbar'] },
  opmerkingen: { namen: ['Opmerkingen', 'Opmerking', 'Notities', 'Notes', 'Bemerkungen', 'Notizen'] },
};

/** De waarden die de tabel toestaat (CHECK in database/schema.ts). */
type Soort = 'instrument' | 'accessory' | 'audio' | 'lighting' | 'furniture' | 'transport' | 'misc';
type Status = 'available' | 'in_use' | 'maintenance' | 'repair' | 'retired' | 'lost' | 'sold';
type Staat = 'new' | 'excellent' | 'good' | 'fair' | 'poor' | 'broken';

const soort = maakKeuze<Soort>({
  instrument: ['instrumenten', 'muziekinstrument', 'musikinstrument'],
  accessory: ['accessoire', 'accessoires', 'toebehoren', 'zubehör', 'accessories'],
  audio: ['geluid', 'geluidsapparatuur', 'versterking', 'sound', 'ton', 'tontechnik'],
  lighting: ['licht', 'verlichting', 'light', 'lights', 'beleuchtung', 'lichttechnik'],
  furniture: ['meubilair', 'meubels', 'lessenaars', 'stoelen', 'möbel', 'mobiliar'],
  transport: ['vervoer', 'aanhanger', 'kar', 'trailer', 'anhänger'],
  misc: ['overig', 'anders', 'diversen', 'other', 'sonstiges'],
});

const status = maakKeuze<Status>({
  available: ['beschikbaar', 'vrij', 'verfügbar'],
  in_use: ['in gebruik', 'uitgeleend', 'in use', 'on loan', 'im einsatz', 'ausgeliehen'],
  maintenance: ['onderhoud', 'in onderhoud', 'wartung', 'in wartung'],
  repair: ['reparatie', 'in reparatie', 'in repair', 'reparatur', 'in reparatur'],
  retired: ['afgeschreven', 'buiten gebruik', 'written off', 'ausgemustert', 'abgeschrieben'],
  lost: ['kwijt', 'vermist', 'verloren', 'vermisst'],
  sold: ['verkocht', 'verkauft'],
});

const staat = maakKeuze<Staat>({
  new: ['nieuw', 'neu'],
  excellent: ['uitstekend', 'zeer goed', 'hervorragend', 'sehr gut'],
  good: ['goed', 'gut'],
  fair: ['redelijk', 'matig', 'befriedigend', 'mittel'],
  poor: ['slecht', 'schlecht'],
  broken: ['kapot', 'defect', 'stuk', 'defekt', 'kaputt'],
});

const janee = maakKeuze<'ja' | 'nee'>({
  ja: ['j', 'yes', 'y', 'true', '1', 'x', 'wel'],
  nee: ['n', 'no', 'false', '0', 'niet', 'nein'],
});

export interface ApparatuurGegevens {
  naam: string;
  soort: Soort;
  categorie: string | null;
  /** Uit het bestand, of bij een nieuwe regel zonder nummer het nummer dat hij krijgt. */
  inventarisnummer: string | null;
  serienummer: string | null;
  merk: string | null;
  model: string | null;
  status: Status;
  staat: Staat;
  locatie: string | null;
  opslag: string | null;
  aankoopdatum: string | null;
  aankoopprijs: number | null;
  waarde: number | null;
  garantieTot: string | null;
  onderhoudsintervalMaanden: number | null;
  laatsteOnderhoud: string | null;
  uitleenbaar: boolean;
  opmerkingen: string | null;
}

const MAX_TEKST = 255;

/** Een datum plus een aantal maanden, als JJJJ-MM-DD; de 31e wordt de laatste dag van een kortere maand. */
function plusMaanden(datum: string, maanden: number): string {
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const doel = new Date(Date.UTC(jaar, maand - 1 + maanden, 1));
  const laatsteDag = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
  doel.setUTCDate(Math.min(dag, laatsteDag));
  return doel.toISOString().slice(0, 10);
}

function beoordeelApparatuurIntern(associationId: string, csv: string) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, APPARATUURVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const bestaand = db
    .prepare(
      `SELECT LOWER(name) AS naam, LOWER(serial_number) AS serie, LOWER(inventory_number) AS nummer, deleted_at
       FROM equipment_items WHERE association_id = ?`,
    )
    .all(associationId) as { naam: string; serie: string | null; nummer: string | null; deleted_at: string | null }[];
  const actief = bestaand.filter((b) => !b.deleted_at);
  const bestaandeNummers = new Set(actief.map((b) => b.nummer).filter((n): n is string => !!n));
  const bestaandeSeries = new Set(actief.map((b) => b.serie).filter((s): s is string => !!s));
  const bestaandeNamen = new Set(actief.map((b) => b.naam));

  const categorieen = new Map(
    (
      db.prepare('SELECT id, name FROM equipment_categories WHERE association_id = ?').all(associationId) as {
        id: string;
        name: string;
      }[]
    ).map(({ id, name }) => [name.toLowerCase(), { id, name }]),
  );

  const gezienNummer = new Set<string>();
  const gezienSerie = new Set<string>();
  const gezienNaam = new Set<string>();

  const regels: (Beoordeling<ApparatuurGegevens> & { categorieId: string | null })[] = rijen.map((rij, i) => {
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

    const datum = (veld: string, label: string): string | null => {
      const waarde = cel(rij, veld);
      if (!waarde) return null;
      const gelezen = leesDatum(waarde);
      if (!gelezen) waarschuwingen.push(`${label} "${waarde}" is niet te lezen en wordt overgeslagen.`);
      return gelezen ?? null;
    };

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

    const naam = cel(rij, 'naam');
    if (!naam) fouten.push('Naam ontbreekt.');
    if (naam.length > MAX_TEKST) fouten.push(`Naam is langer dan ${MAX_TEKST} tekens.`);

    const categorieTekst = cel(rij, 'categorie');
    const categorie = categorieTekst ? categorieen.get(categorieTekst.toLowerCase()) : undefined;
    if (categorieTekst && !categorie) {
      waarschuwingen.push(
        `Categorie "${categorieTekst}" bestaat niet en wordt overgeslagen; maak hem eerst aan op de pagina Apparatuur.`,
      );
    }

    const intervalTekst = cel(rij, 'onderhoudsinterval');
    let interval: number | null = null;
    if (intervalTekst) {
      const getal = Number(intervalTekst.replace(/\s*(maanden|maand|months?|monate?)$/i, ''));
      if (Number.isInteger(getal) && getal >= 1 && getal <= 120) interval = getal;
      else
        waarschuwingen.push(
          `Onderhoudsinterval "${intervalTekst}" is geen aantal maanden van 1 tot 120 en wordt overgeslagen.`,
        );
    }

    const uitleenbaarTekst = cel(rij, 'uitleenbaar');
    let uitleenbaar = true;
    if (uitleenbaarTekst) {
      const gelezen = janee(uitleenbaarTekst);
      if (gelezen) uitleenbaar = gelezen === 'ja';
      else waarschuwingen.push(`Uitleenbaar "${uitleenbaarTekst}" is geen ja of nee; het wordt ja.`);
    }

    const gegevens: ApparatuurGegevens = {
      naam,
      soort: keuze('soort', soort, 'misc', 'Soort'),
      categorie: categorie?.name ?? null,
      inventarisnummer: tekst('inventarisnummer', 'Inventarisnummer'),
      serienummer: tekst('serienummer', 'Serienummer'),
      merk: tekst('merk', 'Merk'),
      model: tekst('model', 'Model'),
      status: keuze('status', status, 'available', 'Status'),
      staat: keuze('staat', staat, 'good', 'Staat'),
      locatie: tekst('locatie', 'Locatie'),
      opslag: tekst('opslag', 'Opslag'),
      aankoopdatum: datum('aankoopdatum', 'Aankoopdatum'),
      aankoopprijs: bedrag('aankoopprijs', 'Aankoopprijs'),
      waarde: bedrag('waarde', 'Waarde'),
      garantieTot: datum('garantieTot', 'Garantie tot'),
      onderhoudsintervalMaanden: interval,
      laatsteOnderhoud: datum('laatsteOnderhoud', 'Laatste onderhoud'),
      uitleenbaar,
      opmerkingen: cel(rij, 'opmerkingen') || null,
    };

    let uitkomst: RegelStatus = 'nieuw';
    const nummer = gegevens.inventarisnummer?.toLowerCase();
    const serie = gegevens.serienummer?.toLowerCase();
    const naamSleutel = naam.toLowerCase();
    if (nummer) {
      if (gezienNummer.has(nummer)) fouten.push('Dit inventarisnummer staat eerder in het bestand.');
      else if (bestaandeNummers.has(nummer)) uitkomst = 'bestaat';
      gezienNummer.add(nummer);
    } else if (serie) {
      if (gezienSerie.has(serie)) fouten.push('Dit serienummer staat eerder in het bestand.');
      else if (bestaandeSeries.has(serie)) uitkomst = 'bestaat';
      gezienSerie.add(serie);
    } else if (naam) {
      if (gezienNaam.has(naamSleutel))
        fouten.push('Apparatuur zonder inventaris- of serienummer met deze naam staat eerder in het bestand.');
      else if (bestaandeNamen.has(naamSleutel)) uitkomst = 'bestaat';
      gezienNaam.add(naamSleutel);
    }
    if (fouten.length > 0) uitkomst = 'fout';

    return { rij: i + 2, status: uitkomst, gegevens, fouten, waarschuwingen, categorieId: categorie?.id ?? null };
  });

  // Nummers voor wie er geen heeft, in de reeks van routes/equipment.ts: het
  // aantal rijen (ook verwijderde) plus één, en verder tot een vrij nummer.
  // Ook nummers van verwijderde apparatuur en uit het bestand zelf zijn bezet.
  const bezet = new Set([...bestaand.map((b) => b.nummer).filter((n): n is string => !!n), ...gezienNummer]);
  let volgende = bestaand.length + 1;
  for (const regel of regels) {
    if (regel.status !== 'nieuw' || regel.gegevens.inventarisnummer) continue;
    let nummer = `EQ-${String(volgende).padStart(5, '0')}`;
    while (bezet.has(nummer.toLowerCase())) nummer = `EQ-${String(++volgende).padStart(5, '0')}`;
    bezet.add(nummer.toLowerCase());
    volgende++;
    regel.gegevens.inventarisnummer = nummer;
  }

  return { kolommen, genegeerd, regels };
}

function openbaar(regels: (Beoordeling<ApparatuurGegevens> & { categorieId: string | null })[]) {
  return regels.map(({ categorieId: _categorieId, ...regel }) => regel);
}

export function beoordeelApparatuur(associationId: string, csv: string): Voorbeeld<ApparatuurGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelApparatuurIntern(associationId, csv);
  const zichtbaar = openbaar(regels);
  return { kolommen, genegeerd, regels: zichtbaar, tellingen: tel(zichtbaar) };
}

export function importeerApparatuur(associationId: string, csv: string): ImportUitkomst<ApparatuurGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelApparatuurIntern(associationId, csv);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');

  withTransaction(() => {
    const invoegen = db.prepare(
      `INSERT INTO equipment_items (
         id, association_id, category_id, name, inventory_number, serial_number, brand, model,
         equipment_type, status, condition, location, storage_location, purchase_date,
         purchase_price, current_value, warranty_expiry, maintenance_interval_months,
         last_maintenance, next_maintenance, is_loanable, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const { gegevens: g, categorieId } of nieuw) {
      const volgendOnderhoud =
        g.laatsteOnderhoud && g.onderhoudsintervalMaanden
          ? plusMaanden(g.laatsteOnderhoud, g.onderhoudsintervalMaanden)
          : null;
      invoegen.run(
        uuidv4(),
        associationId,
        categorieId,
        g.naam,
        g.inventarisnummer,
        g.serienummer,
        g.merk,
        g.model,
        g.soort,
        g.status,
        g.staat,
        g.locatie,
        g.opslag,
        g.aankoopdatum,
        g.aankoopprijs,
        g.waarde,
        g.garantieTot,
        g.onderhoudsintervalMaanden,
        g.laatsteOnderhoud,
        volgendOnderhoud,
        g.uitleenbaar ? 1 : 0,
        g.opmerkingen,
      );
    }
  });

  const zichtbaar = openbaar(regels);
  return { kolommen, genegeerd, regels: zichtbaar, tellingen: tel(zichtbaar), geimporteerd: nieuw.length };
}
