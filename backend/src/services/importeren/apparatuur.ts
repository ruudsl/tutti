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
 *
 * Met `bijwerken` krijgt bestaande apparatuur wat in het bestand anders is;
 * zie `bepaalWijzigingen` in gemeenschappelijk.ts. De categorie wordt daarbij
 * niet gewijzigd.
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

function beoordeelApparatuurIntern(associationId: string, csv: string, opties: ImportOpties = {}) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, APPARATUURVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const bestaand = db.prepare('SELECT * FROM equipment_items WHERE association_id = ?').all(associationId) as Record<
    string,
    unknown
  >[];
  const kleine = (waarde: unknown) => (waarde ? String(waarde).toLowerCase() : null);
  const bestaandeNummers = new Map<string, Record<string, unknown>>();
  const bestaandeSeries = new Map<string, Record<string, unknown>>();
  const bestaandeNamen = new Map<string, Record<string, unknown>>();
  for (const rij of bestaand.filter((b) => !b.deleted_at)) {
    const nummer = kleine(rij.inventory_number);
    const serie = kleine(rij.serial_number);
    if (nummer) bestaandeNummers.set(nummer, rij);
    if (serie) bestaandeSeries.set(serie, rij);
    bestaandeNamen.set(String(rij.name).toLowerCase(), rij);
  }
  const bijwerkingen: Bijwerking[] = [];

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
    let gevonden: Record<string, unknown> | undefined;
    const nummer = gegevens.inventarisnummer?.toLowerCase();
    const serie = gegevens.serienummer?.toLowerCase();
    const naamSleutel = naam.toLowerCase();
    if (nummer) {
      if (gezienNummer.has(nummer)) fouten.push('Dit inventarisnummer staat eerder in het bestand.');
      else gevonden = bestaandeNummers.get(nummer);
      gezienNummer.add(nummer);
    } else if (serie) {
      if (gezienSerie.has(serie)) fouten.push('Dit serienummer staat eerder in het bestand.');
      else gevonden = bestaandeSeries.get(serie);
      gezienSerie.add(serie);
    } else if (naam) {
      if (gezienNaam.has(naamSleutel))
        fouten.push('Apparatuur zonder inventaris- of serienummer met deze naam staat eerder in het bestand.');
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
        // De sleutel zelf verandert niet; wat na de sleutel komt wel.
        { veld: 'naam', kolom: 'name', waarde: nummer || serie ? naam || null : null },
        { veld: 'serienummer', kolom: 'serial_number', waarde: nummer ? gegevens.serienummer : null },
        { veld: 'soort', kolom: 'equipment_type', waarde: gelezen('soort', soort) },
        { veld: 'merk', kolom: 'brand', waarde: gegevens.merk },
        { veld: 'model', kolom: 'model', waarde: gegevens.model },
        { veld: 'status', kolom: 'status', waarde: gelezen('status', status) },
        { veld: 'staat', kolom: 'condition', waarde: gelezen('staat', staat) },
        { veld: 'locatie', kolom: 'location', waarde: gegevens.locatie },
        { veld: 'opslag', kolom: 'storage_location', waarde: gegevens.opslag },
        { veld: 'aankoopdatum', kolom: 'purchase_date', waarde: gegevens.aankoopdatum },
        { veld: 'aankoopprijs', kolom: 'purchase_price', waarde: gegevens.aankoopprijs },
        { veld: 'waarde', kolom: 'current_value', waarde: gegevens.waarde },
        { veld: 'garantieTot', kolom: 'warranty_expiry', waarde: gegevens.garantieTot },
        {
          veld: 'onderhoudsinterval',
          kolom: 'maintenance_interval_months',
          waarde: gegevens.onderhoudsintervalMaanden,
        },
        { veld: 'laatsteOnderhoud', kolom: 'last_maintenance', waarde: gegevens.laatsteOnderhoud },
        {
          veld: 'uitleenbaar',
          kolom: 'is_loanable',
          waarde: gelezen('uitleenbaar', janee) === null ? null : gegevens.uitleenbaar,
        },
        { veld: 'opmerkingen', kolom: 'notes', waarde: gegevens.opmerkingen },
      ];
      const gevondenId = String(gevonden.id);
      const bepaald = bepaalWijzigingen(gevondenId, gevonden, velden);
      // Verandert het laatste onderhoud of het interval, dan ook het volgende.
      const { kolommen: nieuweKolommen } = bepaald.bijwerking;
      if ('last_maintenance' in nieuweKolommen || 'maintenance_interval_months' in nieuweKolommen) {
        const laatste = (nieuweKolommen.last_maintenance ?? gevonden.last_maintenance) as string | null;
        const interval = (nieuweKolommen.maintenance_interval_months ?? gevonden.maintenance_interval_months) as
          number | null;
        const volgende = laatste && interval ? plusMaanden(String(laatste).slice(0, 10), Number(interval)) : null;
        if (volgende && volgende !== gevonden.next_maintenance) {
          bepaald.wijzigingen.push({
            veld: 'volgendOnderhoud',
            oud: (gevonden.next_maintenance ?? null) as string | null,
            nieuw: volgende,
          });
          nieuweKolommen.next_maintenance = volgende;
        }
      }
      if (bepaald.wijzigingen.length > 0) {
        uitkomst = 'bijwerken';
        wijzigingen = bepaald.wijzigingen;
        bijwerkingen.push(bepaald.bijwerking);
      }
    }

    return {
      rij: i + 2,
      status: uitkomst,
      gegevens,
      fouten,
      waarschuwingen,
      ...(wijzigingen && { wijzigingen }),
      categorieId: categorie?.id ?? null,
    };
  });

  // Nummers voor wie er geen heeft, in de reeks van routes/equipment.ts: het
  // aantal rijen (ook verwijderde) plus één, en verder tot een vrij nummer.
  // Ook nummers van verwijderde apparatuur en uit het bestand zelf zijn bezet.
  const bezet = new Set([
    ...bestaand.map((b) => kleine(b.inventory_number)).filter((n): n is string => !!n),
    ...gezienNummer,
  ]);
  let volgende = bestaand.length + 1;
  for (const regel of regels) {
    if (regel.status !== 'nieuw' || regel.gegevens.inventarisnummer) continue;
    let nummer = `EQ-${String(volgende).padStart(5, '0')}`;
    while (bezet.has(nummer.toLowerCase())) nummer = `EQ-${String(++volgende).padStart(5, '0')}`;
    bezet.add(nummer.toLowerCase());
    volgende++;
    regel.gegevens.inventarisnummer = nummer;
  }

  return { kolommen, genegeerd, regels, bijwerkingen };
}

function openbaar(regels: (Beoordeling<ApparatuurGegevens> & { categorieId: string | null })[]) {
  return regels.map(({ categorieId: _categorieId, ...regel }) => regel);
}

export function beoordeelApparatuur(
  associationId: string,
  csv: string,
  opties: ImportOpties = {},
): Voorbeeld<ApparatuurGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelApparatuurIntern(associationId, csv, opties);
  const zichtbaar = openbaar(regels);
  return { kolommen, genegeerd, regels: zichtbaar, tellingen: tel(zichtbaar) };
}

export function importeerApparatuur(
  associationId: string,
  csv: string,
  opties: ImportOpties = {},
): ImportUitkomst<ApparatuurGegevens> {
  const { kolommen, genegeerd, regels, bijwerkingen } = beoordeelApparatuurIntern(associationId, csv, opties);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');
  let bijgewerkt = 0;

  withTransaction(() => {
    bijgewerkt = werkBij('equipment_items', associationId, bijwerkingen);
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
  return {
    kolommen,
    genegeerd,
    regels: zichtbaar,
    tellingen: tel(zichtbaar),
    geimporteerd: nieuw.length,
    bijgewerkt,
  };
}
