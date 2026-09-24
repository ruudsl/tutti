/**
 * Contacten inlezen uit een spreadsheet: sponsors, leveranciers, zalen,
 * personen (tabel contacts, module contacten). Zie index.ts en
 * docs/IMPORTEREN.md.
 *
 * Een contact bestaat al als de vereniging een contact met dezelfde naam heeft.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import {
  herkenKolommen,
  lees,
  lijst,
  maakKeuze,
  tel,
  type Beoordeling,
  type ImportUitkomst,
  type RegelStatus,
  type Veld,
  type Voorbeeld,
} from './gemeenschappelijk';

const CONTACTVELDEN: Record<string, Veld> = {
  naam: { verplicht: true, namen: ['Naam', 'Name', 'Organisatie', 'Organization', 'Bedrijf', 'Company', 'Firma'] },
  soort: { namen: ['Soort', 'Type', 'Art', 'Typ'] },
  contactpersoon: { namen: ['Contactpersoon', 'Contact person', 'Contact', 'Ansprechpartner'] },
  email: { namen: ['E-mail', 'Email', 'E-mailadres', 'Mail', 'E-Mail-Adresse'] },
  telefoon: { namen: ['Telefoon', 'Telefoonnummer', 'Phone', 'Telephone', 'Telefon'] },
  mobiel: { namen: ['Mobiel', 'Mobiele telefoon', 'Mobile', 'Handy', 'Mobil'] },
  adres: { namen: ['Adres', 'Straat', 'Address', 'Street', 'Adresse', 'Straße'] },
  postcode: { namen: ['Postcode', 'Postal code', 'Zip', 'Zip code', 'PLZ', 'Postleitzahl'] },
  plaats: { namen: ['Plaats', 'Woonplaats', 'Stad', 'City', 'Town', 'Ort', 'Stadt'] },
  land: { namen: ['Land', 'Country'] },
  iban: { namen: ['IBAN', 'Rekeningnummer', 'Bankrekening', 'Account number', 'Kontonummer'] },
  website: { namen: ['Website', 'Site', 'Webseite', 'Homepage', 'URL'] },
  kvk: { namen: ['KvK', 'KvK-nummer', 'Kamer van Koophandel', 'Chamber of commerce', 'Handelsregister'] },
  btw: { namen: ['Btw', 'Btw-nummer', 'VAT', 'VAT number', 'USt-IdNr', 'Umsatzsteuer-ID'] },
  categorie: { namen: ['Categorie', 'Categorieën', 'Category', 'Categories', 'Kategorie'] },
  opmerkingen: { namen: ['Opmerkingen', 'Opmerking', 'Notities', 'Notes', 'Bemerkungen', 'Notizen'] },
};

type Soort = 'organization' | 'person' | 'venue' | 'vendor';

const soort = maakKeuze<Soort>({
  organization: ['organisatie', 'bedrijf', 'vereniging', 'sponsor', 'organisation', 'unternehmen', 'verein'],
  person: ['persoon', 'particulier', 'privé', 'person', 'privat'],
  venue: ['zaal', 'locatie', 'podium', 'location', 'veranstaltungsort', 'saal'],
  vendor: ['leverancier', 'supplier', 'lieferant'],
});

export interface ContactGegevens {
  naam: string;
  soort: Soort;
  contactpersoon: string | null;
  email: string | null;
  telefoon: string | null;
  mobiel: string | null;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string | null;
  iban: string | null;
  website: string | null;
  kvk: string | null;
  btw: string | null;
  categorieen: string[];
  opmerkingen: string | null;
}

interface ContactIntern extends ContactGegevens {
  categorieIds: string[];
}

const emailSchema = z.string().email().max(255);
/** Een IBAN zonder spaties: landcode, twee controlecijfers, 11 tot 30 tekens. */
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const MAX_TEKST = 255;

function beoordeelContactenIntern(associationId: string, csv: string) {
  const { kopregel, rijen } = lees(csv);
  const { index, kolommen, genegeerd } = herkenKolommen(kopregel, CONTACTVELDEN);
  const cel = (rij: string[], veld: string) => (index[veld] === undefined ? '' : (rij[index[veld]] ?? '').trim());

  const bestaand = new Set(
    (
      db
        .prepare('SELECT LOWER(name) AS naam FROM contacts WHERE association_id = ? AND deleted_at IS NULL')
        .all(associationId) as { naam: string }[]
    ).map(({ naam }) => naam),
  );
  const categorieen = new Map(
    (
      db
        .prepare('SELECT id, LOWER(name) AS naam FROM contact_categories WHERE association_id = ?')
        .all(associationId) as {
        id: string;
        naam: string;
      }[]
    ).map(({ id, naam }) => [naam, id]),
  );

  const gezien = new Set<string>();
  const regels: Beoordeling<ContactIntern>[] = rijen.map((rij, i) => {
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
    if (!naam) fouten.push('Naam ontbreekt.');
    if (naam.length > MAX_TEKST) fouten.push(`Naam is langer dan ${MAX_TEKST} tekens.`);

    const soortTekst = cel(rij, 'soort');
    let gekozenSoort: Soort = 'organization';
    if (soortTekst) {
      const gelezen = soort(soortTekst);
      if (gelezen) gekozenSoort = gelezen;
      else waarschuwingen.push(`Soort "${soortTekst}" is onbekend; het contact wordt een organisatie.`);
    }

    let email: string | null = cel(rij, 'email').toLowerCase() || null;
    if (email && !emailSchema.safeParse(email).success) {
      waarschuwingen.push(`"${email}" is geen geldig e-mailadres en wordt niet overgenomen.`);
      email = null;
    }

    let iban: string | null = cel(rij, 'iban').replace(/\s/g, '').toUpperCase() || null;
    if (iban && !IBAN.test(iban)) {
      waarschuwingen.push(`"${cel(rij, 'iban')}" is geen IBAN en wordt niet overgenomen.`);
      iban = null;
    }

    let website = tekst('website', 'Website');
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (website && !z.string().url().safeParse(website).success) {
      waarschuwingen.push(`Website "${cel(rij, 'website')}" is geen webadres en wordt niet overgenomen.`);
      website = null;
    }

    const categorieNamen = lijst(cel(rij, 'categorie'));
    const categorieIds: string[] = [];
    for (const naamCategorie of categorieNamen) {
      const id = categorieen.get(naamCategorie.toLowerCase());
      if (id) categorieIds.push(id);
      else waarschuwingen.push(`Categorie "${naamCategorie}" bestaat niet en wordt overgeslagen.`);
    }

    let status: RegelStatus = 'nieuw';
    const sleutel = naam.toLowerCase();
    if (naam && gezien.has(sleutel)) fouten.push('Een contact met deze naam staat eerder in het bestand.');
    else if (naam && bestaand.has(sleutel)) status = 'bestaat';
    if (naam) gezien.add(sleutel);
    if (fouten.length > 0) status = 'fout';

    return {
      rij: i + 2,
      status,
      gegevens: {
        naam,
        soort: gekozenSoort,
        contactpersoon: tekst('contactpersoon', 'Contactpersoon'),
        email,
        telefoon: tekst('telefoon', 'Telefoon'),
        mobiel: tekst('mobiel', 'Mobiel'),
        adres: tekst('adres', 'Adres'),
        postcode: tekst('postcode', 'Postcode'),
        plaats: tekst('plaats', 'Plaats'),
        land: tekst('land', 'Land'),
        iban,
        website,
        kvk: tekst('kvk', 'KvK-nummer'),
        btw: tekst('btw', 'Btw-nummer'),
        categorieen: categorieNamen,
        opmerkingen: cel(rij, 'opmerkingen') || null,
        categorieIds: [...new Set(categorieIds)],
      },
      fouten,
      waarschuwingen,
    };
  });

  return { kolommen, genegeerd, regels };
}

function zonderIds({ categorieIds: _c, ...rest }: ContactIntern): ContactGegevens {
  return rest;
}

export function beoordeelContacten(associationId: string, csv: string): Voorbeeld<ContactGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelContactenIntern(associationId, csv);
  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderIds(regel.gegevens) })),
    tellingen: tel(regels),
  };
}

export function importeerContacten(
  associationId: string,
  gebruikerId: string,
  csv: string,
): ImportUitkomst<ContactGegevens> {
  const { kolommen, genegeerd, regels } = beoordeelContactenIntern(associationId, csv);
  const nieuw = regels.filter((regel) => regel.status === 'nieuw');

  withTransaction(() => {
    const contact = db.prepare(
      `INSERT INTO contacts (
         id, association_id, contact_type, name, contact_person, email, phone, mobile,
         address_line, postal_code, city, country, iban, vat_number, chamber_of_commerce,
         website, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const categorie = db.prepare(
      'INSERT OR IGNORE INTO contact_category_links (contact_id, category_id) VALUES (?, ?)',
    );

    for (const { gegevens: g } of nieuw) {
      const id = uuidv4();
      contact.run(
        id,
        associationId,
        g.soort,
        g.naam,
        g.contactpersoon,
        g.email,
        g.telefoon,
        g.mobiel,
        g.adres,
        g.postcode,
        g.plaats,
        g.land,
        g.iban,
        g.btw,
        g.kvk,
        g.website,
        g.opmerkingen,
        gebruikerId,
      );
      for (const categorieId of g.categorieIds) categorie.run(id, categorieId);
    }
  });

  return {
    kolommen,
    genegeerd,
    regels: regels.map((regel) => ({ ...regel, gegevens: zonderIds(regel.gegevens) })),
    tellingen: tel(regels),
    geimporteerd: nieuw.length,
  };
}
