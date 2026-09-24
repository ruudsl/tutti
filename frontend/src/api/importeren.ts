import api from './client';

/**
 * Leden, de muziekbibliotheek, instrumenten in bezit, contacten, uniformen en
 * apparatuur inlezen uit een spreadsheet (WP11); zie backend/src/routes/importeren.ts en
 * docs/IMPORTEREN.md.
 *
 * Per soort een voorbeeld dat niets verandert, en de import zelf. De server
 * beoordeelt het bestand bij het importeren opnieuw.
 */

export type ImportSoort = 'leden' | 'muziektitels' | 'instrumenten' | 'contacten' | 'uniformen' | 'apparatuur';

export type RegelStatus = 'nieuw' | 'bestaat' | 'fout';

export interface LidGegevens {
  voornaam: string;
  achternaam: string;
  email: string;
  rol: string;
  instrumenten: string[];
  orkesten: string[];
  priveEmail: string | null;
}

export interface TitelGegevens {
  titel: string;
  componist: string | null;
  arrangeur: string | null;
  duurSeconden: number | null;
  graad: string | null;
  genres: string[];
}

export interface InstrumentGegevens {
  naam: string;
  soort: string;
  categorie: string;
  merk: string | null;
  model: string | null;
  serienummer: string | null;
  bouwjaar: number | null;
  aankoopdatum: string | null;
  aankoopprijs: number | null;
  waarde: number | null;
  status: string;
  staat: string;
  locatie: string | null;
  opmerkingen: string | null;
}

export interface ContactGegevens {
  naam: string;
  soort: 'organization' | 'person' | 'venue' | 'vendor';
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

export interface UniformGegevens {
  soort: string;
  maat: string | null;
  lengte: number | null;
  wijdte: number | null;
  kleur: string | null;
  /** Hoeveel gelijke onderdelen de regel beschrijft. */
  aantal: number;
  /** Hoeveel daarvan er nog niet zijn en worden toegevoegd. */
  toeTeVoegen: number;
  staat: string;
  status: string;
  /** Het e-mailadres van het lid dat het onderdeel krijgt. */
  uitgegevenAan: string | null;
  uitgiftedatum: string | null;
  aankoopdatum: string | null;
  aankoopprijs: number | null;
  opmerkingen: string | null;
}

export interface ApparatuurGegevens {
  naam: string;
  soort: string;
  categorie: string | null;
  /** Uit het bestand, of bij een nieuwe regel het nummer dat hij krijgt. */
  inventarisnummer: string | null;
  serienummer: string | null;
  merk: string | null;
  model: string | null;
  status: string;
  staat: string;
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

export interface Beoordeling<T> {
  rij: number;
  status: RegelStatus;
  gegevens: T;
  fouten: string[];
  waarschuwingen: string[];
}

export interface ImportVoorbeeld<T> {
  kolommen: Record<string, string>;
  genegeerd: string[];
  regels: Beoordeling<T>[];
  tellingen: Record<RegelStatus, number>;
}

export interface ImportUitkomst<T> extends ImportVoorbeeld<T> {
  geimporteerd: number;
}

export type GegevensVan<S extends ImportSoort> = {
  leden: LidGegevens;
  muziektitels: TitelGegevens;
  instrumenten: InstrumentGegevens;
  contacten: ContactGegevens;
  uniformen: UniformGegevens;
  apparatuur: ApparatuurGegevens;
}[S];

export const bekijkImport = async <S extends ImportSoort>(
  soort: S,
  csv: string,
): Promise<ImportVoorbeeld<GegevensVan<S>>> => {
  const { data } = await api.post(`/import/${soort}/voorbeeld`, { csv });
  return data;
};

export const voerImportUit = async <S extends ImportSoort>(
  soort: S,
  csv: string,
): Promise<ImportUitkomst<GegevensVan<S>>> => {
  const { data } = await api.post(`/import/${soort}`, { csv });
  return data;
};
