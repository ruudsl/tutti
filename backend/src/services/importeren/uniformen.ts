/**
 * Uniformonderdelen inlezen uit een spreadsheet (tabel uniform_items, module
 * inventaris). Zie index.ts en docs/IMPORTEREN.md.
 *
 * Een uniformonderdeel heeft geen nummer of naam: vier jassen in maat 52 zijn
 * vier gelijke regels. Of iets al bestaat, bepaalt daarom het aantal. Zijn er
 * al twee jassen van dezelfde soort, maat, kleur en drager, dan zijn de eerste
 * twee uit het bestand er al en worden alleen de overige toegevoegd. Zo kan
 * hetzelfde bestand twee keer worden ingelezen zonder dat alles dubbel staat.
 *
 * Een regel kan met "Aantal" meerdere gelijke onderdelen beschrijven. Met
 * "Uitgegeven aan" (het e-mailadres van een lid) is het onderdeel uitgegeven:
 * dan komt er ook een uitgifte bij, zoals bij het uitgeven op de pagina
 * Uniformen.
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

const UNIFORMVELDEN: Record<string, Veld> = {
  soort: { verplicht: true, namen: ['Soort', 'Onderdeel', 'Type', 'Item', 'Art', 'Teil', 'Kleidungsstück'] },
  maat: { namen: ['Maat', 'Size', 'Größe', 'Groesse', 'Konfektionsgröße'] },
  lengte: { namen: ['Lengte', 'Length', 'Länge', 'Binnenbeenlengte', 'Inseam'] },
  wijdte: { namen: ['Wijdte', 'Taille', 'Width', 'Waist', 'Weite', 'Bundweite'] },
  kleur: { namen: ['Kleur', 'Color', 'Colour', 'Farbe'] },
  aantal: { namen: ['Aantal', 'Stuks', 'Quantity', 'Qty', 'Anzahl', 'Stück'] },
  staat: { namen: ['Staat', 'Conditie', 'Condition', 'Zustand'] },
  status: { namen: ['Status', 'Beschikbaarheid', 'Verfügbarkeit'] },
  uitgegevenAan: {
    namen: ['Uitgegeven aan', 'Drager', 'Lid', 'E-mail', 'Issued to', 'Member', 'Ausgegeben an', 'Träger', 'Mitglied'],
  },
  uitgiftedatum: { namen: ['Uitgiftedatum', 'Uitgegeven op', 'Issue date', 'Issued on', 'Ausgabedatum'] },
  aankoopdatum: { namen: ['Aankoopdatum', 'Gekocht op', 'Purchase date', 'Kaufdatum'] },
  aankoopprijs: { namen: ['Aankoopprijs', 'Prijs', 'Purchase price', 'Price', 'Kaufpreis', 'Preis'] },
  opmerkingen: { namen: ['Opmerkingen', 'Opmerking', 'Notities', 'Notes', 'Bemerkungen', 'Notizen'] },
};

/** De soorten uit routes/uniforms.ts (`/item-types`). */
type Soort = 'jacket' | 'pants' | 'vest' | 'tie' | 'scarf' | 'polo' | 'raincoat' | 'shirt' | 'shoes' | 'hat' | 'other';
type Staat = 'good' | 'fair' | 'poor';
type Status = 'available' | 'issued' | 'in_repair' | 'written_off';

const soort = maakKeuze<Soort>({
  jacket: ['jas', 'jasje', 'colbert', 'uniformjas', 'jack', 'jacke', 'uniformjacke', 'sakko', 'jackett'],
  pants: ['broek', 'pantalon', 'uniformbroek', 'trousers', 'hose', 'uniformhose'],
  vest: ['gilet', 'weste'],
  tie: ['das', 'stropdas', 'strik', 'vlinderdas', 'krawatte', 'fliege'],
  scarf: ['sjaal', 'schal'],
  polo: ['poloshirt'],
  raincoat: ['regenjas', 'regenjack', 'regenjacke'],
  shirt: ['overhemd', 'hemd', 'blouse', 'bluse'],
  shoes: ['schoenen', 'schoen', 'schuhe', 'schuh'],
  hat: ['hoed', 'pet', 'baret', 'muts', 'cap', 'kepi', 'mütze', 'hut'],
  other: ['overig', 'anders', 'sonstiges'],
});

const staat = maakKeuze<Staat>({
  good: ['goed', 'nieuw', 'uitstekend', 'zeer goed', 'new', 'excellent', 'gut', 'neu', 'sehr gut'],
  fair: ['redelijk', 'matig', 'gebruikt', 'befriedigend', 'mittel'],
  poor: ['slecht', 'versleten', 'schlecht', 'abgenutzt'],
});

const status = maakKeuze<Status>({
  available: ['beschikbaar', 'vrij', 'op voorraad', 'verfügbar'],
  issued: ['uitgegeven', 'in gebruik', 'uitgeleend', 'in use', 'ausgegeben'],
  in_repair: ['in reparatie', 'reparatie', 'bij de kleermaker', 'in repair', 'in reparatur'],
  written_off: ['afgeschreven', 'written off', 'abgeschrieben'],
});

export interface UniformGegevens {
  soort: Soort;
  maat: string | null;
  lengte: number | null;
  wijdte: number | null;
  kleur: string | null;
  /** Hoeveel gelijke onderdelen deze regel beschrijft. */
  aantal: number;
  /** Hoeveel daarvan er nog niet zijn en worden toegevoegd. */
  toeTeVoegen: number;
  staat: Staat;
  status: Status;
  /** Het e-mailadres uit het bestand; alleen gevuld als het een lid van de vereniging is. */
  uitgegevenAan: string | null;
  uitgiftedatum: string | null;
  aankoopdatum: string | null;
  aankoopprijs: number | null;
  opmerkingen: string | null;
}

/** Meer per regel is vrijwel zeker een tikfout. */
const MAX_AANTAL = 200;
const MAX_TEKST = 100;

/** Wat twee onderdelen gelijk maakt: staat en status veranderen met de tijd en tellen niet mee. */
function kenmerk(
  soortWaarde: string,
  maat: string | null,
  lengte: number | null,
  wijdte: number | null,
  kleur: string | null,
  dragerId: string | null,
): string {
  return JSON.stringify([
    soortWaarde,
    (maat ?? '').toLowerCase(),
    lengte ?? null,
    wijdte ?? null,
    (kleur ?? '').toLowerCase(),
    dragerId ?? null,
  ]);
}

function beoordeelUniformenIntern(associationId: string, csv: string) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, UNIFORMVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  // Leden van deze vereniging, ook wie er via user_associations bij hoort.
  const leden = new Map(
    (
      db
        .prepare(
          `SELECT u.id, LOWER(u.email) AS email FROM users u
           WHERE u.association_id = ? AND u.deleted_at IS NULL
           UNION
           SELECT u.id, LOWER(u.email) FROM users u
           JOIN user_associations ua ON ua.user_id = u.id
           WHERE ua.association_id = ? AND u.deleted_at IS NULL`,
        )
        .all(associationId, associationId) as { id: string; email: string }[]
    ).map(({ id, email }) => [email, id]),
  );

  // Per kenmerk hoeveel onderdelen er al zijn. Elke regel die een kenmerk
  // gebruikt, haalt ze hier af.
  const voorraad = new Map<string, number>();
  for (const onderdeel of db
    .prepare(
      `SELECT item_type, size_standard, size_length, size_width, color, current_user_id
       FROM uniform_items WHERE association_id = ?`,
    )
    .all(associationId) as {
    item_type: string;
    size_standard: string | null;
    size_length: number | null;
    size_width: number | null;
    color: string | null;
    current_user_id: string | null;
  }[]) {
    const sleutel = kenmerk(
      onderdeel.item_type,
      onderdeel.size_standard,
      onderdeel.size_length,
      onderdeel.size_width,
      onderdeel.color,
      onderdeel.current_user_id,
    );
    voorraad.set(sleutel, (voorraad.get(sleutel) ?? 0) + 1);
  }

  const regels: (Beoordeling<UniformGegevens> & { dragerId: string | null })[] = rijen.map((rij, i) => {
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

    const heleMaat = (veld: string, label: string): number | null => {
      const waarde = cel(rij, veld);
      if (!waarde) return null;
      const getal = Number(waarde.replace(',', '.'));
      if (Number.isInteger(getal) && getal > 0 && getal < 1000) return getal;
      waarschuwingen.push(`${label} "${waarde}" is geen heel getal en wordt overgeslagen.`);
      return null;
    };

    // De soort is verplicht; een onbekende soort wordt "overig" en de naam
    // uit het bestand gaat mee in de opmerkingen, anders is hij weg.
    const soortTekst = cel(rij, 'soort');
    let opmerkingen = cel(rij, 'opmerkingen') || null;
    let soortWaarde: Soort = 'other';
    if (!soortTekst) fouten.push('Soort ontbreekt.');
    else {
      const gelezen = soort(soortTekst);
      if (gelezen) soortWaarde = gelezen;
      else {
        waarschuwingen.push(`Soort "${soortTekst}" is onbekend; het wordt "overig" met de naam in de opmerkingen.`);
        opmerkingen = [soortTekst.slice(0, MAX_TEKST), opmerkingen].filter(Boolean).join(' - ');
      }
    }

    const aantalTekst = cel(rij, 'aantal');
    let aantal = 1;
    if (aantalTekst) {
      const getal = Number(aantalTekst);
      if (Number.isInteger(getal) && getal >= 1 && getal <= MAX_AANTAL) aantal = getal;
      else fouten.push(`Aantal "${aantalTekst}" is geen heel getal van 1 tot en met ${MAX_AANTAL}.`);
    }

    let statusWaarde = keuze('status', status, 'available', 'Status');

    const emailTekst = cel(rij, 'uitgegevenAan');
    let dragerId: string | null = null;
    let uitgegevenAan: string | null = null;
    if (emailTekst) {
      dragerId = leden.get(emailTekst.toLowerCase()) ?? null;
      if (!dragerId) {
        waarschuwingen.push(`"${emailTekst}" is geen lid van de vereniging; het onderdeel wordt niet uitgegeven.`);
      } else if (aantal > 1) {
        fouten.push('Eén lid krijgt één onderdeel per regel: een regel met "Uitgegeven aan" heeft aantal 1.');
      } else if (statusWaarde === 'in_repair' || statusWaarde === 'written_off') {
        waarschuwingen.push(
          'Een onderdeel in reparatie of afgeschreven wordt niet uitgegeven; het lid wordt overgeslagen.',
        );
        dragerId = null;
      } else {
        uitgegevenAan = emailTekst.toLowerCase();
        statusWaarde = 'issued';
      }
    }
    if (!dragerId && statusWaarde === 'issued') {
      // Uitgegeven zonder bekend lid: op de pagina Uniformen kan dat niet
      // (uitgeven vraagt altijd een lid) en het onderdeel zou nergens meer
      // terug te nemen zijn.
      if (!emailTekst) waarschuwingen.push('Uitgegeven zonder "Uitgegeven aan"; het onderdeel wordt beschikbaar.');
      statusWaarde = 'available';
    }

    const uitgifteTekst = cel(rij, 'uitgiftedatum');
    const uitgiftedatum = uitgifteTekst ? leesDatum(uitgifteTekst) : undefined;
    if (uitgifteTekst && !uitgiftedatum) {
      waarschuwingen.push(`Uitgiftedatum "${uitgifteTekst}" is niet te lezen; het wordt vandaag.`);
    }

    const aankoopTekst = cel(rij, 'aankoopdatum');
    const aankoopdatum = aankoopTekst ? leesDatum(aankoopTekst) : undefined;
    if (aankoopTekst && !aankoopdatum) {
      waarschuwingen.push(`Aankoopdatum "${aankoopTekst}" is niet te lezen en wordt overgeslagen.`);
    }

    const prijsTekst = cel(rij, 'aankoopprijs');
    let aankoopprijs: number | null = null;
    if (prijsTekst) {
      const gelezen = leesBedrag(prijsTekst);
      if (gelezen === undefined || gelezen < 0) {
        waarschuwingen.push(`Aankoopprijs "${prijsTekst}" is geen bedrag en wordt overgeslagen.`);
      } else aankoopprijs = gelezen;
    }

    const gegevens: UniformGegevens = {
      soort: soortWaarde,
      maat: tekst('maat', 'Maat'),
      lengte: heleMaat('lengte', 'Lengte'),
      wijdte: heleMaat('wijdte', 'Wijdte'),
      kleur: tekst('kleur', 'Kleur'),
      aantal,
      toeTeVoegen: 0,
      staat: keuze('staat', staat, 'good', 'Staat'),
      status: statusWaarde,
      uitgegevenAan,
      uitgiftedatum: uitgegevenAan ? (uitgiftedatum ?? null) : null,
      aankoopdatum: aankoopdatum ?? null,
      aankoopprijs,
      opmerkingen,
    };

    let uitkomst: RegelStatus = 'fout';
    if (fouten.length === 0) {
      const sleutel = kenmerk(
        gegevens.soort,
        gegevens.maat,
        gegevens.lengte,
        gegevens.wijdte,
        gegevens.kleur,
        dragerId,
      );
      const alAanwezig = Math.min(voorraad.get(sleutel) ?? 0, aantal);
      voorraad.set(sleutel, (voorraad.get(sleutel) ?? 0) - alAanwezig);
      gegevens.toeTeVoegen = aantal - alAanwezig;
      if (gegevens.toeTeVoegen === 0) uitkomst = 'bestaat';
      else {
        uitkomst = 'nieuw';
        if (alAanwezig > 0) {
          waarschuwingen.push(
            `${alAanwezig} van de ${aantal} ${alAanwezig === 1 ? 'is' : 'zijn'} er al; ${gegevens.toeTeVoegen} ${
              gegevens.toeTeVoegen === 1 ? 'wordt' : 'worden'
            } toegevoegd.`,
          );
        }
      }
    }

    return { rij: i + 2, status: uitkomst, gegevens, fouten, waarschuwingen, dragerId };
  });

  return { kolommen, genegeerd, regels };
}

/** De uitkomst zonder het interne id van de drager. */
function zonderDrager(regels: (Beoordeling<UniformGegevens> & { dragerId: string | null })[]) {
  return regels.map(({ dragerId: _dragerId, ...regel }) => regel);
}

export function beoordeelUniformen(associationId: string, csv: string): Voorbeeld<UniformGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelUniformenIntern(associationId, csv);
  const openbaar = zonderDrager(regels);
  return { kolommen, genegeerd, regels: openbaar, tellingen: tel(openbaar) };
}

export function importeerUniformen(associationId: string, csv: string): ImportUitkomst<UniformGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelUniformenIntern(associationId, csv);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');
  const vandaag = new Date().toISOString().slice(0, 10);
  let geimporteerd = 0;

  withTransaction(() => {
    const invoegen = db.prepare(
      `INSERT INTO uniform_items (
         id, association_id, item_type, size_standard, size_length, size_width, color,
         condition, status, current_user_id, notes, purchase_date, purchase_price
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const uitgeven = db.prepare(
      `INSERT INTO uniform_assignments (id, uniform_item_id, user_id, assigned_date, condition_at_assignment, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const { gegevens: g, dragerId } of nieuw) {
      for (let n = 0; n < g.toeTeVoegen; n++) {
        const id = uuidv4();
        invoegen.run(
          id,
          associationId,
          g.soort,
          g.maat,
          g.lengte,
          g.wijdte,
          g.kleur,
          g.staat,
          g.status,
          dragerId,
          g.opmerkingen,
          g.aankoopdatum,
          g.aankoopprijs,
        );
        if (dragerId) {
          uitgeven.run(uuidv4(), id, dragerId, g.uitgiftedatum ?? vandaag, g.staat, 'Ingelezen uit een spreadsheet');
        }
        geimporteerd++;
      }
    }
  });

  const openbaar = zonderDrager(regels);
  return { kolommen, genegeerd, regels: openbaar, tellingen: tel(openbaar), geimporteerd };
}
