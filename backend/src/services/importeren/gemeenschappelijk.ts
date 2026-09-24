/**
 * Wat alle soorten import delen: het bestand lezen, kolommen herkennen, en de
 * uitkomst per regel. Zie index.ts voor het geheel.
 */

import { ApiError } from '../../middleware/errorHandler';
import { leesCsv } from '../../utils/csvLezen';

/** Meer regels per keer maakt het voorbeeld onleesbaar en de import traag. */
export const MAX_REGELS = 2000;

export type RegelStatus = 'nieuw' | 'bestaat' | 'fout';

export interface Beoordeling<T> {
  /** De rij in de spreadsheet: de kopregel is rij 1. */
  rij: number;
  status: RegelStatus;
  gegevens: T;
  fouten: string[];
  waarschuwingen: string[];
}

export interface Voorbeeld<T> {
  /** Per veld de kolomnaam uit het bestand waarin het gevonden is. */
  kolommen: Record<string, string>;
  /** Kolommen uit het bestand die bij geen veld horen; die worden niet gelezen. */
  genegeerd: string[];
  regels: Beoordeling<T>[];
  tellingen: Record<RegelStatus, number>;
}

export interface ImportUitkomst<T> extends Voorbeeld<T> {
  geimporteerd: number;
}

// ---------------------------------------------------------------------------
// Kolommen herkennen
// ---------------------------------------------------------------------------

/** Een kolomnaam zonder hoofdletters, accenten, spaties, streepjes en haakjes-inhoud. */
export function normaliseer(naam: string): string {
  return naam
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface Veld {
  namen: string[];
  verplicht?: boolean;
}

export function herkenKolommen(kopregel: string[], velden: Record<string, Veld>) {
  const index: Record<string, number> = {};
  const kolommen: Record<string, string> = {};
  const genegeerd: string[] = [];

  kopregel.forEach((kop, i) => {
    const genormaliseerd = normaliseer(kop);
    const veld = Object.entries(velden).find(
      ([sleutel, { namen }]) => !(sleutel in index) && namen.some((naam) => normaliseer(naam) === genormaliseerd),
    );
    if (veld) {
      index[veld[0]] = i;
      kolommen[veld[0]] = kop;
    } else if (kop !== '') {
      genegeerd.push(kop);
    }
  });

  const ontbrekend = Object.entries(velden)
    .filter(([sleutel, { verplicht }]) => verplicht && !(sleutel in index))
    .map(([sleutel, { namen }]) => `${sleutel} (${namen.slice(0, 3).join(', ')})`);
  if (ontbrekend.length > 0) {
    throw new ApiError(400, `Deze kolommen ontbreken in het bestand: ${ontbrekend.join('; ')}.`);
  }

  return { index, kolommen, genegeerd };
}

export function lees(csv: string) {
  const { kopregel, rijen } = leesCsv(csv);
  if (kopregel.length === 0) {
    throw new ApiError(400, 'Het bestand is leeg.');
  }
  if (rijen.length === 0) {
    throw new ApiError(400, 'Het bestand heeft alleen een kopregel en geen gegevens.');
  }
  if (rijen.length > MAX_REGELS) {
    throw new ApiError(400, `Het bestand heeft ${rijen.length} regels; per keer kunnen er ${MAX_REGELS}.`);
  }
  return { kopregel, rijen };
}

/** Een cel die meerdere waarden kan bevatten: "Trompet, Bugel" of "Trompet / Bugel". */
export function lijst(waarde: string): string[] {
  return waarde
    .split(/[,;/|]/)
    .map((deel) => deel.trim())
    .filter((deel) => deel !== '');
}

export function tel<T>(regels: Beoordeling<T>[]): Record<RegelStatus, number> {
  const tellingen: Record<RegelStatus, number> = { nieuw: 0, bestaat: 0, fout: 0 };
  for (const regel of regels) tellingen[regel.status]++;
  return tellingen;
}

/** Een `IN (...)` in stukken: sql.js staat niet onbeperkt veel parameters toe. */
export function inStukken<T>(waarden: string[], vraag: (stuk: string[]) => T[]): T[] {
  const uitkomst: T[] = [];
  for (let i = 0; i < waarden.length; i += 500) uitkomst.push(...vraag(waarden.slice(i, i + 500)));
  return uitkomst;
}

/**
 * Een waarde uit een vaste lijst, bij een van haar namen in drie talen.
 * `aliassen` koppelt de waarde aan de namen waaronder hij in een spreadsheet
 * staat; hoofdletters, spaties en accenten tellen niet mee.
 */
export function maakKeuze<T extends string>(aliassen: Record<T, string[]>): (tekst: string) => T | undefined {
  const kaart = new Map<string, T>();
  for (const [waarde, namen] of Object.entries(aliassen) as [T, string[]][]) {
    for (const naam of [waarde, ...namen]) kaart.set(normaliseer(naam), waarde);
  }
  return (tekst) => kaart.get(normaliseer(tekst));
}

/**
 * Een bedrag zoals het in een spreadsheet staat: "1.234,56", "€ 1234.56",
 * "1234". Zelfde regels als het inlezen van een bankbestand in
 * routes/accounting.ts: een komma is het decimaalteken, en dan zijn punten
 * duizendtallen. Wat niet te lezen is, geeft `undefined`.
 */
export function leesBedrag(tekst: string): number | undefined {
  const opgeschoond = tekst.replace(/[\s\u00a0]/g, '').replace(/€|EUR/gi, '');
  if (opgeschoond === '') return undefined;
  let normaal = opgeschoond;
  if (opgeschoond.includes(',')) normaal = opgeschoond.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(opgeschoond)) normaal = opgeschoond.replace(/\./g, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normaal)) return undefined;
  return Math.round(parseFloat(normaal) * 100) / 100;
}

/**
 * Een datum als JJJJ-MM-DD. Leest "2024-03-15" en de Nederlandse en Duitse
 * volgorde "15-03-2024", "15/3/2024" en "15.03.2024". Een datum die niet
 * bestaat (31 februari) of niet te lezen is, geeft `undefined`.
 */
export function leesDatum(tekst: string): string | undefined {
  const waarde = tekst.trim();
  let jaar: number, maand: number, dag: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(waarde);
  const europees = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(waarde);
  if (iso) [jaar, maand, dag] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (europees) [dag, maand, jaar] = [Number(europees[1]), Number(europees[2]), Number(europees[3])];
  else return undefined;

  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  if (datum.getUTCFullYear() !== jaar || datum.getUTCMonth() !== maand - 1 || datum.getUTCDate() !== dag) {
    return undefined;
  }
  return datum.toISOString().slice(0, 10);
}
