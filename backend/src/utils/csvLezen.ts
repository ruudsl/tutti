/**
 * Een CSV-bestand inlezen, zoals een spreadsheet het opslaat.
 *
 * De tegenhanger van `utils/csv.ts`. Wat hier binnenkomt is meestal door Excel,
 * LibreOffice of Google Sheets gemaakt, en die verschillen:
 *
 * - Excel in Nederland en Duitsland zet een puntkomma tussen de velden, Google
 *   Sheets een komma, en een export uit een ander programma soms een tab.
 * - Excel zet een BOM vooraan en eindigt regels met CRLF.
 * - Een veld met een scheidingsteken, aanhalingsteken of regelovergang staat
 *   tussen aanhalingstekens, met `""` voor een aanhalingsteken erin (RFC 4180).
 * - Onze eigen export zet een apostrof voor een cel die als formule gelezen zou
 *   worden (`'=...`). Die apostrof is geen inhoud en gaat er hier weer af.
 *
 * Een Excel-bestand (.xlsx) zelf wordt niet gelezen: daarvoor zou een extra
 * bibliotheek nodig zijn, en elk spreadsheetprogramma kan als CSV opslaan.
 */

export type LeesScheidingsteken = ',' | ';' | '\t';

/** Het grootste bestand dat gelezen wordt, in tekens: ruim boven 2000 regels. */
export const MAX_TEKENS = 5_000_000;

export interface GelezenCsv {
  scheidingsteken: LeesScheidingsteken;
  kopregel: string[];
  /** De regels onder de kopregel; lege regels zijn weggelaten. */
  rijen: string[][];
}

/** Een apostrof die onze export voor een formuleteken zette. */
const BESCHERMDE_FORMULE = /^'([=+\-@\t\r].*)$/s;

/**
 * Het scheidingsteken van dit bestand: het teken dat buiten aanhalingstekens
 * het vaakst in de eerste regel staat.
 */
export function raadScheidingsteken(tekst: string): LeesScheidingsteken {
  const tellingen: Record<LeesScheidingsteken, number> = { ',': 0, ';': 0, '\t': 0 };
  let binnenAanhalingstekens = false;
  for (const teken of tekst) {
    if (teken === '"') binnenAanhalingstekens = !binnenAanhalingstekens;
    else if (!binnenAanhalingstekens && (teken === '\n' || teken === '\r')) break;
    else if (!binnenAanhalingstekens && teken in tellingen) tellingen[teken as LeesScheidingsteken]++;
  }
  // Bij gelijke stand wint de puntkomma: dat is wat Excel hier opslaat.
  const volgorde: LeesScheidingsteken[] = [';', ',', '\t'];
  return volgorde.reduce((beste, kandidaat) => (tellingen[kandidaat] > tellingen[beste] ? kandidaat : beste), ';');
}

/** De cellen van het hele bestand, regel voor regel. */
function splits(tekst: string, scheidingsteken: LeesScheidingsteken): string[][] {
  const regels: string[][] = [];
  let regel: string[] = [];
  let veld = '';
  let binnenAanhalingstekens = false;
  let i = 0;

  const sluitVeld = () => {
    const match = BESCHERMDE_FORMULE.exec(veld);
    regel.push(match ? match[1] : veld);
    veld = '';
  };
  const sluitRegel = () => {
    sluitVeld();
    regels.push(regel);
    regel = [];
  };

  while (i < tekst.length) {
    const teken = tekst[i];
    if (binnenAanhalingstekens) {
      if (teken === '"') {
        if (tekst[i + 1] === '"') {
          veld += '"';
          i += 2;
          continue;
        }
        binnenAanhalingstekens = false;
      } else {
        veld += teken;
      }
      i++;
      continue;
    }

    if (teken === '"' && veld === '') {
      binnenAanhalingstekens = true;
    } else if (teken === scheidingsteken) {
      sluitVeld();
    } else if (teken === '\r' || teken === '\n') {
      sluitRegel();
      if (teken === '\r' && tekst[i + 1] === '\n') i++;
    } else {
      veld += teken;
    }
    i++;
  }
  if (veld !== '' || regel.length > 0) sluitRegel();

  return regels;
}

/**
 * Lees een CSV-bestand. De eerste niet-lege regel is de kopregel.
 *
 * Witruimte rond een veld gaat eraf. Lege regels, ook regels met alleen
 * scheidingstekens (Excel laat die achter onder een tabel), vallen weg.
 */
export function leesCsv(invoer: unknown): GelezenCsv {
  // De route controleert dit ook, met Zod. Hier nog een keer, omdat de lezer
  // teken voor teken loopt tot de lengte van wat hij krijgt: een object met
  // een verzonnen `length` in plaats van tekst liet hem eindeloos doorlopen.
  if (typeof invoer !== 'string') {
    throw new TypeError('Een CSV-bestand wordt als tekst gelezen.');
  }
  if (invoer.length > MAX_TEKENS) {
    throw new RangeError(`Een CSV-bestand mag hooguit ${MAX_TEKENS} tekens hebben.`);
  }
  const tekst = invoer.replace(/^\uFEFF/, '');
  const scheidingsteken = raadScheidingsteken(tekst);
  const regels = splits(tekst, scheidingsteken)
    .map((regel) => regel.map((veld) => veld.trim()))
    .filter((regel) => regel.some((veld) => veld !== ''));

  const [kopregel = [], ...rijen] = regels;
  return { scheidingsteken, kopregel, rijen };
}
