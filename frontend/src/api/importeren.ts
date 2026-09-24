import api from './client';

/**
 * Leden en de muziekbibliotheek inlezen uit een spreadsheet (WP11); zie
 * backend/src/routes/importeren.ts en docs/IMPORTEREN.md.
 *
 * Per soort een voorbeeld dat niets verandert, en de import zelf. De server
 * beoordeelt het bestand bij het importeren opnieuw.
 */

export type ImportSoort = 'leden' | 'muziektitels';

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

export type GegevensVan<S extends ImportSoort> = S extends 'leden' ? LidGegevens : TitelGegevens;

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
